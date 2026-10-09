import test from 'node:test';import assert from 'node:assert/strict';
import {selectUnambiguousProject,remediateProjectOnce} from './project-context-repair.mjs';
const marker='VAOSQ_ABCDEF0123456789';
const store=()=>{const m=new Map([['ap-qual-state',{status:'HOLD',phase:'BUILD_SUBMITTED',marker}],['ap-qual-diagnostic',{reason:'AP_PROJECT_CONTEXT_MISSING'}]]);return {get:async k=>m.get(k),put:async(k,v)=>m.set(k,v)}};
const pack=text=>({content:[{type:'text',text}]});
test('unique Personal Project may be selected while ambiguity fails closed',()=>{
 assert.deepEqual(selectUnambiguousProject('- Work (project_work01)\n- Personal Project (project_personal1)'),{name:'Personal Project',id:'project_personal1'});
 assert.throws(()=>selectUnambiguousProject('- Personal Project (project_one1)\n- Personal Project (project_two2)'),/AMBIGUOUS/);
});
test('project selection + orphan check precedes single remediation dispatch',async()=>{
 const s=store(),calls=[];const client={call:async(name,args)=>{calls.push({name,args});
 if(name==='ap_set_project_context'&&!args.projectId)return pack('- Personal Project (project_personal1)');
 if(name==='ap_set_project_context')return pack('Project context set to "Personal Project".');
 return {structuredContent:{flows:[]}};}};
 let runs=0;const retry=()=>{runs++;return {status:'PASS'}};
 assert.equal((await remediateProjectOnce({store:s,client,retry})).status,'PASS');
 assert.equal((await remediateProjectOnce({store:s,client,retry})).status,'HOLD');
 assert.equal(runs,1);assert.deepEqual(calls.map(x=>x.name),['ap_set_project_context','ap_set_project_context','ap_list_flows']);
});
test('possible orphaned synthetic flow blocks a duplicate',async()=>{
 const s=store();const client={call:async(name,args)=>{
 if(name==='ap_set_project_context'&&!args.projectId)return pack('- Personal Project (project_personal1)');
 if(name==='ap_set_project_context')return pack('Project context set to "Personal Project".');
 return {structuredContent:{flows:[{displayName:'VAOS Synthetic Qualification '+marker,id:'flow_orphan'}]}};
 }};
 assert.equal((await remediateProjectOnce({store:s,client,retry:()=>{throw Error('DUPLICATE')}})).reason,'AP_ORPHAN_FLOW_PRESENT');
});
