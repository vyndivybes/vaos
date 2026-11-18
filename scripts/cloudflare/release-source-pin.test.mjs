import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const workflow=read('../../.github/workflows/jarvis-controlled-release.yml');
const manifest=JSON.parse(read('../../package.json'));
const lock=JSON.parse(read('../../package-lock.json'));

test('controlled Cloudflare release resolves the exact locally installed locked Wrangler',()=>{
  const declared=manifest.devDependencies?.wrangler;
  assert.match(declared,/^\d+\.\d+\.\d+$/,'Wrangler version must be pinned, not a range');
  assert.equal(lock.packages?.['']?.devDependencies?.wrangler,declared);
  assert.equal(lock.packages?.['node_modules/wrangler']?.version,declared);
  assert.match(workflow,/run: npx --no-install wrangler deploy --config wrangler\.jsonc/);
  assert.doesNotMatch(workflow,/npx\s+(?:--yes\s+)?wrangler@/,'Avoid a second, unreviewed Wrangler download');
});

test('release preserves SHA fence, protected environment, and regression admission',()=>{
  assert.match(workflow,/environment: production-deploy/);
  assert.match(workflow,/Recheck main before deployment/);
  assert.match(workflow,/Require exact reviewed main and existing credential/);
  assert.match(workflow,/node --test scripts\/cloudflare\/release-source-pin\.test\.mjs/);
  assert.match(workflow,/name: Full regression before release\n\s+run: npm test/);
});
