import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoricalStore,normaliseHistoryRecord} from './history-index.mjs';

async function fixture(){
 const bucket=new Map();
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const env={VAOS_GOOGLE_VAULT_KEY:key,VAOS_ARTIFACTS:{
  async get(id){return bucket.has(id)?{size:bucket.get(id).length,httpEtag:'"'+id.length+'"',async text(){return bucket.get(id)}}:null},
  async put(id,body,opts){if(opts?.onlyIf?.get('If-None-Match')==='*'&&bucket.has(id))return null;
   bucket.set(id,body);return {etag:'"ok"'};},
  async delete(id){bucket.delete(id)}
 }};
 return {env,bucket,index:createHistoricalStore(env)};
}
const record=(id,body='carbon bicycle BOM cost')=>({id,title:'Project note '+id,body,
 sourceRef:'local:'+id,kind:'note',modifiedAt:'2026-11-06T10:00:00Z',complete:true});
test('rejects unknown sources, unsafe identifiers and oversized bodies',()=>{
 assert.throws(()=>normaliseHistoryRecord('unknown',record('one')),/SOURCE_DENIED/);
 assert.throws(()=>normaliseHistoryRecord('obsidian',record('../evil')),/RECORD_INVALID/);
 assert.throws(()=>normaliseHistoryRecord('obsidian',record('ok','a'.repeat(70000))),/RECORD_TOO_LARGE/);
});
test('AES-256-GCM storage never writes plaintext and is idempotent across identical source revisions',async()=>{
 const {index,bucket}=await fixture();
 const first=await index.ingest('obsidian',[record('note-1','Highly private research on composite bicycle geometry')]);
 assert.equal(first.added,1);assert.equal(first.updated,0);
 const second=await index.ingest('obsidian',[record('note-1','Highly private research on composite bicycle geometry')]);
 assert.equal(second.added,0);assert.equal(second.unchanged,1);
 assert.doesNotMatch([...bucket.values()].join(' '),/Highly private research|Project note/);
 const result=await index.search({sources:['obsidian'],query:'composite'});
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].title,'Project note note-1');
 assert.equal(result.matches[0].source,'obsidian');
 assert.equal(result.matches[0].complete,true);
 assert.equal(result.actionAuthorized,false);
});
test('modified source content replaces the same record, never duplicates it',async()=>{
 const {index}=await fixture();
 await index.ingest('chatgpt',[record('m1','First revision')]);
 const update=await index.ingest('chatgpt',[record('m1','Second revision')]);
 assert.equal(update.updated,1);
 const status=await index.status();
 assert.equal(status.sources.find(x=>x.source==='chatgpt').items,1);
 assert.equal((await index.search({sources:['chatgpt'],query:'Second'})).matches.length,1);
 assert.equal((await index.search({sources:['chatgpt'],query:'First'})).matches.length,0);
});
test('cursor search does not imply completeness until all encrypted records have been scanned',async()=>{
 const {index}=await fixture();
 await index.ingest('graphiti',[record('a','alpha'),record('b','beta'),record('c','alpha')]);
 const page1=await index.search({sources:['graphiti'],query:'alpha',limit:1,cursor:0});
 assert.equal(page1.scanned,1);assert.equal(page1.complete,false);
 const page2=await index.search({sources:['graphiti'],query:'alpha',limit:2,cursor:page1.nextCursor});
 assert.equal(page2.complete,true);assert.equal(page2.scanned,2);
 assert.equal(page1.matches.length+page2.matches.length,2);
});
test('founder can remove a source from encrypted storage with bounded removal',async()=>{
 const {index,bucket}=await fixture();
 await index.ingest('gmail',[record('a','private a'),record('b','private b')]);
 const first=await index.purge('gmail',{limit:1});
 assert.equal(first.remaining,1);
 const second=await index.purge('gmail',{limit:10});
 assert.equal(second.remaining,0);
 assert.equal((await index.search({sources:['gmail'],query:'private'})).matches.length,0);
 assert.equal([...bucket.keys()].filter(k=>k.includes('/gmail/')).length,0);
});
test('no vault key or storage binding means HOLD not plaintext fallback',async()=>{
 const index=createHistoricalStore({VAOS_ARTIFACTS:{get(){},put(){}}});
 await assert.rejects(index.ingest('gmail',[record('x')]),/VAULT_UNAVAILABLE/);
});
