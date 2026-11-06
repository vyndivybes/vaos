import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRepositoryInventory} from './universe-repositories.mjs';

test('repository inventory returns bounded source metadata only',()=>{
 const raw=[{id:31,full_name:'vyndivybes/vaos',owner:{login:'vyndivybes'},
  private:true,default_branch:'main',updated_at:'2026-11-06T08:00:00Z',
  description:'Private account',permissions:{admin:true},token:'should-not-leak'}];
 const out=normalizeRepositoryInventory(raw);
 assert.equal(out.length,1);
 assert.equal(out[0].fullName,'vyndivybes/vaos');
 assert.equal(out[0].owner,'vyndivybes');
 assert.equal(out[0].isPrivate,true);
 assert.doesNotMatch(JSON.stringify(out),/should-not-leak|permissions/);
});
test('invalid repository identifiers do not enter founder graph',()=>{
 const out=normalizeRepositoryInventory([{full_name:'invalid'},null,{full_name:'good/name'}]);
 assert.deepEqual(out.map(x=>x.fullName),['good/name']);
});
