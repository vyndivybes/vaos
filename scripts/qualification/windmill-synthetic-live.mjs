import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';
import { createInfisicalApiTransport } from '../../integrations/infisical/api-transport.mjs';
import { verifyWindmillInfisicalCredential } from '../../integrations/windmill/credential-preflight.mjs';
import { createInfisicalSecretResolver } from '../../integrations/infisical/secret-resolver.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createWindmillSyntheticHttpTransport } from '../../integrations/windmill/synthetic-http-transport.mjs';
import { qualifyWindmillSyntheticExecution } from '../../integrations/windmill/synthetic-qualification.mjs';

const required = key => {
  const val = process.env[key];
  if (typeof val !== 'string' || !val.trim()) {
    throw Object.assign(new Error('missing setting'), { code: 'WINDMILL_SYNTHETIC_MISSING_CONFIG' });
  }
  return val.trim();
};
async function main() {
  if (process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.WINDMILL_SYNTHETIC_CONFIRM !== 'RUN_ONE_SYNTHETIC') {
    throw Object.assign(new Error('not authorized'), { code: 'WINDMILL_SYNTHETIC_NOT_AUTHORIZED' });
  }
  const baseUrl = process.env.INFISICAL_BASE_URL || 'https://us.infisical.com';
  if (!['https://us.infisical.com', 'https://eu.infisical.com'].includes(baseUrl)) {
    throw Object.assign(new Error('origin denied'), { code: 'WINDMILL_SYNTHETIC_INFISICAL_ORIGIN_DENIED' });
  }
  const projectId = required('WINDMILL_INFISICAL_PROJECT_ID');
  const qualificationProjectId = required('INFISICAL_PROJECT_ID');
  const clientId = required('WINDMILL_INFISICAL_CLIENT_ID');
  const clientSecret = required('WINDMILL_INFISICAL_CLIENT_SECRET');

  const infisical = createInfisicalApiTransport({
    baseUrl,
    httpTransport: createGovernedHttpTransport({ allowedOrigins: [baseUrl], maxResponseBytes: 65536 }),
  });
  const preflight = await verifyWindmillInfisicalCredential({
    transport: infisical, clientId, clientSecret, projectId, qualificationProjectId,
  });
  const audit = [];
  const broker = createCredentialBroker({
    resolveCredential: createInfisicalSecretResolver({
      bootstrapIdentity: async () => ({ clientId, clientSecret }),
      transport: infisical,
      config: {
        bindings: {
          'secret:windmill:synthetic-qualification': {
            projectId,
            environment: 'prod',
            secretPath: '/',
            secretKey: 'WINDMILL_API_TOKEN',
            providerId: 'windmill',
            capabilities: ['code.execute'],
            kind: 'bearer',
          },
        },
        leaseTtlSeconds: 900,
      },
      recordAudit: async event => audit.push({ type: event.type }),
    }),
    recordAudit: async event => audit.push({ eventType: event.eventType }),
  });
  const challenge = randomBytes(16).toString('hex');
  const transport = createWindmillSyntheticHttpTransport({
    httpTransport: createGovernedHttpTransport({
      allowedOrigins: ['https://app.windmill.dev'],
      maxRequestBytes: 1024,
      maxResponseBytes: 65536,
    }),
  });
  const result = await qualifyWindmillSyntheticExecution({
    credentialBroker: broker,
    transport,
    challenge,
  });
  const evidence = {
    schemaVersion: 'vaos.windmill.synthetic-qualification.v1',
    providerId: 'windmill',
    phase: 'synthetic-live',
    credentialRead: preflight.credentialRead,
    qualificationIsolation: preflight.qualificationIsolation,
    ...result,
    auditEvents: audit.map(event => event.type || event.eventType),
    source: {
      repository: required('GITHUB_REPOSITORY'),
      commitSha: required('GITHUB_SHA'),
      runId: required('GITHUB_RUN_ID'),
    },
  };
  // Never persist or log Client Secrets, Windmill tokens, Infisical access
  // tokens, or synthetic challenges, including hashes or partial values.
  const path = 'qualification-evidence/windmill/synthetic-live.json';
  fs.mkdirSync('qualification-evidence/windmill', { recursive: true });
  fs.writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write('PASS: Windmill synthetic dispatch, independent job readback, and output challenge verified. Production routing unchanged.\n');
}
try {
  await main();
} catch (error) {
  // Never output raw HTTP response bodies, errors, headers, credential values
  // or exception stacks into runner logs.
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{4,100}$/.test(error.code)
    ? error.code : 'WINDMILL_SYNTHETIC_QUALIFICATION_FAILED';
  process.stderr.write('::error::' + code + '\n');
  process.exitCode = 1;
}
