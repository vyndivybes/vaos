import {
  VYNDI_BRIDGE_AUDIENCE,
  VYNDI_BRIDGE_KEY_ID,
  VYNDI_BRIDGE_METHOD,
  VYNDI_BRIDGE_PATH,
  VYNDI_BRIDGE_PROTOCOL_VERSION,
  VYNDI_BRIDGE_SERVICE_IDENTITY,
  canonicalBridgeSignatureInput,
} from './vyndi-read-bridge-client.mjs';

export const VYNDI_WRITE_QUALIFICATION_PROFILE = 'COMMERCIAL_WRITE_CANARY_V1';
export const VYNDI_WRITE_QUALIFICATION_PURPOSE = 'write-qualify';

function terminalError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw terminalError(code);
  return value.trim();
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export function createVyndiWriteQualificationClient({
  signer,
  serviceBinding,
  now = () => Date.now(),
  nonce = () => crypto.randomUUID().replace(/-/g, ''),
} = {}) {
  if (!signer || typeof signer.signVyndiBridgeRequest !== 'function') {
    throw terminalError('VYNDI_BRIDGE_SIGNER_REQUIRED');
  }
  if (!serviceBinding || typeof serviceBinding.fetch !== 'function') {
    throw terminalError('VYNDI_SERVICE_BINDING_REQUIRED');
  }

  return Object.freeze({
    async execute(job) {
      if (job?.actionType !== 'COMMERCIAL.COMMIT_ORDER') {
        throw terminalError('VYNDI_WRITE_QUALIFICATION_SCOPE_DENIED');
      }
      if (
        job?.payload?.writeQualification !== true
        || job?.payload?.qualificationProfile !== VYNDI_WRITE_QUALIFICATION_PROFILE
      ) {
        throw terminalError('VYNDI_WRITE_QUALIFICATION_PROFILE_REQUIRED');
      }

      const control = job?.payload?._vaosControl;
      if (!control || typeof control !== 'object' || Array.isArray(control)) {
        throw terminalError('VYNDI_WRITE_QUALIFICATION_CONTROL_REQUIRED');
      }

      const idempotencyKey = requiredText(control.idempotencyKey, 'VYNDI_WRITE_QUALIFICATION_IDEMPOTENCY_REQUIRED');
      const approvalId = requiredText(control.approvalId, 'VYNDI_WRITE_QUALIFICATION_APPROVAL_REQUIRED');
      const requestedBy = requiredText(control.requestedBy, 'VYNDI_WRITE_QUALIFICATION_REQUESTER_REQUIRED');
      const approvedBy = requiredText(control.approvedBy, 'VYNDI_WRITE_QUALIFICATION_APPROVER_REQUIRED');

      if (requestedBy.toLowerCase() === approvedBy.toLowerCase()) {
        throw terminalError('VYNDI_WRITE_QUALIFICATION_SOD_REQUIRED');
      }

      const executionJobId = requiredText(job?.id, 'VYNDI_WRITE_QUALIFICATION_JOB_REQUIRED');
      const intentId = requiredText(job?.intentId, 'VYNDI_WRITE_QUALIFICATION_INTENT_REQUIRED');
      const canaryId = `VAOS-CANARY-SO-${executionJobId}`;
      const input = Object.freeze({
        id: canaryId,
        month: 36,
        product: 'aluminium',
        units: 1,
        aspLakh: 0,
        channel: 'direct',
        status: 'lead',
      });

      const [requestedByHash, approvedByHash] = await Promise.all([
        sha256Hex(requestedBy.trim().toLowerCase()),
        sha256Hex(approvedBy.trim().toLowerCase()),
      ]);

      const body = JSON.stringify({
        protocolVersion: VYNDI_BRIDGE_PROTOCOL_VERSION,
        serviceIdentity: VYNDI_BRIDGE_SERVICE_IDENTITY,
        audience: VYNDI_BRIDGE_AUDIENCE,
        method: VYNDI_BRIDGE_METHOD,
        path: VYNDI_BRIDGE_PATH,
        purpose: VYNDI_WRITE_QUALIFICATION_PURPOSE,
        actionType: job.actionType,
        employeeId: 'commercial',
        intentId,
        executionJobId,
        approvalId,
        missionId: `write-qualification:${intentId}`,
        qualificationProfile: VYNDI_WRITE_QUALIFICATION_PROFILE,
        idempotencyKey,
        requestedByHash,
        approvedByHash,
        input,
      });

      const timestamp = String(now());
      const requestNonce = nonce();
      const bodySha256 = await sha256Hex(body);
      const canonical = canonicalBridgeSignatureInput({
        timestamp,
        nonce: requestNonce,
        bodySha256,
      });

      const signed = await signer.signVyndiBridgeRequest({
        keyId: VYNDI_BRIDGE_KEY_ID,
        canonical,
      });
      if (!signed || signed.keyId !== VYNDI_BRIDGE_KEY_ID || typeof signed.signature !== 'string') {
        throw terminalError('VYNDI_BRIDGE_SIGNATURE_UNAVAILABLE');
      }

      const response = await serviceBinding.fetch(`https://vyndi.service${VYNDI_BRIDGE_PATH}`, {
        method: VYNDI_BRIDGE_METHOD,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-vaos-key-id': signed.keyId,
          'x-vaos-timestamp': timestamp,
          'x-vaos-nonce': requestNonce,
          'x-vaos-body-sha256': bodySha256,
          'x-vaos-signature': signed.signature,
        },
        body,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = terminalError(
          'VYNDI_WRITE_QUALIFICATION_FAILED',
          `VYNDI_WRITE_QUALIFICATION_FAILED:${response.status}:${payload?.error || 'unknown'}`,
        );
        error.retryable = response.status >= 500;
        throw error;
      }

      const verified = Boolean(
        payload
        && payload.ok === true
        && payload.qualificationOnly === true
        && payload.readOnly === false
        && payload.actionType === job.actionType
        && payload.sourceAuthority === 'saveSalesOrder'
        && payload.qualificationProfile === VYNDI_WRITE_QUALIFICATION_PROFILE
        && payload.canaryId === canaryId
        && payload.outcome === 'COMPENSATED'
        && payload.finalState === 'cancelled'
        && Number.isInteger(Number(payload.initialRevision))
        && Number.isInteger(Number(payload.finalRevision))
        && Number(payload.finalRevision) > Number(payload.initialRevision)
      );
      if (!verified) throw terminalError('VYNDI_WRITE_QUALIFICATION_VERIFICATION_MISMATCH');

      return Object.freeze({
        actionType: job.actionType,
        employeeId: 'commercial',
        sourceAuthority: 'saveSalesOrder',
        qualificationProfile: VYNDI_WRITE_QUALIFICATION_PROFILE,
        approvalId,
        canaryId,
        outcome: payload.outcome,
        finalState: payload.finalState,
        initialRevision: Number(payload.initialRevision),
        finalRevision: Number(payload.finalRevision),
        nonce: requestNonce,
        bodySha256,
      });
    },
  });
}
