import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightActivepiecesSandbox} from './sandbox-preflight.mjs';
const marker='VAOSQ_ABCDEF0123456789';
const state={status:'HOLD',phase:'REMEDIATION_HOLD',marker};
const code="export const code = async (inputs) => ({qualMarker:inputs.qualMarker,checksum:Number(inputs.value)*7+3,fixtureType:'VAOS_SANDBOX_V1'});";
const S=x=>({structuredContent:x});
function mock({flowStatus='DISABLED',src=code,steps=[{name:'step_1',type:'CODE'}],mapping={qualMarker:'{{trigger.body.qualMarker}}',value:'{{trigger.body.value}}'},toolsEnabled=true}={}){
 const calls=[];
 const flow={id:'flow_12345678',displayName:'VAOS Synthetic Qualification '+marker,status:flowStatus,published:false};
 const outcomes={
  ap_list_flows:S({flows:[flow]}),
  ap_flow_structure:S({flowId:flow.id,trigger:{name:'trigger',type:'PIECE_TRIGGER'},steps}),
  ap_read_step_settings:S({name:'trigger',settings:{pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input:{}}}),
  ap_read_step_code:S({stepName:'step_1',sourceCode:src,input:mapping}),
  ap_validate_flow:S({valid:true,errors:[]}),
 };
 const client={
  calls,
  tools:async()=>toolsEnabled?['ap_set_project_context','ap_list_flows','ap_flow_structure','ap_read_step_settings','ap_read_step_code','ap_validate_flow']:['ap_list_flows'],
  call:async(name,args)=>{calls.push({name,args});if(name==='ap_set_project_context')
    return {content:[{type:'text',text:args.projectId?'Project context set to "Personal Project"':'Project context cleared.\nAvailable projects:\n- Personal Project (project_12345)'}]};
    if(!outcomes[name])throw Error('unexpected tool');return outcomes[name];
  }
 };
 return {client,calls};
}
const store={get:async key=>key==='ap-qual-state'?state:null};
test('safe isolated webhook + single deterministic code is admitted without running a flow',async()=>{
 const {client,calls}=mock();
 const r=await preflightActivepiecesSandbox({store,client});
 assert.equal(r.status,'PASS');assert.equal(r.reason,'AP_SANDBOX_PREFLIGHT_VERIFIED');
 assert.equal(r.productionActivation,false);
 assert.equal(calls.some(x=>x.name==='ap_test_flow'||x.name==='ap_build_flow'||x.name==='ap_lock_and_publish'),false);
 assert.equal(r.runSubmitted,false);
 assert.equal(JSON.stringify(r).includes(marker),false);
 assert.equal(JSON.stringify(r).includes(code),false);
});
test('unsafe extra action step fails closed before test execution',async()=>{
 const {client,calls}=mock({steps:[{name:'step_1',type:'CODE'},{name:'step_2',type:'PIECE_ACTION'}]});
 const r=await preflightActivepiecesSandbox({store,client});
 assert.equal(r.status,'HOLD');
 assert.equal(calls.some(x=>x.name==='ap_test_flow'),false);
});
test('enabled flow is never qualified as isolated',async()=>{
 const {client}=mock({flowStatus:'ENABLED'});
 assert.equal((await preflightActivepiecesSandbox({store,client})).status,'HOLD');
});
test('altered code or trigger mapping fails closed',async()=>{
 const m=mock({src:'export const code = async () => ({checksum:45});'});
 assert.equal((await preflightActivepiecesSandbox({store,client:m.client})).status,'HOLD');
 const n=mock({mapping:{qualMarker:'{{some.bad.value}}',value:'6'}});
 assert.equal((await preflightActivepiecesSandbox({store,client:n.client})).status,'HOLD');
});
test('unknown tool schema or unavailable read tools fails closed',async()=>{
 const {client}=mock({toolsEnabled:false});
 const r=await preflightActivepiecesSandbox({store,client});
 assert.equal(r.status,'HOLD');assert.equal(r.reason,'AP_PREFLIGHT_TOOLS_UNAVAILABLE');
});
