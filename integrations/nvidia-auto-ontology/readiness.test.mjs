import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNvidiaAutoOntology,validateOntologyOrigin} from './readiness.mjs';

const configured={
 NVIDIA_AUTO_ONTOLOGY_URL:'https://ontology.example.com',
 NVIDIA_AUTO_ONTOLOGY_API_TOKEN:'test-token-never-return',
};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const fixture=async(url,options)=>{
 const path=new URL(url).pathname;
 assert.equal(options.method,'GET'); assert.equal(options.redirect,'error');
 assert.equal(options.headers['x-api-key'],configured.NVIDIA_AUTO_ONTOLOGY_API_TOKEN);
 if(path==='/api/semantic-compilation/status')return reply({calculated:true});
 if(path==='/api/connections')return reply({count:1});
 if(path==='/api/datasources/dbs')return reply({data:[{name:'confidential_internal_schema'}]});
 throw Error('UNEXPECTED_PATH');
};
test('commissioning readiness checks all three NVIDIA prerequisites and returns only metadata',async()=>{
 const calls=[];
 const data=await inspectNvidiaAutoOntology(configured,{fetchImpl:async(url,options)=>{calls.push(new URL(url).pathname);return fixture(url,options);}});
 assert.deepEqual(calls,['/api/semantic-compilation/status','/api/connections','/api/datasources/dbs']);
 assert.deepEqual(data,{schemaVersion:'VAOS_NVIDIA_ONTOLOGY_READINESS_V1',status:'READY',reason:'READINESS_OBSERVED',readOnly:true,
  semanticLayerBuilt:true,connectionPresent:true,catalogPresent:true,
  sourceDataTransferred:false,modelAnswersVerified:false,productionWriteAuthorized:false});
 assert.doesNotMatch(JSON.stringify(data),/test-token|confidential_internal/);
});
test('missing configuration is HOLD, and cannot trigger outbound requests',async()=>{
 let count=0;const fetchImpl=()=>{count++;throw Error('must not fetch')};
 for(const env of [{},{NVIDIA_AUTO_ONTOLOGY_URL:configured.NVIDIA_AUTO_ONTOLOGY_URL},
  {NVIDIA_AUTO_ONTOLOGY_URL:'http://127.0.0.1:3000',NVIDIA_AUTO_ONTOLOGY_API_TOKEN:'x'},
  {NVIDIA_AUTO_ONTOLOGY_URL:'https://user:pass@example.com',NVIDIA_AUTO_ONTOLOGY_API_TOKEN:'x'},
  {NVIDIA_AUTO_ONTOLOGY_URL:'https://ontology.example.com/path',NVIDIA_AUTO_ONTOLOGY_API_TOKEN:'x'}]){
  const d=await inspectNvidiaAutoOntology(env,{fetchImpl});assert.equal(d.status,'HOLD');
  assert.equal(d.productionWriteAuthorized,false);
 }
 assert.equal(count,0);
});
test('hostnames must be public HTTPS web origins; FastAPI and localhost are refused',()=>{
 for(const invalid of ['http://ontology.example.com','https://localhost:3000','https://127.0.0.1:3001',
  'https://10.0.0.1','https://[::1]','https://private.internal','https://ontology.example.com:3001',
  'https://a.example.com/?token=x','https://a.example.com/#secret','https://a.example.com/%2e%2e']){
  assert.equal(validateOntologyOrigin(invalid),null,invalid);
 }
 assert.equal(validateOntologyOrigin('https://ontology.example.com/'),'https://ontology.example.com');
});
test('noncompiled layer, missing connection, and empty catalog are individual HOLD reasons',async()=>{
 for(const [path,body,expected] of [
  ['/api/semantic-compilation/status',{calculated:false},'SEMANTIC_LAYER_NOT_READY'],
  ['/api/connections',{count:0},'CONNECTION_NOT_READY'],
  ['/api/datasources/dbs',{data:[]},'CATALOG_NOT_READY']]){
  const data=await inspectNvidiaAutoOntology(configured,{fetchImpl:(url,o)=>new URL(url).pathname===path?Promise.resolve(reply(body)):fixture(url,o)});
  assert.equal(data.status,'HOLD');assert.equal(data.reason,expected);assert.equal(data.modelAnswersVerified,false);
 }
});
test('auth rejection, restricted probes, transport failure and oversized response fail closed',async()=>{
 for(const [override,expected] of [
  [async()=>reply({error:'a secret from server'},401),'ONTOLOGY_AUTH_REJECTED'],
  [async()=>reply({},403),'ONTOLOGY_PERMISSION_UNVERIFIED'],
  [async()=>{throw Error('test-token-never-return private stack trace')},'ONTOLOGY_TRANSPORT_HOLD'],
  [async()=>new Response('x'.repeat(35000),{headers:{'content-type':'application/json'}}),'ONTOLOGY_RESPONSE_UNQUALIFIED'],
  [async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}}),'ONTOLOGY_RESPONSE_UNQUALIFIED'],
 ]){
  const data=await inspectNvidiaAutoOntology(configured,{fetchImpl:override});
  assert.equal(data.reason,expected);assert.equal(data.status,'HOLD');
  assert.doesNotMatch(JSON.stringify(data),/test-token|private stack|secret from server/);
 }
});
