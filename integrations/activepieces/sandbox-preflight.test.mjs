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

function realMcpShapeClient({source=code,stepDescriptors=[
 {name:'trigger',type:'PIECE_TRIGGER'}, {name:'step_1',type:'CODE'}
],stepCount=2,issues=[],valid=true,packageJson='{}',triggerSettings={pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',pieceVersion:'0.1.0',input:{},propertySettings:{},sampleData:null},
input={qualMarker:'{{trigger.body.qualMarker}}',value:'{{trigger.body.value}}'}
}={}){
 const m=mock();
 const earlier=m.client.call;
 m.client.call=async(name,args)=>{
  if(name==='ap_flow_structure'){m.calls.push({name,args});return S({flowId:'flow_12345678',displayName:'VAOS Synthetic Qualification '+marker,steps:stepDescriptors,stepCount});}
  if(name==='ap_read_step_settings'){m.calls.push({name,args});return S(triggerSettings);}
  if(name==='ap_read_step_code'){m.calls.push({name,args});return S({stepName:'step_1',code:source,packageJson,input});}
  if(name==='ap_validate_flow'){m.calls.push({name,args});return S({valid,totalSteps:2,validSteps:valid?2:1,invalidSteps:valid?0:1,skippedSteps:0,issues});}
  return earlier(name,args);
 };
 return m;
}
test('production-observed MCP response keys qualify deterministic single-code webhook with zero mutations',async()=>{
 const {client,calls}=realMcpShapeClient();
 const result=await preflightActivepiecesSandbox({store,client});
 assert.equal(result.status,'PASS');assert.equal(result.reason,'AP_SANDBOX_PREFLIGHT_VERIFIED');
 assert.equal(result.runSubmitted,false);assert.equal(result.productionActivation,false);
 assert.equal(calls.some(c=>['ap_test_flow','ap_build_flow','ap_update_step','ap_lock_and_publish'].includes(c.name)),false);
});
test('a second action step fails closed even if validation reports valid',async()=>{
 const {client}=realMcpShapeClient({stepDescriptors:[
 {name:'trigger',type:'PIECE_TRIGGER'},{name:'step_1',type:'CODE'},{name:'step_2',type:'PIECE_ACTION'}
 ],stepCount:3});
 assert.equal((await preflightActivepiecesSandbox({store,client})).status,'HOLD');
});
test('real-schema altered code, dependencies or mapping cannot pass',async()=>{
 const badCases=[
 {source:'export const code = async()=>({qualMarker:"x",checksum:45,fixtureType:"VAOS_SANDBOX_V1"});'},
 {packageJson:'{"dependencies":{"axios":"1.0.0"}}'},
 {input:{qualMarker:'{{some.non-original.marker}}',value:'{{trigger.body.value}}'}}
 ];
 for(const opt of badCases) {
  const {client}=realMcpShapeClient(opt);
  const r=await preflightActivepiecesSandbox({store,client});
  assert.equal(r.status,'HOLD',JSON.stringify(Object.keys(opt)));
 }
});
test('real-schema validation issues or invalid counts block qualification',async()=>{
 for(const opt of [{issues:[{stepName:'step_1',reason:'broken'}]},{valid:false},{stepCount:99}]) {
  const {client}=realMcpShapeClient(opt);
  assert.equal((await preflightActivepiecesSandbox({store,client})).status,'HOLD');
 }
});
test('missing structural proof fails closed and emits metadata but not source, marker, or input values',async()=>{
 const {client}=realMcpShapeClient({stepDescriptors:[{name:'mystery',type:'ROUTER'}]});
 const r=await preflightActivepiecesSandbox({store,client});
 assert.equal(r.status,'HOLD');
 assert.equal(JSON.stringify(r).includes(code),false);
 assert.equal(JSON.stringify(r).includes(marker),false);
 assert.ok(Array.isArray(r.structureKeys));
});

test('a dependency-free Activepieces package.json is safe, but installed modules are not',async()=>{
  const {client}=realMcpShapeClient({packageJson:'{"dependencies":{}}'});
  const r=await preflightActivepiecesSandbox({store,client});
  assert.equal(r.status,'PASS');
  assert.equal(r.runSubmitted,false);
});

test('read-only mismatch evidence distinguishes webhook piece, trigger name and unwanted inputs',async()=>{
 const cases=[
  [{pieceName:'wrong-piece',triggerName:'catch_webhook',input:{}},[false,true,true,'0']],
  [{pieceName:'@activepieces/piece-webhook',triggerName:'different',input:{}},[true,false,true,'0']],
  [{pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input:{extra:'private_value'}},[true,true,false,'1']],
  [{pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input:null},[true,true,false,'UNKNOWN']]
 ];
 for(const [triggerSettings,expected] of cases){
  const {client,calls}=realMcpShapeClient({triggerSettings});
  const r=await preflightActivepiecesSandbox({store,client});
  assert.equal(r.status,'HOLD');
  assert.deepEqual(
    [r.triggerPieceMatches,r.triggerNameMatches,r.triggerInputEmpty,r.triggerInputFieldCount],expected
  );
  assert.equal(JSON.stringify(r).includes('private_value'),false);
  assert.equal(JSON.stringify(r).includes(marker),false);
  assert.equal(calls.some(x=>['ap_update_trigger','ap_update_step','ap_test_flow'].includes(x.name)),false);
 }
});


test('Activepieces default catch_webhook authType none and empty authFields pass safely',async()=>{
  const allowed=[
    {authType:'none'},
    {authType:'none',authFields:{}},
    {authFields:{},authType:'none'}
  ];
  for(const input of allowed){
    const {client}=realMcpShapeClient({triggerSettings:{
      pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input
    }});
    const r=await preflightActivepiecesSandbox({store,client});
    assert.equal(r.status,'PASS',JSON.stringify(input));
    assert.equal(r.runSubmitted,false);assert.equal(r.productionActivation,false);
  }
});
test('unsafe webhook auth modes or injected fields continue to fail closed',async()=>{
  for(const input of [
    {authType:'basic',authFields:{}},
    {authType:'header',authFields:{headerName:'x-bypass',headerValue:'secret'}},
    {authType:'hmac',authFields:{}},
    {authType:'none',authFields:{headerValue:'secret'}},
    {authType:'none',authFields:{},another:'bad'},
    {authType:'None',authFields:{}}
  ]){
    const {client}=realMcpShapeClient({triggerSettings:{
      pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input
    }});
    const r=await preflightActivepiecesSandbox({store,client});
    assert.equal(r.status,'HOLD',JSON.stringify(Object.keys(input)));
    assert.equal(JSON.stringify(r).includes('secret'),false);
  }
});
