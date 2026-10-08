const fail = code => Object.assign(new Error(code), { code });
export const WINDMILL_LIVE_BASE_URL = 'https://app.windmill.dev';
export const WINDMILL_LIVE_WORKSPACE = 'vaos';
export const WINDMILL_LIVE_SCRIPT = 'f/vaos/qualification_ping';
const allowedDispatchUrl = WINDMILL_LIVE_BASE_URL + '/api/w/' + WINDMILL_LIVE_WORKSPACE +
  '/jobs/run/p/' + WINDMILL_LIVE_SCRIPT;
const jobUrlPrefix = WINDMILL_LIVE_BASE_URL + '/api/w/' + WINDMILL_LIVE_WORKSPACE + '/jobs_u/get/';
const isJobId = v => typeof v === 'string' && /^[a-zA-Z0-9-]{8,90}$/.test(v);

/** Fixed-path HTTP transport for a single VAOS synthetic job. Never retries POST. */
export function createWindmillSyntheticHttpTransport({
  httpTransport,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxPolls = 45,
} = {}) {
  if (typeof httpTransport?.request !== 'function' || typeof sleep !== 'function' ||
      !Number.isInteger(maxPolls) || maxPolls < 1 || maxPolls > 45) {
    throw fail('WINDMILL_SYNTHETIC_TRANSPORT_INVALID');
  }
  return Object.freeze({
    async runScript(request) {
      if (request?.url !== allowedDispatchUrl || request?.method !== 'POST' ||
          typeof request?.headers?.Authorization !== 'string' ||
          typeof request?.body?.challenge !== 'string' ||
          Object.keys(request.body).length !== 1) {
        throw fail('WINDMILL_SYNTHETIC_DISPATCH_REJECTED');
      }
      return httpTransport.request({
        url: allowedDispatchUrl,
        method: 'POST',
        headers: request.headers,
        body: request.body,
        timeoutMs: Math.min(Number(request.timeoutMs) || 15000, 15000),
        allowedResponseTypes: ['text/plain', 'application/json'],
      });
    },
    async waitForJob(request) {
      if (!isJobId(request?.jobId) ||
          request?.url !== jobUrlPrefix + encodeURIComponent(request.jobId) ||
          typeof request?.headers?.Authorization !== 'string') {
        throw fail('WINDMILL_SYNTHETIC_READBACK_REJECTED');
      }
      for (let poll = 0; poll < maxPolls; poll++) {
        const response = await httpTransport.request({
          url: request.url,
          method: 'GET',
          headers: request.headers,
          timeoutMs: 6000,
          allowedResponseTypes: ['application/json'],
        });
        if (response.status === 401 || response.status === 403) {
          throw fail('WINDMILL_SYNTHETIC_READBACK_FORBIDDEN');
        }
        if (response.status === 200 && response.body?.success !== undefined) {
          return response.body;
        }
        if (!([200, 202, 404].includes(response.status))) {
          throw fail('WINDMILL_SYNTHETIC_READBACK_FAILED');
        }
        if (poll < maxPolls - 1) await sleep(1200);
      }
      throw fail('WINDMILL_SYNTHETIC_JOB_NOT_COMPLETE');
    },
  });
}
