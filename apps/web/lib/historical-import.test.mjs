import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConversationExport,parseMarkdownNote,parseKnowledgeExport} from './historical-import.mjs';

test('ChatGPT export indexes full textual messages and exact parent-child edges',()=>{
 const input=[{id:'conv1',title:'Bike engineering',mapping:{
  m1:{id:'m1',parent:null,message:{author:{role:'user'},create_time:1793950000,
   content:{parts:['Review the carbon layup specification']}}},
  m2:{id:'m2',parent:'m1',message:{author:{role:'assistant'},content:{parts:['Approval is not automatic']}}}
 }}];
 const docs=parseConversationExport(input);
 assert.equal(docs.length,2);
 assert.match(docs[0].body,/carbon layup/);
 assert.deepEqual(docs[0].links,[{targetId:'conv1:m2',relation:'REPLIES_TO'}]);
 assert.equal(docs[0].complete,true);
});
test('multimodal or unreadable ChatGPT parts are marked incomplete',()=>{
 const input=[{id:'c',mapping:{a:{message:{author:{role:'user'},content:{parts:[{content_type:'image_asset_pointer'}]}}}}}];
 const rows=parseConversationExport(input);
 assert.equal(rows.length,1);assert.equal(rows[0].complete,false);
});
test('Obsidian Markdown uses stable path-specific identifiers and preserves full text',async()=>{
 const a=await parseMarkdownNote('Design/Frame geometry.md','# Laminate schedule\n[T47](../BB.md)');
 const b=await parseMarkdownNote('Other/Frame geometry.md','# Other note');
 assert.notEqual(a.id,b.id);
 assert.equal(a.body,'# Laminate schedule\n[T47](../BB.md)');
 assert.equal(a.complete,true);
 assert.match(a.sourceRef,/obsidian:/);
});
test('Graphiti export preserves its native asserted fact relationships',async()=>{
 const records=await parseKnowledgeExport('graphiti',{entities:[
  {id:'node1',name:'VYNDI bicycle',description:'Engineering brief'},
  {id:'node2',name:'Quality approval',description:'Recorded decision'}
 ],facts:[{source:'node1',target:'node2',relation:'REQUIRES'}]});
 assert.equal(records.length,2);
 assert.equal(records[0].links.length,1);
 assert.equal(records[0].links[0].targetId,records[1].id);
 assert.equal(records[0].body,'Engineering brief');
});
test('Graphify topology-only export never claims complete document content',async()=>{
 const rows=await parseKnowledgeExport('graphify',{nodes:[{id:'x',title:'Repository bridge',type:'function'}],edges:[]});
 assert.equal(rows.length,1);assert.equal(rows[0].complete,false);
});
