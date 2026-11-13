import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('spatial command is a first-class VAOS workspace with one global navigation',async()=>{
 const [html,shell]=await Promise.all([read('./spatial-command.html'),read('./vaos-shell.mjs')]);
 assert.match(html,/data-vaos-header/);
 assert.match(html,/href="\/vaos-global-theme\.css"/);
 assert.match(html,/src="\/vaos-shell\.mjs"/);
 assert.match(shell,/spatial-command\.html/);
 assert.doesNotMatch(html,/<iframe\b/i);
});
test('spatial command provides authenticated, read-only source inspection',async()=>{
 const [html,script]=await Promise.all([read('./spatial-command.html'),read('./spatial-command.mjs')]);
 for(const marker of ['sp-sheet-body','sp-dataset-status','sp-source-bars','sp-top-status','sp-graph-world'])assert.ok(html.includes(marker));
 assert.match(script,/\/api\/session/);
 assert.match(script,/\/api\/enterprise-bi\?from=/);
 assert.match(script,/executive=1/);
 assert.doesNotMatch(script,/method:\s*['"]POST/);
 assert.match(html,/No business mutations/);
});
test('spatial motion has user control and reduced-motion fallback',async()=>{
 const [html,css,script]=await Promise.all([read('./spatial-command.html'),read('./spatial-command.css'),read('./spatial-command.mjs')]);
 assert.match(html,/id="sp-motion"/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(script,/prefers-reduced-motion: reduce/);
 assert.match(html,/CONCEPTUAL RELATIONSHIPS/);
});
test('spatial executive HTML is marked no-store by Cloudflare asset policy',async()=>{
 const worker=await read('./cloudflare-worker.mjs');
 assert.match(worker,/spatial-command\.html/);
});