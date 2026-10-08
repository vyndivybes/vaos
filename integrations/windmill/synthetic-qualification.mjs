import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createWindmillCodeAdapter } from './code-adapter.mjs';

export const SYNTHETIC_SCRIPT_PATH = 'f/vaos/qualification_ping';
const BINDING = 'secret:windmill:synthetic-qualification';
const MARKER = 'VAOS_WINDMILL_SYNTHETIC_V1';
const fail = code => Object.assign(new Error(code), { code });

/**
 * Explicit qualification harness only. An in-memory qualified registry is
 * created for a single synthetic script; it is never written to VAOS runtime,
 * provider manifests, or production control-plane storage.
 */
export async function qualifyWindmillSyntheticExecution({
  credentialBroker, transport, challenge,
  scriptPath = SYNTHETIC_SCRIPT_PATH,
} = {}) {
  if (scriptPath !== SYNTHETIC_SCRIPT_PATH) throw fail('WINDMILL_SYNTHETIC_SCRIPT_NOT_ALLOWED');
  if (typeof challenge !== 'string' || !/^[a-f0-9]{32,64}$/.test(challenge)) {
    throw fail('WINDMILL_SYNTHETIC_CHALLENGE_INVALID');
  }
  const registry = createCapabilityRegistry({ providers: [{
    schemaVersion: 'vaos.provider.v1',
    providerId: 'windmill',
    displayName: 'Windmill qualification-only',
    capabilities: ['code.execute'],
    deploymentModes: ['managed-saas'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['code.execute'],
      evidenceRefs: ['synthetic:qualification:local-only'],
    },
    security: { dataEgress: 'controlled', secretBinding: 'required', authModes: ['bearer'], callbackVerification: 'none' },
    execution: { verificationStrategy: 'provider-readback', idempotency: 'not-supported' },
  }] });
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: registry,
    credentialBroker,
    transport,
    config: {
      baseUrl: 'https://app.windmill.dev',
      workspace: 'vaos',
      secretBindingRef: BINDING,
      scripts: { 'qualification.ping': SYNTHETIC_SCRIPT_PATH },
      dispatchTimeoutMs: 15000,
      completionTimeoutMs: 60000,
      maxResultBytes: 4096,
    },
  });
  const result = await adapter.execute({
    id: 'windmill-qualification-' + challenge,
    intentId: 'windmill-synthetic-qualification',
    actionType: 'CODE.RUN_SCRIPT',
    payload: { scriptKey: 'qualification.ping', args: { challenge } },
  });
  const output = result.effect?.output;
  if (!output || output.qualification !== MARKER || output.challenge !== challenge) {
    throw fail('WINDMILL_SYNTHETIC_OUTPUT_INVALID');
  }
  if (!result.verification?.verified || result.verification.scriptPath !== SYNTHETIC_SCRIPT_PATH ||
      result.verification.resourceId !== result.effect.resourceId) {
    throw fail('WINDMILL_SYNTHETIC_READBACK_INVALID');
  }
  // Raw output and challenge do not enter the evidence bundle.
  return Object.freeze({
    status: 'PASS',
    providerId: 'windmill',
    scriptPath: SYNTHETIC_SCRIPT_PATH,
    jobId: result.verification.resourceId,
    verifiedBy: 'windmill.api.job-readback',
    scriptExecuted: true,
    productionActivation: false,
  });
}
