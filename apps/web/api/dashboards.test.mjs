import test from 'node:test';import assert from 'node:assert/strict';
import {createDashboardsHandler} from './dashboards.mjs';import {defaultDefinition} from '../bi-model.mjs';
async function call({session={email:'shyamsundhar1982@gmail.com'},method='GET',body,origin='https://vaos.test',url='https://vaos.test/api/dashboards',store}={}){
 let status=200,result;const handler=createDashboardsHandler({sessionVerifier:()=>session,getStore:()=>store||{dashboards:async p=>p}});
 await handler({method,url,headers:{cookie:'',origin,'content-type':'application/json'},body},{setHeader(){},status(n){status=n;return this;},json(v){result=v;}});return {status,result};
}
test('anonymous and checker cannot list or save founder dashboards',async()=>{
 assert.equal((await call({session:null})).status,401);assert.equal((await call({session:{email:'kaaviyam1519@gmail.com'}})).status,403);
});
test('write requires same origin, valid catalog and bounded fields',async()=>{
 const body={id:null,revision:0,visibility:'private',definition:defaultDefinition()};
 assert.equal((await call({method:'POST',body,origin:'https://attacker.test'})).status,403);
 assert.equal((await call({method:'POST',body:{...body,definition:{...body.definition,metric:'profit'}}})).status,422);
 const r=await call({method:'POST',body});assert.equal(r.status,200);assert.equal(r.result.data.actorEmail,'shyamsundhar1982@gmail.com');assert.equal(r.result.data.action,'save');
});
test('read validates IDs; missing storage never becomes success',async()=>{
 assert.equal((await call({url:'https://vaos.test/api/dashboards?id=bad'})).status,422);
 assert.equal((await call({store:{dashboards:async()=>{throw Error('offline');}}})).status,503);
});
