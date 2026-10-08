import fs from 'node:fs';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';
import { createInfisicalApiTransport } from '../../integrations/infisical/api-transport.mjs';
import { verifyWindmillInfisicalCredential } from '../../integrations/windmill/credential-preflight.mjs';

const required = name => {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error('missing configuration'), { code: 'WINDMILL_PREFLIGHT_MISSING_' + name });
  }
  return value.trim();
};

async function main() {
  // Restrict outbound requests to the Infisical Cloud API; no Windmill calls.
  const baseUrl = process.env.INFISICAL_BASE_URL || 'https://us.infisical.com';
  if (!['https://us.infisical.com', 'https://eu.infisical.com'].includes(baseUrl)) {
    throw Object.assign(new Error('unapproved API endpoint'), { code: 'WINDMILL_PREFLIGHT_API_ORIGIN_UNAPPROVED' });
  }
  const transport = createInfisicalApiTransport({
    baseUrl,
    httpTransport: createGovernedHttpTransport({ allowedOrigins: [baseUrl] }),
  });
  const check = await verifyWindmillInfisicalCredential({
    transport,
    clientId: required('WINDMILL_INFISICAL_CLIENT_ID'),
    clientSecret: required('WINDMILL_INFISICAL_CLIENT_SECRET'),
    projectId: required('WINDMILL_INFISICAL_PROJECT_ID'),
    qualificationProjectId: required('INFISICAL_PROJECT_ID'),
  });

  // Do not persist tokens, secret values, client IDs or secrets, even as hashes.
  const evidence = {
    schemaVersion: 'vaos.windmill-infisical-preflight.v1',
    providerId: 'windmill',
    phase: 'credential-read-only',
    productionActivation: false,
    scriptExecuted: false,
    check,
    source: {
      repository: required('GITHUB_REPOSITORY'),
      commitSha: required('GITHUB_SHA'),
      runId: required('GITHUB_RUN_ID'),
    },
  };
  const folder = 'qualification-evidence/windmill-infisical';
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(folder + '/credential-preflight.json', JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write('Windmill Infisical credential-read/isolation preflight PASS. No token logged, no Windmill execution.\n');
}

try {
  await main();
} catch (error) {
  // Never stringify or print transport errors: they may contain sensitive data.
  const code = typeof error?.code === 'string' && /^WINDMILL_[A-Z0-9_]+$/.test(error.code)
    ? error.code : 'WINDMILL_INFISICAL_PREFLIGHT_FAILED';
  process.stderr.write('::error::' + code + '\n');
  process.exitCode = 1;
}
