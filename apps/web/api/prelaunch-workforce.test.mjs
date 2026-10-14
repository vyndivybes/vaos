import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createPrelaunchWorkforceHandler} from './prelaunch-workforce.mjs';
import {VAOS_WORKFORCE_AGENT_IDS,VAOS_WORKFORCE_QUALIFICATION_FLOOR} from '../../../platform/runtime/vaos-eight-operating-model.mjs';
function harness({persist=true}={}){
 const saved=[];
 const store={async snapshot(){return {workforce:{digitalEmployees:VAOS_WORKFORCE_AGENT_IDS.map(id=>({id,status:'ACTIVE',qualificationLevel:VAOS_WORKFORCE_QUALIFICATION_FLOOR[id]}))}}},async prelaunchOutput(input){if(!input.requestId)return {runs:[]};if(!persist)throw Error('offline');saved.push(input);return {data:input.output}}};
 const handler=createPrelaunchWorkforceHandler({getStore:()=>store,getReader:()=>{throw Error('unavailable')}});
 async function run({email='shyamsundhar1982@gmail.com',origin='https://vaos.example',body}={}){
  let status=200,response;const res={setHeader(){},status(n){status=n;return this},json(x){response=x;return this}};
  await handler({method:body?'POST':'GET',url:'https://vaos.example/api/prelaunch-workforce',headers:{origin,'content-type':'application/json',cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env:{},body},res);return {status,body:response};
 }
 return {run,saved};
}
const body={requestId:'2631a76c-fd12-41d6-a067-64d486ad8c15',operation:'PREPARE_ALL',objective:'Prepare the company for launch'};
test('startup endpoint requires founder session and same-origin writes',async()=>{
 const h=harness();assert.equal((await h.run({email:''})).status,401);assert.equal((await h.run({email:'other@example.com'})).status,401);
 assert.equal((await h.run({origin:'https://evil.example',body})).status,403);assert.equal(h.saved.length,0);
});
test('unavailable sources stay unavailable and worksheets must be durably saved',async()=>{
 const h=harness();const result=await h.run({body});assert.equal(result.status,200);assert.equal(result.body.data.outputs.length,16);
 assert.equal(result.body.data.businessEffectsExecuted,false);assert.equal(h.saved.length,1);
 assert.equal(result.body.data.outputs.find(d=>d.employeeId==='finance').sourceState,'SOURCE_UNAVAILABLE');
 const down=harness({persist:false});assert.equal((await down.run({body})).status,503);
});
test('invalid requests cannot be persisted',async()=>{
 const h=harness();assert.equal((await h.run({body:{...body,requestId:'bad'}})).status,422);
 assert.equal((await h.run({body:{...body,executePayments:true}})).status,422);assert.equal(h.saved.length,0);
});
