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
  assert.equal(r.reason,'AP_PROJECT_CATALOG_EMPTY');
});
test('cached readback is idempotent, and never repeats provider calls',async()=>{
  const s=store(),c=fake();await reconcileExistingQualification({store:s,client:c});
  const r=await reconcileExistingQualification({store:s,client:c});
  assert.equal(r.cached,true);assert.equal(c.calls.length,3);
});

test('provider nested JSON MCP content envelope unwraps project context before reading flows',async()=>{
 const s=store(),c=fake(),before=c.call;
 c.call=async(name,args)=>{
   const result=await before(name,args);
   if(name==='ap_set_project_context')return{content:[{type:'text',text:JSON.stringify(result)}]};
   return result;
 };
 const result=await reconcileExistingQualification({store:s,client:c});
 assert.equal(result.status,'NO_MATCH');
 assert.deepEqual(c.calls.map(v=>v.name),['ap_set_project_context','ap_set_project_context','ap_list_flows']);
});
test('provider structuredContent nested in JSON text is consumed as machine evidence',()=>{
 const msg={content:[{type:'text',text:'✅ Listed 1 flow(s):'}],structuredContent:{flows:[{id:'fl_123456',displayName:'sample'}],count:1}};
 assert.equal(parseActivepiecesToolResult({content:[{type:'text',text:JSON.stringify(msg)}]}).flows[0].id,'fl_123456');
 assert.equal(parseActivepiecesToolResult({content:[{type:'text',text:JSON.stringify({result:msg})}]}).count,1);
});

test('unique accessible project with non-default name is selected for read-only audit',async()=>{
 const s=store(),c=fake(),original=c.call;
 c.call=async(name,args)=>{
   if(name==='ap_set_project_context'){
     c.calls.push({name,args});
     return !args.projectId?plain('Project context cleared.\n\nAvailable projects:\n- VYNDI Workspace (project_only01)')
       :plain('Project context set to "VYNDI Workspace".\n\nAvailable projects:\n> VYNDI Workspace (project_only01)');
   }
   return original(name,args);
 };
 const r=await reconcileExistingQualification({store:s,client:c});
 assert.equal(r.status,'NO_MATCH');
 assert.equal(c.calls[1].args.projectId,'project_only01');
});
test('zero accessible projects yields specific HOLD rather than inventing a project',async()=>{
 const s=store(),c=fake();
 c.call=async()=>plain('Project context cleared. Available projects:');
 const r=await reconcileExistingQualification({store:s,client:c});
 assert.equal(r.status,'HOLD');assert.equal(r.reason,'AP_PROJECT_CATALOG_EMPTY');
});

test('multiple non-personal projects are ambiguous and no flow read is attempted',async()=>{
 const s=store(),c=fake();
 c.call=async()=>plain('Available projects:\n- Work (project_work01)\n- Other (project_other02)');
 const r=await reconcileExistingQualification({store:s,client:c});
 assert.equal(r.reason,'AP_PROJECT_SELECTION_AMBIGUOUS');
});


const markerRun=(i)=>({id:'run_'+String(i).padStart(9,'0'),flowId:'flow_1234567890',status:'SUCCEEDED',environment:'TESTING'});
const markerDetail=(r,m=marker,checksum=45,status='SUCCEEDED',objectSteps=true)=>({
  id:r.id,flowId:r.flowId,status,environment:'TESTING',
  steps:objectSteps
    ?{step_1:{output:{qualMarker:m,checksum,fixtureType:'VAOS_SANDBOX_V1'}}}
    :[{output:{qualMarker:m,checksum,fixtureType:'VAOS_SANDBOX_V1'}}]
});
function multiRunClient(runs,docs){
  const flowId='flow_1234567890';
  const c=fake([{id:flowId,displayName:'VAOS Synthetic Qualification '+marker}],runs);
  const original=c.call;
  c.call=async(name,args)=>{
    if(name==='ap_get_run'){
      c.calls.push({name,args});
      const result=docs[args.flowRunId];
      if(result instanceof Error)throw result;
      return {structuredContent:result};
    }
    return original(name,args);
  };
  return c;
}
test('18 tests with one original marker are independently verified without replay',async()=>{
  const runs=Array.from({length:18},(_,i)=>markerRun(i));
  const docs=Object.fromEntries(runs.map((r,i)=>[r.id,markerDetail(r,i===8?marker:'TEST_ONLY')]));
  const c=multiRunClient(runs,docs);
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.status,'EXISTING_RUN_VERIFIED');assert.equal(r.runCount,18);
  assert.equal(r.markerVerified,true);assert.equal(r.checksumVerified,true);
  assert.equal(c.calls.filter(x=>x.name==='ap_get_run').length,18);
  assert.equal(c.calls.some(x=>x.name==='ap_test_flow'),false);
});
test('TEST_ONLY executions do not qualify original marker',async()=>{
  const runs=[markerRun(1),markerRun(2)];
  const c=multiRunClient(runs,Object.fromEntries(runs.map(r=>[r.id,markerDetail(r,'TEST_ONLY')])));
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.status,'HOLD');assert.equal(r.reason,'AP_QUALIFICATION_RUN_NOT_FOUND');
  assert.equal(r.markerVerified,false);
});
test('two runs with the exact original marker stay HOLD',async()=>{
  const runs=[markerRun(1),markerRun(2)];
  const c=multiRunClient(runs,Object.fromEntries(runs.map(r=>[r.id,markerDetail(r)])));
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.status,'HOLD');assert.equal(r.reason,'AP_MULTIPLE_MARKER_RUNS');
});
test('wrong checksum stays HOLD even if original marker appears',async()=>{
  const run=markerRun(1),c=multiRunClient([run],{[run.id]:markerDetail(run,marker,44)});
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.reason,'AP_RUN_CONTENT_UNVERIFIED');
  assert.equal(r.markerVerified,true);assert.equal(r.checksumVerified,false);
});
test('one failed run readback blocks qualification even with matching run',async()=>{
  const a=markerRun(1),b=markerRun(2);
  const c=multiRunClient([a,b],{[a.id]:markerDetail(a),[b.id]:new Error('upstream offline')});
  const r=await reconcileExistingQualification({store:store(),client:c});
  assert.equal(r.status,'HOLD');assert.notEqual(r.status,'EXISTING_RUN_VERIFIED');
});
