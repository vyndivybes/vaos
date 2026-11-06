import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=load('./neural-knowledge.html');
const script=load('./unified-knowledge-ui.mjs');
const render=load('./unified-knowledge-render.mjs');
const css=load('./unified-knowledge.css');

test('existing neural page hosts the knowledge universe without nested browser chrome',()=>{
 for(const id of ['knowledge-universe','universe-svg','universe-sources','universe-load',
 'universe-mode','universe-direction','universe-depth','universe-date',
 'universe-chat-file','universe-private-form','universe-details'])
 assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/unified-knowledge-ui.mjs/);
 assert.match(html,/unified-knowledge.css/);
});
test('five layouts and lineage directions are user-selectable',()=>{
 for(const v of ['constellation','lineage','lanes','timeline','matrix'])
 assert.ok(html.includes('value="'+v+'"'),v);
 for(const v of ['both','ancestors','descendants'])
 assert.ok(html.includes('value="'+v+'"'),v);
 assert.match(script,/selectKnowledgeView/);
 assert.match(render,/layoutKnowledgeView/);
});
test('source reads use existing founder-gated endpoints and local archive parsing',()=>{
 assert.match(script,/neural-knowledge/);
 assert.match(script,/google-workspace/);
 assert.match(script,/federated-knowledge/);
 assert.match(script,/chatHistoryGraph/);
 assert.match(script,/file.text/);
 assert.match(html,/separate VAOS OAuth/);
});
test('visualization is responsive and reduced-motion aware',()=>{
 assert.match(css,/radial-gradient/);
 assert.match(css,/max-width:640px/);
 assert.match(css,/prefers-reduced-motion/);
});
