import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

test('rotation preflight uses next credential but no revoked old credential',()=>{
  const workflow=read('../../.github/workflows/provider-wave2-infisical-rotation-preflight.yml');
  assert.match(workflow,/INFISICAL_CLIENT_SECRET:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_SECRET\s*\}\}/);
  assert.match(workflow,/INFISICAL_CLIENT_ID:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_ID\s*\}\}/);
  assert.doesNotMatch(workflow,/INFISICAL_REVOKED_CLIENT_SECRET/);
  assert.match(workflow,/infisical-wave2-live\.mjs/);
});

test('production run uses NEXT as current, original repository secret as revoked',()=>{
  const workflow=read('../../.github/workflows/provider-wave2-infisical-production-qualification.yml');
  assert.match(workflow,/INFISICAL_CLIENT_SECRET:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_SECRET\s*\}\}/);
  assert.match(workflow,/INFISICAL_REVOKED_CLIENT_SECRET:\s*\$\{\{\s*secrets\.INFISICAL_CLIENT_SECRET\s*\}\}/);
  assert.match(workflow,/INFISICAL_CLIENT_ID:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_ID\s*\}\}/);
  assert.match(workflow,/INFISICAL_REVOKED_CLIENT_ID:\s*\$\{\{\s*secrets\.INFISICAL_CLIENT_ID\s*\}\}/);
  assert.doesNotMatch(workflow,/secrets\.INFISICAL_REVOKED_CLIENT_SECRET/);
});
