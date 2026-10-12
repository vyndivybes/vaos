// Test-only canonical P2P simulator. Never imported into production Worker or VYNDI OS.
// Not a database, ERP, payment gateway, or authority to post actual purchase orders.
import {createHash} from 'node:crypto';

function deny(code){const e=new Error(code);e.code=code;e.retryable=false;throw e;}
function hash(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function nonEmpty(v){return typeof v==='string'&&v.trim().length>0;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function copy(v){return structuredClone(v);}

export function createStage9IsolatedSandbox(options={}){
 if(options.transport!==undefined||options.database!==undefined||options.fetchImpl!==undefined)
  deny('STAGE9_NETWORK_FORBIDDEN');
 const rows=new Map(),byKey=new Map(),events=[];let disabled=false;
 const enabled=()=>{if(disabled)deny('STAGE9_KILL_SWITCH');};
 const view=r=>({...copy(r),sandbox:true,vyndiPosted:false,paymentAuthorized:false,
  evidenceHash:hash(r)});
 const record=(r,action)=>{
  rows.set(r.id,copy(r));
  events.push(Object.freeze({sequence:events.length+1,id:r.id,action,version:r.version,
   state:r.state,evidenceHash:hash(r)}));
  return view(r);
 };
 const load=id=>{
  if(!nonEmpty(id)||!rows.has(id))deny('STAGE9_RECORD_NOT_FOUND');
  return copy(rows.get(id));
 };
 const version=(r,v)=>{if(!Number.isInteger(v)||r.version!==v)deny('STAGE9_STALE_VERSION');};
 const requireState=(r,state,code='STAGE9_HOLD')=>{if(r.state!==state)deny(code);};
 const itemShape=(a,pricing)=>{
  if(!Array.isArray(a)||a.length!==2)return false;
  return a[0]?.size==='M'&&a[1]?.size==='L'&&a.every(x=>
   x&&x.quantity===1&&(pricing?Number.isSafeInteger(x.unitPricePaise)&&x.unitPricePaise>0&&x.unitPricePaise<=1000000:true));
 };
 const exactReceipt=(expected,actual)=>itemShape(actual,false)&&same(actual.map(x=>[x.size,x.quantity]),expected.map(x=>[x.size,x.quantity]));
 return Object.freeze({
  draft(envelope,{maker,materialRevision}={}){
   enabled();
   if(envelope?.contractVersion!=='vyndi-write-bridge.preparation.v1'||
    envelope?.actionType!=='PROCUREMENT.CREATE_PO'||envelope?.executionEnabled!==false||
    !nonEmpty(envelope.idempotencyKey)||!nonEmpty(envelope.approvalRef)||
    !nonEmpty(envelope.missionId)||!nonEmpty(envelope.intentId))
    deny('STAGE9_SANDBOX_ENVELOPE_REQUIRED');
   if(materialRevision!=='CANDIDATE-ONLY')deny('STAGE9_CANDIDATE_MATERIAL_ONLY');
   if(!nonEmpty(maker))deny('STAGE9_MAKER_REQUIRED');
   const fingerprint=hash({envelope,materialRevision,maker}),key=envelope.idempotencyKey;
   // Deny reuse of an admitted key before validating its new payload.
   // Otherwise malformed replays could mask an idempotency collision.
   if(byKey.has(key)){
    const prev=byKey.get(key);
    if(prev.fingerprint!==fingerprint)deny('STAGE9_IDEMPOTENCY_CONFLICT');
    return {...view(load(prev.id)),replay:true};
   }
   const input=envelope.input;
   if(input?.supplier!=='SYNTHETIC_NOT_REAL')deny('STAGE9_SYNTHETIC_SUPPLIER_ONLY');
   if(input?.model!=='VYNDI Altitude'||input.currency!=='INR'||input.materialStatus!=='UNFROZEN'||
    !itemShape(input.variants,true))deny('STAGE9_PILOT_SCOPE_INVALID');
   const r={id:'SYNTHETIC-PO-'+hash(key).slice(0,16).toUpperCase(),version:1,state:'DRAFT',
    model:input.model,variantsAreConfigurations:true,items:copy(input.variants),
    supplier:input.supplier,currency:input.currency,materialRevision,materialStatus:'UNFROZEN',
    maker,approvalRef:envelope.approvalRef,sourceReference:envelope.sourceReference,
    idempotencyKey:key};
   byKey.set(key,{id:r.id,fingerprint});
   return record(r,'DRAFT');
  },
  approve({id,checker,approvalRef,expectedVersion}={}){
   enabled();const r=load(id);version(r,expectedVersion);requireState(r,'DRAFT');
   if(!nonEmpty(checker)||checker===r.maker)deny('STAGE9_SOD_DENIED');
   if(approvalRef!==r.approvalRef)deny('STAGE9_APPROVAL_DENIED');
   r.checker=checker;r.version++;r.state='APPROVED';
   return record(r,'APPROVED');
  },
  receive({id,receiver,receiptId,items,expectedVersion}={}){
   enabled();const r=load(id);version(r,expectedVersion);requireState(r,'APPROVED');
   if(!nonEmpty(receiver)||receiver===r.maker||!nonEmpty(receiptId))
    deny('STAGE9_RECEIVING_ROLE_INVALID');
   if(!exactReceipt(r.items,items))deny('STAGE9_RECEIPT_MISMATCH');
   r.receiver=receiver;r.receiptId=receiptId;r.receiptItems=copy(items);r.version++;
   r.state='RECEIVED_PENDING_QA';
   return record(r,'RECEIVED_PENDING_QA');
  },
  acceptQa({id,inspector,passed,expectedVersion}={}){
   enabled();const r=load(id);version(r,expectedVersion);
   requireState(r,'RECEIVED_PENDING_QA','STAGE9_QA_REQUIRED');
   if(!nonEmpty(inspector)||inspector===r.maker||inspector===r.receiver||
    typeof passed!=='boolean')deny('STAGE9_QA_INDEPENDENCE_REQUIRED');
   r.qaInspector=inspector;r.version++;r.state=passed?'QA_ACCEPTED':'HOLD_QA';
   return record(r,'QA_INSPECTED');
  },
  invoice({id,invoiceId,clerk,items,expectedVersion}={}){
   enabled();const r=load(id);
   if(r.state!=='QA_ACCEPTED')deny('STAGE9_QA_REQUIRED');
   version(r,expectedVersion);
   if(!nonEmpty(clerk)||!nonEmpty(invoiceId)||clerk===r.maker)
    deny('STAGE9_INVOICE_ROLE_INVALID');
   if(!itemShape(items,true)||!same(items,r.items)||!exactReceipt(r.receiptItems,items))
    deny('STAGE9_THREE_WAY_MISMATCH');
   const amount=r.items.reduce((sum,x)=>sum+x.quantity*x.unitPricePaise,0);
   r.invoiceId=invoiceId;r.invoiceTotalPaise=amount;r.invoiceMatchedBy=clerk;
   r.version++;r.state='INVOICE_MATCHED_NOT_POSTED';
   return record(r,'INVOICE_MATCHED_NO_PAYMENT');
  },
  holdUnknownOutcome({id,reason}={}){
   enabled();const r=load(id);if(!nonEmpty(reason))deny('STAGE9_HOLD_REASON_REQUIRED');
   if(['INVOICE_MATCHED_NOT_POSTED','HOLD_QA','HOLD_UNKNOWN_OUTCOME'].includes(r.state))
    deny('STAGE9_HOLD');
   r.state='HOLD_UNKNOWN_OUTCOME';r.version++;r.holdReason=reason;
   return record(r,'HOLD_UNKNOWN_OUTCOME');
  },
  emergencyDisable(){disabled=true;return Object.freeze({disabled:true,businessWrites:false});},
  readback(id){return view(load(id));},
  audit(){return copy(events);},
  count(){return rows.size;},
 });
}
