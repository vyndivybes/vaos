import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('federated evidence search exposes VYNDI OS and VAOS read-only repository evidence',()=>{
 const page=readFileSync(new URL('./neural-knowledge.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('./neural-knowledge-ui.mjs',import.meta.url),'utf8');
 assert.match(page,/id="knowledge-search"/);
 assert.match(page,/id="knowledge-results"/);
 assert.match(ui,/\/api\/federated-knowledge\?q=/);
 assert.match(ui,/failedSources/);
 assert.match(ui,/hostname!==\x27github.com\x27/);
 assert.match(ui,/textContent/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});
