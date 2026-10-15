import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFounderPrivateDepartment,readFounderBusinessDomain} from './founder-business-brief.mjs';

test('private founder DM receives real validated production states, not generic source connected text',()=>{
 const summary=summarizeFounderPrivateDepartment('PRODUCTION',{
  records:[{jobCardNumber:'JC-001',status:'pending',model:'VYNDI Altitude',size:'S',quantity:1},
   {jobCardNumber:'JC-002',status:'in_progress',model:'VYNDI Altitude',size:'M',quantity:2}],
  complete:true
 });
 assert.match(summary,/JC-001.*pending/i);
 assert.match(summary,/JC-002.*in_progress/i);
 assert.match(summary,/2 job cards/i);
 assert.doesNotMatch(summary,/public Slack channel|source.*responded/i);
});

test('supplier request does not pretend shortage read contains a supplier directory',()=>{
 const s=summarizeFounderPrivateDepartment('PROCUREMENT',{records:[{supplierName:'Secret supplier',status:'open'}]},'SUPPLIER_DETAILS');
 assert.match(s,/supplier directory.*not available/i);
 assert.doesNotMatch(s,/Secret supplier/);
});

test('HR private response shows only counts, not employee names or PII',()=>{
 const data={records:[
  {name:'Alice Private',email:'alice@confidential.example',status:'active'},
  {name:'Bob Private',salary:999999,status:'active'}
 ],complete:true};
 const s=summarizeFounderPrivateDepartment('PEOPLE',data);
 assert.match(s,/2 records/i);
 assert.doesNotMatch(s,/Alice|Bob|alice@|999999/);
});

test('unknown record schema fails closed instead of inventing quantities',()=>{
 const s=summarizeFounderPrivateDepartment('PRODUCTION',{whatever:'unknown'});
 assert.match(s,/schema.*not qualified/i);
 assert.doesNotMatch(s,/\b0 jobs\b/);
});

test('signed VYNDI bridge read may expose validated private summary while default channel remains redacted',async()=>{
 const reader=()=>({execute:async({actionType})=>({
  actionType,sourceAuthority:'getProductionJobCards',
  data:{records:[{jobCardNumber:'JC-S',status:'pending',quantity:1,model:'VYNDI Altitude',size:'S'}],complete:true}
 })});
 const safe=await readFounderBusinessDomain('PRODUCTION',{}, {createReader:reader});
 const privateView=await readFounderBusinessDomain('PRODUCTION',{}, {createReader:reader,privateDM:true});
 assert.doesNotMatch(safe.answer,/JC-S/);
 assert.match(privateView.answer,/JC-S/);
 assert.equal(privateView.actionAuthorized,false);
});
