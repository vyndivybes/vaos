import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Wave 2 live runner binds denied probe to an optional separate project',()=>{
  const source=fs.readFileSync(new URL('./infisical-wave2-live.mjs',import.meta.url),'utf8');
  assert.match(source,/const deniedProjectId=process\.env\.INFISICAL_DENIED_PROJECT_ID\|\|projectId;/);
  assert.match(source,/deniedProbe:\{projectId:deniedProjectId,environment,secretPath:deniedSecretPath,secretKey:deniedSecretKey\}/);
});
test('Wave 2 Actions workflow forwards the denied project variable',()=>{
  const source=fs.readFileSync(new URL('../../.github/workflows/provider-wave2-infisical-live-qualification.yml',import.meta.url),'utf8');
  assert.match(source,/INFISICAL_DENIED_PROJECT_ID:\s*\$\{\{\s*vars\.INFISICAL_DENIED_PROJECT_ID\s*\}\}/);
});
test('free-plan documentation forbids interpreting nonexistent secret as denial',()=>{
  const source=fs.readFileSync(new URL('../../docs/provider-qualification/infisical-wave2-setup.md',import.meta.url),'utf8');
  assert.match(source,/A 404 for a nonexistent secret is \*\*not\*\* evidence of access denial/);
});
