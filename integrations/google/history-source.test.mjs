import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoogleHistoryPage} from './history-source.mjs';

const encode=s=>btoa(unescape(encodeURIComponent(s))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
test('Gmail page follows Google continuation token, retrieves text and preserves source ID',async()=>{
 const urls=[];
 const fetchImpl=async(url,init)=>{
  urls.push(url);
  assert.match(init.headers.Authorization,/Bearer bounded-token/);
  if(url.includes('/messages?'))return Response.json({messages:[{id:'msg1234567'}],nextPageToken:'pageNEXT'});
  if(url.includes('/messages/msg1234567'))return Response.json({id:'msg1234567',internalDate:'1793969000000',
   payload:{headers:[{name:'Subject',value:'Factory checklist'}],
    parts:[{mimeType:'text/plain',body:{data:encode('Full private mail body.')}}]}});
  throw Error('Unexpected URL');
 };
 const result=await readGoogleHistoryPage({source:'gmail',token:'bounded-token',cursor:'previous',
  fetchImpl});
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].body,'Full private mail body.');
 assert.equal(result.records[0].complete,true);
 assert.equal(result.nextCursor,'pageNEXT');
 assert.equal(result.complete,false);
 assert.match(urls[0],/pageToken=previous/);
 assert.equal(urls.length,2);
});
test('Gmail attachment-only content reports incomplete extraction',async()=>{
 const fetchImpl=async(url)=>url.includes('/messages?')?
  Response.json({messages:[{id:'msg7890123'}],resultSizeEstimate:1}):
  Response.json({id:'msg7890123',snippet:'Only preview',
   payload:{headers:[{name:'Subject',value:'Attachment'}],
    parts:[{mimeType:'application/pdf',filename:'scan.pdf',body:{attachmentId:'a'}}]}});
 const result=await readGoogleHistoryPage({source:'gmail',token:'bounded-token',fetchImpl});
 assert.equal(result.records[0].complete,false);
 assert.equal(result.records[0].body,'Only preview');
 assert.equal(result.complete,true);
});
test('Drive exports Google Docs, retains non-extractable PDF metadata without pretending content coverage',async()=>{
 const requests=[];
 const fetchImpl=async(url,init)=>{
  requests.push(url);
  if(url.includes('/drive/v3/files?'))return Response.json({files:[
   {id:'docABC123',name:'Engineering note',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-11-06T00:00:00Z'},
   {id:'pdfABC123',name:'Drawing.pdf',mimeType:'application/pdf',modifiedTime:'2026-11-06T00:00:00Z'}
  ]});
  if(url.includes('/docABC123/export'))return new Response('Design revision 5.3.9');
  throw Error('Unexpected');
 };
 const out=await readGoogleHistoryPage({source:'drive',token:'bounded-token',fetchImpl});
 assert.equal(out.records.length,2);
 assert.equal(out.records[0].body,'Design revision 5.3.9');
 assert.equal(out.records[0].complete,true);
 assert.equal(out.records[1].body,'');
 assert.equal(out.records[1].complete,false);
 assert.ok(!requests.some(x=>x.includes('/pdfABC123/')));
});
test('reader rejects unsupported sources and never reaches arbitrary hosts',async()=>{
 await assert.rejects(readGoogleHistoryPage({source:'obsidian',token:'bounded-token',
  fetchImpl:()=>{throw Error('should not fetch')}}),/SOURCE_DENIED/);
});
