import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileExistingQualification,parseActivepiecesToolResult} from './reconcile-existing.mjs';
const marker='VAOSQ_ABCDEF0123456789';
const store=()=>{const m=new Map([['ap-qual-state',{status:'HOLD',phase:'REMEDIATION_HOLD',reason:'AP_TOOL_RESULT_INVALID',marker}]]);return{get:async k=>structuredClone(m.get(k)),put:async(k,v)=>m.set(k,structuredClone(v)),m}};
const plain=text=>({content:[{type:'text',text}]});
const fake=(flows=[],runs=[],detail)=>{const calls=[];return{calls,tools:async()=>['ap_set_project_context','ap_list_flows','ap_list_runs','ap_get_run'],call:async(name,args)=>{calls.push({name,args});if(name==='ap_set_project_context')return !args.projectId?plain('Project context cleared.\n\nAvailable projects:\n- Personal Project (project_personal1)'):plain('Project context set to "Personal Project".\n\nAvailable projects:\n> Personal Project (project_personal1)');if(name==='ap_list_flows')return{structuredContent:{flows,count:flows.length},content:[{type:'text',text:'✅ Listed '+flows.length+' flow(s).'}]};if(name==='ap_list_runs')return{structuredContent:{runs,count:runs.length},content:[{type:'text',text:'Flow runs.'}]};if(name==='ap_get_run')return{structuredContent:detail};throw Error('UNEXPECTED')}}};
test('official Activepieces structuredContent parsed despite non-JSON summary',()=>{
  assert.equal(parseActivepiecesToolResult({structuredContent:{flows:[],count:0},content:[{type:'text',text:'✅ Listed 0 flow(s)'}]}).count,0);
  assert.throws(()=>parseActivepiecesToolResult(plain('✅ Listed 0 flow(s)')),/AP_STRUCTURED_EVIDENCE_MISSING/);
});
test('reconcile missing exact flow without creating or testing another',async()=>{
  const s=store(),c=fake(),r=await reconcileExistingQualification({store:s,client:c});
  assert.equal(r.status,'NO_MATCH');assert.equal(r.matchCount,0);
  assert.deepEqual(c.calls.map(x=>x.name),['ap_set_project_context','ap_set_project_context','ap_list_flows']);
  assert.equal(c.calls[2].args.name,'VAOS Synthetic Qualification '+marker);
  assert.equal((await s.get('ap-qual-state')).phase,'REMEDIATION_HOLD');
});
test('reconcile one existing test run against independent run detail with exact checksum',async()=>{
  const flowId='flow_1234567890',runId='run_1234567890';
  const c=fake([{id:flowId,displayName:'VAOS Synthetic Qualification '+marker}],
    [{id:runId,flowId,status:'SUCCEEDED',environment:'TESTING'}],
    {id:runId,flowId,status:'SUCCEEDED',environment:'TESTING',steps:[{name:'step_1',output:{qualMarker:marker,checksum:45,fixtureType:'VAOS_SANDBOX_V1'}}]});
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.status,'EXISTING_RUN_VERIFIED');assert.equal(r.markerVerified,true);
  assert.deepEqual(c.calls.map(x=>x.name),['ap_set_project_context','ap_set_project_context','ap_list_flows','ap_list_runs','ap_get_run']);
  assert.equal(c.calls[3].args.environment,'TESTING');
});
test('duplicate matching flows never start a new run',async()=>{
  const s=store(),c=fake([1,2].map(i=>({id:'flow_123456789'+i,displayName:'VAOS Synthetic Qualification '+marker})));
  const r=await reconcileExistingQualification({store:s,client:c});
  assert.equal(r.status,'HOLD');assert.equal(r.reason,'AP_MULTIPLE_EXACT_FLOWS');
  assert.equal(c.calls.some(x=>x.name==='ap_list_runs'),false);
});
test('project selection ambiguity stays HOLD',async()=>{
  const c=fake();c.call=async()=>plain('Available projects: none');
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.reason,'AP_PROJECT_SELECTION_AMBIGUOUS');
});
test('cached readback is idempotent, and never repeats provider calls',async()=>{
  const s=store(),c=fake();await reconcileExistingQualification({store:s,client:c});
  const r=await reconcileExistingQualification({store:s,client:c});
  assert.equal(r.cached,true);assert.equal(c.calls.length,3);
});
