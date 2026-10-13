import test from 'node:test';
import assert from 'node:assert/strict';
import { eligiblePreviews, cleanupPreviews } from './preview-cleanup.mjs';

const now = Date.parse('2026-10-14T03:00:00Z');
const older = '2026-10-13T00:00:00Z';
const preview = (name='feat/closed') => ({id:'preview-1',name,slug:name.replaceAll('/','-'),created_on:older,updated_on:older,deployed_on:older});
const pull = (name='feat/closed',merged=true) => ({state:'closed',head:{ref:name,repo:{full_name:'vyndivybes/vaos'}},merged_at:merged?older:null});

test('eligible only when merged, expired and branch has no open PR', () => {
 const arr=[preview(),preview('feat/open')];
 assert.deepEqual(eligiblePreviews({previews:arr,closed:[pull(),pull('feat/open')],open:[{head:{ref:'feat/open',repo:{full_name:'vyndivybes/vaos'}}}],now}),[arr[0]]);
 assert.equal(eligiblePreviews({previews:arr,closed:[pull('feat/closed',false)],open:[],now}).length,0);
});
test('never deletes stateful preview or mismatched namespace', async () => {
 const requests=[];
 const cf=async (method,path) => {requests.push([method,path]);if(path.endsWith('/objects'))return {success:true,result:[{id:'contains-data'}]};return {success:true};};
 const result=await cleanupPreviews({previews:[preview()],namespaces:[{id:'ns1',name:'vaos_feat-closed_ActivepiecesMcpHandshake',script:'vaos'},{id:'ns2',name:'vaos_feat-closed_WindmillAdmissionCoordinator',script:'vaos'}],closed:[pull()],open:[],now,apply:true,cf});
 assert.equal(result.deleted.length,0);
 assert.equal(requests.filter(x=>x[0]==='DELETE').length,0);
});
test('deletes verified-empty obsolete preview without force', async () => {
 const calls=[];const cf=async (method,path)=>{calls.push([method,path]);return {success:true,result:[]}};
 const r=await cleanupPreviews({previews:[preview()],namespaces:[{id:'ns1',name:'vaos_feat-closed_ActivepiecesMcpHandshake',script:'vaos'},{id:'ns2',name:'vaos_feat-closed_WindmillAdmissionCoordinator',script:'vaos'}],closed:[pull()],open:[],now,apply:true,cf});
 assert.deepEqual(r.deleted,['feat/closed']);
 assert.deepEqual(calls.filter(x=>x[0]==='DELETE').map(x=>x[1]),['/accounts/ACCOUNT/workers/workers/vaos/previews/preview-1']);
});
test('dry run makes no DELETE requests', async () => {
 const calls=[];const cf=async (method,path)=>{calls.push([method,path]);return {success:true,result:[]}};
 const r=await cleanupPreviews({previews:[preview()],namespaces:[],closed:[pull()],open:[],now,apply:false,cf});
 assert.equal(r.deleted.length,0);assert.equal(r.planned.length,1);assert.equal(calls.length,0);
});
test('unmerged, too-fresh, and foreign pull requests cannot authorize cleanup', () => {
 assert.equal(eligiblePreviews({previews:[preview()],closed:[pull('feat/closed',false)],open:[],now}).length,0);
 assert.equal(eligiblePreviews({previews:[preview()],closed:[{...pull(),head:{ref:'feat/closed',repo:{full_name:'external/fork'}}}],open:[],now}).length,0);
 assert.equal(eligiblePreviews({previews:[{...preview(),updated_on:'2026-10-14T01:00:00Z'}],closed:[pull()],open:[],now}).length,0);
});
test('mismatched deployed namespace count fails closed', async () => {
 let count=0;const cf=async()=>{count++;return {success:true,result:[]}};
 const r=await cleanupPreviews({previews:[preview()],namespaces:[{id:'only1',name:'vaos_feat-closed_ActivepiecesMcpHandshake',script:'vaos'}],closed:[pull()],open:[],now,apply:true,cf});
 assert.equal(r.deleted.length,0);assert.equal(count,0);
});
test('undeployed and unused merged preview can release preview slot', async () => {
 const calls=[];const cf=async(method,path)=>{calls.push({method,path});return {success:true,result:[]}};
 const r=await cleanupPreviews({previews:[{...preview(),deployed_on:null}],namespaces:[],closed:[pull()],open:[],now,apply:true,cf});
 assert.equal(r.deleted.length,1);assert.equal(calls.length,1);assert.equal(calls[0].method,'DELETE');
});
