import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('authenticated workspace links to the visual command centre',()=>{
 const workspace=read('./workspace.html');
 const page=read('./visual-command.html');
 assert.match(workspace,/href="\/visual-command\.html"/);
 assert.match(page,/id="vc-main" hidden/);
 assert.match(page,/id="business-intelligence"/);
 assert.match(page,/id="vc-native-host"/);
 assert.doesNotMatch(page,/<iframe\\b/i);
 assert.match(page,/src="\/visual-command\.mjs"/);
});

test('visual browser module is present in the static Cloudflare asset closure',()=>{
 const ignore=read('./.assetsignore');
 const worker=read('./cloudflare-worker.mjs');
 assert.match(ignore,/!lib\/visual-command-model\.mjs/);
 assert.match(worker,/\/visual-command\.html/);
});

test('visual switching is session gated and reuses the existing BI entrypoint',()=>{
 const source=read('./visual-command.mjs');
 assert.match(source,/fetch\('\/api\/session'/);
 assert.match(source,/session\.authenticated!==true/);
 assert.match(source,/await import\('\.\/bi-entry\.mjs'\)/);
 assert.match(source,/resolveVisualMode/);
 assert.match(source,/visual-command-native\\.mjs/);
 assert.doesNotMatch(source,/frame\\.src/);
 assert.doesNotMatch(source,/fetch\([^)]*method:\s*['"]POST/);
});
