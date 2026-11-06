import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHistorySearch,searchHistoryRecord} from './historical-knowledge-search.mjs';

test('search requires authorized source and bounded query',()=>{
 assert.deepEqual(validateHistorySearch({source:'gmail',query:'engineering'}),{source:'gmail',query:'engineering',cursor:null});
 assert.throws(()=>validateHistorySearch({source:'gmail',query:'x'}));
 assert.throws(()=>validateHistorySearch({source:'other',query:'engineering'}));
 assert.throws(()=>validateHistorySearch({source:'drive',query:'engineering',url:'outside'}));
});
test('full text search returns only bounded source-linked excerpts',()=>{
 const found=searchHistoryRecord({source:'gmail',id:'a',subject:'Decision about design',
  text:'A recorded design decision with documented rationale.'},'design');
 assert.equal(found.id,'a');
 assert.equal(found.source,'gmail');
 assert.ok(found.excerpt.includes('design'));
 assert.equal(found.text,undefined);
 assert.equal(searchHistoryRecord({source:'gmail',id:'b',subject:'Unrelated',text:'none'},'design'),null);
});
