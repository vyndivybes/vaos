const fail = code => Object.assign(new Error(code), { code });
const SCRIPT = 'f/vaos/qualification_ping';
const REPO = 'vyndivybes/vaos';
const BASE = 'https://app.windmill.dev/api/w/vaos/jobs_u/get/';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,90}$/.test(value);

/** Verify a previously completed job using a distinct, read-only Windmill credential. */
export async function verifyWindmillJobIndependently({
  httpTransport, readToken, sourceEvidence, sourceRunId,
} = {}) {
  const source = sourceEvidence;
  if (!source || source.schemaVersion !== 'vaos.windmill.synthetic-qualification.v1' ||
    source.providerId !== 'windmill' || source.status !== 'PASS' ||
    source.productionActivation !== false || source.scriptExecuted !== true ||
    source.scriptPath !== SCRIPT || !validId(source.jobId) ||
    source.source?.repository !== REPO ||
    !/^[a-f0-9]{40}$/.test(source.source?.commitSha ?? '') ||
    !/^[0-9]{6,20}$/.test(sourceRunId ?? '') ||
    source.source?.runId !== sourceRunId) {
    throw fail('WINDMILL_INDEPENDENT_EVIDENCE_INVALID');
  }
  if (typeof readToken !== 'string' || !readToken.trim() ||
      typeof httpTransport?.request !== 'function') {
    throw fail('WINDMILL_INDEPENDENT_VERIFIER_NOT_CONFIGURED');
  }
  let response;
  try {
    response = await httpTransport.request({
      url: BASE + encodeURIComponent(source.jobId),
      method: 'GET',
      headers: { Authorization: 'Bearer ' + readToken, Accept: 'application/json' },
      timeoutMs: 10000,
      allowedResponseTypes: ['application/json'],
    });
  } catch {
    throw fail('WINDMILL_INDEPENDENT_READBACK_UNAVAILABLE');
  }
  if (response?.status !== 200) throw fail('WINDMILL_INDEPENDENT_READBACK_FAILED');
  const job = response.body;
  if (job?.id !== source.jobId || job?.script_path !== SCRIPT ||
      job?.success !== true || job?.result?.qualification !== 'VAOS_WINDMILL_SYNTHETIC_V1') {
    throw fail('WINDMILL_INDEPENDENT_JOB_MISMATCH');
  }
  return Object.freeze({
    schemaVersion: 'vaos.windmill.independent-verification.v1',
    providerId: 'windmill',
    status: 'PASS',
    sourceRunId,
    sourceCommitSha: source.source.commitSha,
    jobId: source.jobId,
    scriptPath: SCRIPT,
    verifier: 'separate-read-only-Windmill-token',
    verificationMethod: 'GET /jobs_u/get/{jobId}',
    productionActivation: false,
    scriptExecuted: false,
  });
}
