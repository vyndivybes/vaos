import test from 'node:test';
import assert from 'node:assert/strict';
import {VYNDI_BRIDGE_ROUTES,getVyndiBridgeRoute,getVyndiBridgeReadiness} from '../../packages/contracts/vyndi-write-bridge.mjs';
import {prepareVyndiBridgeEnvelope,createVyndiWriteBridgeAdapter} from '../execution/vyndi-write-bridge.mjs';

const pilot={employeeId:'procurement',actionType:'PROCUREMENT.CREATE_PO',missionId:'FRAME-PROTOTYPES-2',intentId:'SANDBOX-001',idempotencyKey:'P2P-001',approvalRef:'REVIEW-001',input:{model:'VYNDI Altitude',variants:[{size:'M',qty:1},{size:'L',qty:1}]}};
test('VYNDI bridge remains restricted: all write routes are disabled',()=>{
 const r=getVyndiBridgeReadiness();
 assert.equal(r.routeCount,24);assert.equal(r.readReady,9);assert.equal(r.writePrepared,15);
 assert.deepEqual(r.gaps,[]);
 assert.equal(VYNDI_BRIDGE_ROUTES.filter(x=>x.effectClass==='mutation'&&x.executionEnabled).length,0);
});
test('Procurement can observe shortages but not execute PO writes',async()=>{
 assert.equal(getVyndiBridgeRoute('PROCUREMENT.OBSERVE_SHORTAGE').executionEnabled,true);
 assert.equal(getVyndiBridgeRoute('PROCUREMENT.CREATE_PO').executionEnabled,false);
 assert.equal(getVyndiBridgeRoute('PROCUREMENT.CHANGE_PO').executionEnabled,false);
 let calls=0;
 const bridge=createVyndiWriteBridgeAdapter({transport:async()=>{calls++;return {ok:true}}});
 const prepared=bridge.prepare(pilot);
 assert.equal(prepared.executionEnabled,false);
 assert.equal(prepared.target.authority,'submitDraftPurchaseOrder');
 assert.equal(prepared.sourceReference,'VAOS|FRAME-PROTOTYPES-2|SANDBOX-001');
 await assert.rejects(()=>bridge.execute(prepared),e=>e.code==='VYNDI_WRITE_BRIDGE_NOT_COMMISSIONED');
 assert.equal(calls,0);
});
test('PO preparation requires explicit approval and correct employee',()=>{
 const {approvalRef,...withoutApproval}=pilot;
 assert.throws(()=>prepareVyndiBridgeEnvelope(withoutApproval),e=>e.code==='VYNDI_BRIDGE_APPROVAL_REQUIRED');
 assert.throws(()=>prepareVyndiBridgeEnvelope({...pilot,employeeId:'finance'}),e=>e.code==='VYNDI_BRIDGE_EMPLOYEE_MISMATCH');
});
test('Full P2P remains on hold until receipt and supplier invoice posting are qualified',()=>{
 const routes=new Set(VYNDI_BRIDGE_ROUTES.map(x=>x.actionType));
 assert.equal(routes.has('INVENTORY.RECEIVE_GOODS'),false);
 assert.equal(routes.has('FINANCE.POST_SUPPLIER_INVOICE'),false);
 assert.equal(routes.has('FINANCE.POST_PAYMENT'),false);
});
