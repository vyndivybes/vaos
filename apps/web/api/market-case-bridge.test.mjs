import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketCaseBridgeHandler,CASE_BRIDGE_CATALOG} from './market-case-bridge.mjs';
const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
 new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function fixture({email='shyamsundhar1982@gmail.com',corrupt=false,missing=false}={}){
 const archive1=new Uint8Array([80,75,3,4,1,2,3]);
 const archive2=new Uint8Array([37,80,68,70,45,49,1,2]);
 const f=[{id:'case1-doc',caseId:'BUSINESS-CASE-001',sourceSha256:'a'.repeat(64),
  sourceFileName:'Model.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  text:'Source 2026 cost assumptions. Frameset landed BOM is hypothetical. A warranty reserve is required.',
  status:'PARSED_UNVERIFIED_FORMULAS_NOT_RECALCULATED',schemaVersion:'VAOS_CASE_DOC_TEXT_V1',actionAuthorized:false},
  {id:'case2-pdf',caseId:'BUSINESS-CASE-002',sourceSha256:'b'.repeat(64),
  sourceFileName:'Capital plan.pdf',mimeType:'application/pdf',
  text:'Engineering services first. Avoid owned factory CAPEX until orders and supplier validation are proven.',
  status:'PARSED_UNVERIFIED',schemaVersion:'VAOS_CASE_DOC_TEXT_V1',actionAuthorized:false}];
 const docs=f.map(x=>({...x,documentId:x.id}));
 const content1=JSON.stringify(docs[0]),content2=JSON.stringify(docs[1]);
 const map=new Map([['archive1',archive1],['archive2',archive2],['doc1',content1],['doc2',content2]]);
 const hashBytes=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  typeof b==='string'?new TextEncoder().encode(b):b))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const catalog=[
 {id:'BUSINESS-CASE-001',title:'First case',archive:{key:'archive1',sha256:await hashBytes(archive1)},
  documents:[{id:'case1-doc',key:'doc1',sha256:await sha(content1),sourceSha256:'a'.repeat(64)}]},
 {id:'BUSINESS-CASE-002',title:'Second case',archive:{key:'archive2',sha256:await hashBytes(archive2)},
  documents:[{id:'case2-pdf',key:'doc2',sha256:await sha(content2),sourceSha256:'b'.repeat(64)}]},
 {id:'BUSINESS-CASE-003',title:'Third case',referenceUrl:'https://github.com/vyndivybes/vaos/blob/main/knowledge/business-cases/BUSINESS-CASE-003.md',documents:[]}
 ];
 if(corrupt)map.set('doc1',content1.replace('hypothetical','certified'));
 if(missing)map.delete('archive1');
 const bucket={async get(k){const b=map.get(k);return b==null?null:{
  size:typeof b==='string'?new TextEncoder().encode(b).byteLength:b.byteLength,
  async arrayBuffer(){const a=typeof b==='string'?new TextEncoder().encode(b):b;return a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength)}
 }}};
 let reads=0;const handler=createMarketCaseBridgeHandler({getSession:()=>email?{email}:null,
  catalog,readNow:()=>new Date('2026-11-06T02:00:00Z')});
 async function call(query=''){let status=200,data;const res={setHeader(){return res},
  status(n){status=n;return res},json(v){data=v;return res}};
  const rq={method:'GET',url:'https://vaos.example/api/market-case-bridge'+query,
   headers:{},env:{VAOS_ARTIFACTS:{get:async k=>{reads++;return bucket.get(k)}}}};
  await handler(rq,res);return {status,data};
 }
 return {call,reads:()=>reads};
}
test('requires founder session before looking up any private source',async()=>{
 const anon=await fixture({email:''}),other=await fixture({email:'else@example.com'});
 assert.equal((await anon.call()).status,401);
 assert.equal((await other.call()).status,403);
 assert.equal(anon.reads()+other.reads(),0);
});
test('default catalog verifies both source archives and all text hashes; third case is reference only',async()=>{
 const f=await fixture();const r=await f.call();
 assert.equal(r.status,200);
 assert.equal(r.data.data.cases.length,3);
 assert.equal(r.data.data.cases[0].status,'INDEX_VERIFIED');
 assert.equal(r.data.data.cases[1].status,'INDEX_VERIFIED');
 assert.equal(r.data.data.cases[2].status,'REFERENCE_ONLY');
 assert.equal(r.data.data.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r.data),/warranty reserve/i);
});
test('private search returns only bounded quoted excerpts with exact file provenance',async()=>{
 const f=await fixture();const r=await f.call('?q=warranty');
 assert.equal(r.status,200);assert.equal(r.data.data.status,'EVIDENCE_EXCERPTS_UNVERIFIED');
 assert.equal(r.data.data.results.length,1);
 assert.equal(r.data.data.results[0].documentId,'case1-doc');
 assert.match(r.data.data.results[0].quote,/warranty reserve/i);
 assert.equal(r.data.data.results[0].sourceSha256,'a'.repeat(64));
 assert.equal(r.data.data.forecastQualified,false);
});
test('document windows allow complete read without exposing other documents',async()=>{
 const f=await fixture();const r=await f.call('?case=BUSINESS-CASE-001&doc=case1-doc&offset=0');
 assert.equal(r.status,200);
 assert.match(r.data.data.text,/Frameset landed BOM/);
 assert.equal(r.data.data.documentId,'case1-doc');
 assert.equal((await f.call('?case=BUSINESS-CASE-002&doc=case1-doc')).status,422);
 assert.equal((await f.call('?case=BUSINESS-CASE-001&doc=case1-doc&offset=-1')).status,422);
});
test('corrupted text and unavailable source archive fail closed',async()=>{
 const broken=await fixture({corrupt:true}),missing=await fixture({missing:true});
 assert.equal((await broken.call()).data.data.cases[0].status,'HOLD');
 assert.equal((await broken.call('?q=warranty')).status,503);
 assert.equal((await missing.call()).data.data.cases[0].status,'HOLD');
 assert.equal((await missing.call('?case=BUSINESS-CASE-001&doc=case1-doc')).status,503);
});
test('GET only, strict query bounds, no public credentials and no mutations',async()=>{
 const f=await fixture();
 assert.equal((await f.call('?q=secret%20access%20token')).status,422);
 assert.equal((await f.call('?q=%3Cscript%3E')).status,422);
 assert.equal((await f.call('?case=BUSINESS-CASE-001&extra=1')).status,422);
 assert.equal(CASE_BRIDGE_CATALOG.length,3);
});
