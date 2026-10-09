import test from 'node:test';import assert from 'node:assert/strict';
import {classifyReadbackToolError,diagnoseSyntheticHold} from './synthetic-diagnostic.mjs';
const marker='VAOSQ_0123456789ABCDEF';
const makeStore=()=>{const a=new Map([['ap-qual-state',{status:'HOLD',phase:'BUILD_SUBMITTED',marker}]]);return {get:async k=>a.get(k),put:async(k,v)=>a.set(k,v)};};
test('missing project context is detected without leaking original error',()=>{
 assert.equal(classifyReadbackToolError({isError:true,content:[{type:'text',text:'Select a project context first token=private'}]}),'AP_PROJECT_CONTEXT_MISSING');
});
test('read-only reconciliation confirms no matching flow and never dispatches',async()=>{
 const store=makeStore(),calls=[];
 const client={tools:async()=>['ap_list_flows'],call:async(name,args)=>{calls.push([name,args]);return {structuredContent:{flows:[]}}}};
 const r=await diagnoseSyntheticHold({store,client});assert.equal(r.reason,'AP_NO_MATCHING_SYNTHETIC_FLOW');
 assert.equal(r.matches,0);assert.deepEqual(calls.map(x=>x[0]),['ap_list_flows']);
 await diagnoseSyntheticHold({store,client});assert.equal(calls.length,1);
});
test('existing flow is explicitly HOLD for human-reviewed recovery',async()=>{
 const store=makeStore(),client={tools:async()=>['ap_list_flows'],call:async()=>({structuredContent:{flows:[{id:'f1',displayName:'VAOS Synthetic Qualification '+marker}]}})};
 const r=await diagnoseSyntheticHold({store,client});assert.equal(r.reason,'AP_POSSIBLE_ORPHAN_FLOW');assert.equal(r.matches,1);
});
