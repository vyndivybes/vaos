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
test('Founder Command links to individual workforce analytics without a dispatch shortcut',async()=>{
 const html=await readFile(new URL('./founder-console.html',import.meta.url),'utf8');
 assert.ok(html.includes('href="/workforce-analytics.html"'));
});
test('install shell never caches private messages or claims commands were sent',async()=>{
 const [manifestText,html,script]=await Promise.all([
  readFile(new URL('./manifest.webmanifest',import.meta.url),'utf8'),
  readFile(new URL('./founder-console.html',import.meta.url),'utf8'),
  readFile(new URL('./founder-console.mjs',import.meta.url),'utf8')
 ]);
 const manifest=JSON.parse(manifestText);
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/login');
 assert.match(html,/rel="manifest"/);assert.match(script,/DRAFT_NOT_SENT/);
 assert.doesNotMatch(script,/serviceWorker\.register|localStorage|sessionStorage/);
});


test('Founder Command creates and assigns recorded instructions through the existing missions API', async () => {
 const [html, script, flow] = await Promise.all([
  readFile(new URL('./founder-console.html', import.meta.url), 'utf8'),
  readFile(new URL('./founder-console.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./lib/founder-mission-flow.mjs', import.meta.url), 'utf8'),
 ]);
 assert.match(html, /Create and assign mission/);
 assert.match(script, /commandKind\.value==='INSTRUCTION'/);
 assert.match(script, /agentSelect\.value='orchestrator'/);
 assert.match(flow, /operation:'ROUTE_FOUNDER_INSTRUCTION'/);
 assert.match(flow, /mission\.businessEffectsExecuted!==false/);
 assert.doesNotMatch(script, /\/api\/missions.*RUN_SAFE/);
});


test('Founder mission lookup displays persisted employee evidence and recovery from the existing mission route',async()=>{
 const {readFile}=await import('node:fs/promises');
 const script=await readFile(new URL('./founder-console.mjs',import.meta.url),'utf8');
 assert.match(script,/view=results/);
 assert.match(script,/loadFounderMission\(id/);
 const flow=await readFile(new URL('./lib/founder-mission-flow.mjs',import.meta.url),'utf8');
 assert.match(flow,/VAOS_FOUNDER_MISSION_RESULTS_V1/);
 assert.match(script,/formatMissionSnapshotSpokenPreview\(record\.snapshot,id\)/);
 assert.doesNotMatch(script,/\/api\/new-mission-results-screen/);
});


test('G4 Step 5 issues one founder mission and reads its results in the existing command form',async()=>{
 const [html,script,flow]=await Promise.all([
  readFile(new URL('./founder-console.html',import.meta.url),'utf8'),
  readFile(new URL('./founder-console.mjs',import.meta.url),'utf8'),
  readFile(new URL('./lib/founder-mission-flow.mjs',import.meta.url),'utf8'),
 ]);
 assert.match(html,/id="founder-command-submit"/);
 assert.match(script,/await issueFounderInstruction\(\)/);
 assert.match(script,/await loadFounderMission\(id\)/);
 assert.match(script,/window\.history\.replaceState/);
 assert.match(script,/const resumed=new URL\(window\.location\.href\)\.searchParams\.get\('missionId'\)/);
 assert.match(script,/document\.visibilityState!=='visible'/);
 assert.match(script,/60_000/);
 assert.match(flow,/createFounderMission/);
 assert.doesNotMatch(script,/\/api\/missions.*RUN_SAFE/);
});


test('G4 Founder Command browser entry imports every roster/command dependency before using them',async()=>{
 const script=await readFile(new URL('./founder-console.mjs',import.meta.url),'utf8');
 assert.match(script,/^import\s*\{\s*AGENTS\s*,\s*prepareFounderCommand\s*,\s*safeAgentSnapshot\s*\}\s*from\s*['"]\.\/founder-command\.mjs['"];?/m);
 assert.match(script,/^import\s*\{\s*createFounderMission\s*,\s*formatFounderMissionResults\s*\}\s*from\s*['"]\.\/lib\/founder-mission-flow\.mjs['"];?/m);
 assert.match(script,/for\(const agent of AGENTS\)/);
 assert.match(script,/prepareFounderCommand\(/);
 assert.match(script,/safeAgentSnapshot\(/);
 assert.match(script,/function syncInstructionRecipient/);
 assert.match(script,/function loadFounderMission/);
});
