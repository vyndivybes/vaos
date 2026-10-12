import test from 'node:test';import assert from 'node:assert/strict';
import {resolveVoiceIntent,interpretVoiceRecords,formatVoiceAnswer} from './voice-intelligence.mjs';
const examples=[
 ['How are our sales orders?', 'commercial'],
 ['What is our customer order pipeline?','commercial'],
 ['What is the CRM lead conversion?', 'crm'],
 ['Show our receivables and overdue customer payments','finance'],
 ['What is our cash position?','finance'],
 ['How many finance journals are there?', 'finance'],
 ['What is our production status?','production'],
 ['How many job cards are in progress?','production'],
 ['Do we have shortages of carbon material?','procurement'],
 ['Which materials have shortages?','procurement'],
 ['What inventory items are available?','inventory'],
 ['Show our HR headcount','people'],
 ['What is our payroll readiness?','people'],
 ['What engineering change orders are open?','engineering'],
 ['What are our latest engineering baselines?','engineering'],
 ['What is the maintenance status?','maintenance'],
 ['How is the Vāyú group performing?','group'],
 ['What is my pending mission status?','missions'],
 ['Show me mission progress','missions'],
 ['What is the project schedule?','project'],
 ['What is the code deployment status?','documentation'],
 ['Explain the VIBPE source code','documentation'],
];
test('diverse founder questions map to authoritative domains, not generic GitHub excerpt search',()=>{
 for(const [question,expected] of examples)assert.equal(resolveVoiceIntent(question).domain,expected,question);
});
test('mutation, secrets and ambiguity are rejected rather than routed to inference',()=>{
 for(const q of ['approve all purchase orders','update payroll records','pay invoices','show API tokens','','what is the meaning of life?']){
  assert.equal(resolveVoiceIntent(q).domain,'unsupported',q);
 }
});
test('verified commercial data summarizes statuses and ordered units with explicit pagination',()=>{
 const result=interpretVoiceRecords('commercial',{records:[
  {status:'lead',units:1},{status:'confirmed',units:2},{status:'delivered',units:1}
 ]},{limit:100});
 assert.equal(result.status,'OBSERVED');
 assert.match(result.answer,/1 confirmed/i);
 assert.match(result.answer,/2 ordered units/i);
 assert.match(result.answer,/up to 100/i);
 assert.doesNotMatch(result.answer,/revenue.*₹/i);
});
test('HR, finance, engineering and procurement return only safe measured counts',()=>{
 const hr=interpretVoiceRecords('people',{people:[{id:'1',name:'Sensitive',salary:50000,lifecycle_status:'approved'}],authority:[]});
 assert.match(hr.answer,/1 personnel record/i);
 assert.ok(!JSON.stringify(hr).includes('Sensitive'));
 assert.ok(!JSON.stringify(hr).includes('50000'));
 const finance=interpretVoiceRecords('finance',{ledger:[{id:'x',debit:900000}],journals:[{id:'y'}]});
 assert.match(finance.answer,/1 general.ledger/i);
 assert.ok(!JSON.stringify(finance).includes('900000'));
 const shortages=interpretVoiceRecords('procurement',{records:[{shortage_quantity:4,item_id:'raw1'},{shortage_quantity:2,item_id:'raw2'}]});
 assert.match(shortages.answer,/2 material shortage lines/i);
 assert.doesNotMatch(shortages.answer,/6 units/i);
 const eng=interpretVoiceRecords('engineering',{changeOrders:[{id:'e1'}],baselines:[]});
 assert.match(eng.answer,/1 engineering change order/i);
});
test('empty verified records do not imply group-wide all-clear or financial audit',()=>{
 const r=interpretVoiceRecords('procurement',{records:[]});
 assert.match(r.answer,/no matching source rows/i);
 assert.match(r.answer,/not proof/i);
 const f=interpretVoiceRecords('finance',{ledger:[],journals:[]});
 assert.doesNotMatch(f.answer,/cash is zero|no debt|all clear/i);
});
test('malformed schemas cannot become plausible executive answers',()=>{
 assert.throws(()=>interpretVoiceRecords('people',{people:[{name:'x'}]}),/SOURCE_SCHEMA_UNVERIFIED/);
 assert.throws(()=>interpretVoiceRecords('production',{records:[null]}),/SOURCE_SCHEMA_UNVERIFIED/);
 assert.throws(()=>interpretVoiceRecords('finance',{ledger:'empty',journals:[]}),/SOURCE_SCHEMA_UNVERIFIED/);
});
test('unsupported and incomplete domains do not silently substitute unrelated observations',()=>{
 const r=formatVoiceAnswer(resolveVoiceIntent('What is our group profit?'),null);
 assert.equal(r.status,'HOLD');assert.match(r.answer,/not yet qualified|not yet consolidated/i);
 assert.equal(formatVoiceAnswer(resolveVoiceIntent('What is our CRM conversion rate?'),null).status,'HOLD');
});
