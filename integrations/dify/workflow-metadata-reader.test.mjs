import test from 'node:test';
import assert from 'node:assert/strict';
import {readDifyWorkflowMetadata} from './workflow-metadata-reader.mjs';

const readOnlyResponse={data:[
 {id:'log-a',workflow_run:{id:'b7e10000-0000-4000-8000-000000000001',status:'succeeded',created_at:1793930000,inputs:{secret:'UNSAFE_INPUT'},outputs:{secret:'UNSAFE_OUTPUT'}}},
 {id:'log-b',workflow_run:{id:'b7e10000-0000-4000-8000-000000000002',status:'failed',created_at:1793930080,inputs:{secret:'UNSAFE_INPUT'}}}
],has_more:false};
test('Dify reader uses bounded GET logs only, strips every prompt, output and credential',async()=>{
 let seen;
 const fetchImpl=async(url,options)=>{seen={url,options};return{ok:true,json:async()=>readOnlyResponse}};
 const result=await readDifyWorkflowMetadata({env:{DIFY_API_KEY:'secret-dify-key'},fetchImpl,now:()=>new Date('2026-11-06T04:00:00Z')});
 assert.equal(seen.options.method,'GET');
 assert.equal(seen.options.redirect,'error');
 assert.match(seen.url,/^https:\/\/api\.dify\.ai\/v1\/workflows\/logs\?/);
 assert.match(seen.options.headers.Authorization,/^Bearer /);
 assert.equal(result.sourceType,'dify');
 assert.equal(result.schemaVersion,'VAOS_NEUTRAL_GRAPH_SOURCE_V1');
 assert.match(result.sourceRevision,/^[a-f0-9]{64}$/);
 assert.equal(result.payload.nodes.length,2);
 assert.deepEqual(result.payload.edges,[]);
 assert.ok(result.payload.nodes.every(n=>n.type==='workflow_run'));
 assert.equal(JSON.stringify(result).includes('UNSAFE_INPUT'),false);
 assert.equal(JSON.stringify(result).includes('UNSAFE_OUTPUT'),false);
 assert.equal(JSON.stringify(result).includes('secret-dify-key'),false);
});
test('Dify reader fails closed for absent token and malformed upstream response',async()=>{
 const fetchImpl=async()=>({ok:true,json:async()=>({data:{}})});
 await assert.rejects(()=>readDifyWorkflowMetadata({env:{},fetchImpl}),/DIFY_NOT_COMMISSIONED/);
 await assert.rejects(()=>readDifyWorkflowMetadata({env:{DIFY_API_KEY:'ok'},fetchImpl}),/DIFY_FORMAT_INVALID/);
 await assert.rejects(()=>readDifyWorkflowMetadata({env:{DIFY_API_KEY:'ok'},fetchImpl:async()=>({ok:false,status:401})}),/DIFY_SOURCE_UNAVAILABLE/);
});
test('Dify reader accepts empty run history as genuinely empty, without synthesized graph edges',async()=>{
 const out=await readDifyWorkflowMetadata({env:{DIFY_API_KEY:'ok'},fetchImpl:async()=>({ok:true,json:async()=>({data:[]})})});
 assert.deepEqual(out.payload.nodes,[]);
 assert.deepEqual(out.payload.edges,[]);
});
