import test from 'node:test';
import assert from 'node:assert/strict';
import {startupBatch,createPrelaunchDraft,calculateStartupScenario} from './prelaunch-workforce.mjs';
import {VAOS_WORKFORCE_AGENT_IDS,VAOS_WORKFORCE_QUALIFICATION_FLOOR} from '../platform/runtime/vaos-eight-operating-model.mjs';
import {prepareLocalSpeech,interimTranscript} from '../apps/web/lib/local-speech.mjs';
import {parseEngineeringMesh} from '../apps/web/lib/engineering-mesh.mjs';
import {validateRestoreTarget,compareTableFingerprints} from '../scripts/prelaunch-recovery.mjs';
const snapshot={workforce:{digitalEmployees:VAOS_WORKFORCE_AGENT_IDS.map(id=>({id,status:'ACTIVE',qualificationLevel:VAOS_WORKFORCE_QUALIFICATION_FLOOR[id]}))}};
test('prelaunch prepares all roles without manufacturing historical records or business effects',()=>{
 const drafts=startupBatch({snapshot,objective:'Prepare company startup',observations:{finance:{status:'OBSERVED',count:0}}});
 assert.equal(drafts.length,16);assert.ok(drafts.every(d=>d.actionControls.businessEffectExecuted===false));
 assert.equal(drafts.find(d=>d.employeeId==='finance').sourceState,'EMPTY_LEDGER');
 assert.equal(drafts.find(d=>d.employeeId==='inventory').sourceState,'SOURCE_UNAVAILABLE');
 assert.ok(Object.values(drafts.find(d=>d.employeeId==='finance').worksheet).every(v=>v===null));
 assert.throws(()=>startupBatch({snapshot:{workforce:{digitalEmployees:[]}},objective:'Prepare company startup'}));
});
test('unknown job and credential-bearing inputs fail closed',()=>{
 assert.throws(()=>createPrelaunchDraft({employeeId:'finance',actionType:'PAY.NOW',objective:'Prepare startup'}));
 assert.throws(()=>createPrelaunchDraft({employeeId:'finance',actionType:'FINANCE.OBSERVE_LEDGER',objective:'Use private key xyz'}));
});
test('scenario computes only declared proposal amounts and rejects fractional currency precision',()=>{
 const input={units:10,unitCostINR:12.50,unitPriceINR:20,fixedCostsINR:50,openingFundsINR:100};
 const result=calculateStartupScenario(input);assert.equal(result.proposedFundingGapINR,75);assert.equal(result.proposedMarginINR,25);assert.equal(result.actualRevenueVerified,false);
 assert.throws(()=>calculateStartupScenario({...input,unitCostINR:0.001}));
});
test('wake speech never falls back to a remote-only recognizer',async()=>{
 class Remote {static async available(){return 'available';}}
 assert.deepEqual(await prepareLocalSpeech(Remote,'en'),{status:'LOCAL_UNAVAILABLE'});
 class Local {processLocally=false;static async available(){return 'available';}}
 assert.deepEqual(await prepareLocalSpeech(Local,'en'),{status:'LOCAL_READY',locale:'en-IN'});
 assert.equal(interimTranscript({resultIndex:0,results:[{isFinal:false,0:{transcript:'hello'}},{isFinal:true,0:{transcript:'pay'}}]}),'hello');
});
test('actual STL triangle parses and unsupported geometry fails',()=>{
 const source='solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid a';
 const mesh=parseEngineeringMesh(new TextEncoder().encode(source).buffer,'part.stl');assert.equal(mesh.vertices.length,3);
 assert.throws(()=>parseEngineeringMesh(new TextEncoder().encode(source).buffer,'part.exe'));
});
test('recovery cannot target production and content mismatches cannot pass',()=>{
 assert.throws(()=>validateRestoreTarget({PGHOST:'production',VAOS_RECOVERY_DATABASE:'vaos_restore_test123'}));
 assert.throws(()=>validateRestoreTarget({PGHOST:'localhost',VAOS_RECOVERY_DATABASE:'postgres'}));
 assert.equal(validateRestoreTarget({VAOS_RECOVERY_DATABASE:'vaos_restore_test123'}).PGHOST,'127.0.0.1');
 const rows=[{name:'empty_ledger',rows:0,sha256:'a'.repeat(64)}];assert.equal(compareTableFingerprints(rows,rows).allMatched,true);
 assert.equal(compareTableFingerprints(rows,[{...rows[0],sha256:'b'.repeat(64)}]).allMatched,false);
});
