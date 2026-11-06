import test from 'node:test';
import assert from 'node:assert/strict';
import {readGitHubHistoryPage} from './history-source.mjs';
const owner='vyndivybes/vaos';
const sha='a'.repeat(40);
const blobSha='b'.repeat(40);
const b64=s=>btoa(s);
const ok=o=>Response.json(o,{status:200});
test('GitHub history reads pinned repository tree content and skips secret files',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push(url);
  assert.match(opts.headers.Authorization,/Bearer a-verified-github-token/);
  if(url.includes('/installation/repositories'))return ok({repositories:[
   {full_name:owner,default_branch:'main'}]});
  if(url.includes('/git/ref/heads/main'))return ok({object:{sha}});
  if(url.includes('/git/trees/'+sha))return ok({truncated:false,tree:[
   {type:'blob',path:'docs/design.md',sha:blobSha,size:22},
   {type:'blob',path:'.env.production',sha:blobSha,size:10},
   {type:'blob',path:'secret/service-token.json',sha:blobSha,size:20}
  ]});
  if(url.includes('/contents/docs/design.md'))return ok({sha:blobSha,encoding:'base64',content:b64('Carbon frame geometry v5.3'),size:26});
  throw Error('unexpected url '+url);
 };
 const out=await readGitHubHistoryPage({token:'a-verified-github-token',fetchImpl});
 assert.equal(out.records.length,2); // repository plus design file
 assert.equal(out.records[1].body,'Carbon frame geometry v5.3');
 assert.equal(out.records[1].complete,true);
 assert.ok(out.records[1].links.some(x=>x.relation==='PART_OF'));
 assert.equal(out.complete,true);
 assert.doesNotMatch(calls.join(' '),/\.env.production|service-token.json/);
});
test('GitHub source pagination exposes resumable revision-pinned cursor',async()=>{
 const calls=[];
 const fetchImpl=async(url)=>{
  calls.push(url);
  if(url.includes('/installation/repositories'))return ok({repositories:[{full_name:owner,default_branch:'main'}]});
  if(url.includes('/git/ref/heads/main'))return ok({object:{sha}});
  if(url.includes('/git/trees/'))return ok({truncated:false,tree:Array.from({length:12},(_,i)=>({
   type:'blob',path:'docs/n'+i+'.md',sha:blobSha,size:5}))});
  if(url.includes('/contents/'))return ok({sha:blobSha,encoding:'base64',content:b64('note'),size:4});
  throw Error('unexpected');
 };
 const first=await readGitHubHistoryPage({token:'a-verified-github-token',fetchImpl});
 assert.equal(first.complete,false);
 assert.ok(first.nextCursor);
 const second=await readGitHubHistoryPage({token:'a-verified-github-token',cursor:first.nextCursor,fetchImpl});
 assert.equal(second.complete,true);
 assert.ok(!calls.some(u=>u.includes('raw.githubusercontent.com')));
});
test('tree truncation stops rather than claiming full history',async()=>{
 const fetchImpl=async(url)=>{
  if(url.includes('/installation/repositories'))return ok({repositories:[{full_name:owner,default_branch:'main'}]});
  if(url.includes('/git/ref/heads/main'))return ok({object:{sha}});
  return ok({truncated:true,tree:[]});
 };
 await assert.rejects(readGitHubHistoryPage({token:'a-verified-github-token',fetchImpl}),/TREE_TRUNCATED/);
});
