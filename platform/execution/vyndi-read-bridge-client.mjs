import { getVyndiBridgeRoute } from '../../packages/contracts/vyndi-write-bridge.mjs';

export const VYNDI_BRIDGE_KEY_ID = 'vyndi-primary-p256-v1';

function terminalError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export function canonicalBridgeSignatureInput({ timestamp, nonce, bodySha256 }) {
  return `${timestamp}\n${nonce}\n${bodySha256}`;
}

export function createVyndiReadBridgeClient({
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
      const route = getVyndiBridgeRoute(job?.actionType);
      if (!route || route.effectClass !== 'read' || route.executionEnabled !== true) {
        throw terminalError('VYNDI_READ_ROUTE_NOT_COMMISSIONED');
      }

      const body = JSON.stringify({
        actionType: job.actionType,
        employeeId: route.employeeId,
        intentId: job.intentId,
        executionJobId: job.id,
        missionId: String(job.payload?.missionId || `ad-hoc:${job.intentId}`),
        input: {
          limit: Number.isInteger(job.payload?.limit) ? job.payload.limit : 50,
        },
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

      const response = await serviceBinding.fetch('https://vyndi.service/api/vaos/bridge', {
        method: 'POST',
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
          'VYNDI_BRIDGE_READ_FAILED',
          `VYNDI_BRIDGE_READ_FAILED:${response.status}:${payload?.error || 'unknown'}`,
        );
        error.retryable = response.status >= 500;
        throw error;
      }
      if (!payload || payload.ok !== true || payload.readOnly !== true) {
        throw terminalError('VYNDI_BRIDGE_RESPONSE_INVALID');
      }
      if (payload.actionType !== job.actionType || payload.sourceAuthority !== route.authority) {
        throw terminalError('VYNDI_BRIDGE_AUTHORITY_MISMATCH');
      }

      return Object.freeze({
        actionType: job.actionType,
        employeeId: route.employeeId,
        sourceAuthority: route.authority,
        nonce: requestNonce,
        bodySha256,
        data: payload.data,
      });
    },
  });
}
