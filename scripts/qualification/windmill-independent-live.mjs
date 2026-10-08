import fs from 'node:fs';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';
import { verifyWindmillJobIndependently } from '../../integrations/windmill/independent-verifier.mjs';

const requireText = key => {
  const value = process.env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error('MISSING_' + key);
  return value.trim();
};
async function main() {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('NOT_MAIN_MANUAL_RUN');
  const sourceRunId = requireText('WINDMILL_SOURCE_RUN_ID');
  const sourceEvidence = JSON.parse(fs.readFileSync(
    'source-evidence/qualification-evidence/windmill/synthetic-live.json', 'utf8'
  ));
  const result = await verifyWindmillJobIndependently({
    httpTransport: createGovernedHttpTransport({
      allowedOrigins: ['https://app.windmill.dev'],
      maxRequestBytes: 512,
      maxResponseBytes: 65536,
    }),
    readToken: requireText('WINDMILL_VERIFIER_READ_TOKEN'),
    sourceEvidence,
    sourceRunId,
  });
  const evidence = {
    ...result,
    sourceWorkflowRunId: sourceRunId,
    verifierWorkflowRunId: requireText('GITHUB_RUN_ID'),
    verifierCommitSha: requireText('GITHUB_SHA'),
    separatelyCredentialed: true,
    liveCancellationQualified: false,
    durableQueueQualified: false,
    productionActivation: false,
  };
  fs.mkdirSync('qualification-evidence/windmill', { recursive: true });
  fs.writeFileSync('qualification-evidence/windmill/independent.json',
    JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write('PASS: independent read-only Windmill job verification. Production routing unchanged.\n');
}
try { await main(); }
catch (error) {
  // No raw provider errors, bodies, headers or authorization tokens in logs.
  const safe = typeof error?.code === 'string' && /^WINDMILL_[A-Z0-9_]+$/.test(error.code)
    ? error.code : 'WINDMILL_INDEPENDENT_VERIFICATION_FAILED';
  process.stderr.write('::error::' + safe + '\n');
  process.exitCode = 1;
}
