import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AGENTS,prepareFounderCommand,safeAgentSnapshot} from './founder-command.mjs';
test('sixteen unique governed agent identities are available',()=>{
 assert.equal(AGENTS.length,16);
 assert.equal(new Set(AGENTS.map(a=>a.id)).size,16);
 assert.ok(AGENTS.some(a=>a.id==='engineering-configuration'));
});
test('commands are always drafts and never authorized to execute',()=>{
 const d=prepareFounderCommand({agentId:'vibpe',instruction:'Review frame verification before release.',kind:'INSTRUCTION'});
 assert.equal(d.status,'DRAFT_NOT_SENT');assert.equal(d.recipientAgentId,'vibpe');
 assert.equal(d.requiresGovernedSubmission,true);assert.equal(d.executionAuthorized,false);
});
test('invalid identities, malformed input, and authority injection fail closed',()=>{
 for(const input of [
  {agentId:'unknown',instruction:'Investigate current condition',kind:'INSTRUCTION'},
  {agentId:'vibpe',instruction:' ',kind:'INSTRUCTION'},
  {agentId:'vibpe',instruction:'x'.repeat(2001),kind:'INSTRUCTION'},
  {agentId:'vibpe',instruction:'x\u0000z',kind:'INSTRUCTION'},
  {agentId:'vibpe',instruction:'Proceed',kind:'INSTRUCTION',overrideAuthority:'L5'},
  {agentId:'vibpe',instruction:'Proceed',kind:'EXECUTE'}
 ])assert.throws(()=>prepareFounderCommand(input));
});
test('persisted state does not imply runtime liveness',()=>{
 const x=safeAgentSnapshot({agents:[{id:'vibpe',lifecycle:'ACTIVE',qualified:true,qualificationLevel:3,runtimeLiveness:'UNVERIFIED'}]});
 assert.equal(x[0].qualification,'Q3');assert.equal(x[0].liveness,'UNVERIFIED');
 assert.equal(safeAgentSnapshot({agents:[{id:'fake',lifecycle:'ACTIVE'}]}).length,0);
});
test('install shell never caches private messages or claims commands were sent',async()=>{
 const [manifestText,html,script]=await Promise.all([
  readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'),
  readFile(new URL('../founder-console.html',import.meta.url),'utf8'),
  readFile(new URL('../founder-console.mjs',import.meta.url),'utf8')
 ]);
 const manifest=JSON.parse(manifestText);
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/login');
 assert.match(html,/rel="manifest"/);assert.match(script,/DRAFT_NOT_SENT/);
 assert.doesNotMatch(script,/serviceWorker\.register|localStorage|sessionStorage/);
});
