import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {runScheduledOntologyRefresh,ONTOLOGY_REFRESH_CRON} from './ontology-scheduled-refresh.mjs';

const flags=enabled=>({VAOS_FEATURE_FLAGS:JSON.stringify({
 VAOS_ONTOLOGY_AUTO_REFRESH_CONTROL:enabled?'signed-readonly-v1':'off',
})});
const when=minute=>Date.UTC(2026,10,5,12,minute);
function digestCanonical({sourceKind,sourceScope,sourceCount,records}){
 return JSON.stringify({records,sourceCount,sourceKind,sourceScope});
}
async function signedObservation(kind){
 const info={
  inventory:{actionType:'INVENTORY.OBSERVE_STOCK',sourceAuthority:'getAuthoritativeInventory',
   sourceScope:'vyndi_inventory_balance:all',records:[{quantity_balance:3,sku:'F1',unit:'pcs'}]},
  shortages:{actionType:'PROCUREMENT.OBSERVE_SHORTAGE',sourceAuthority:'source-checked-in-contract',
   sourceScope:'vyndi_live_job_card_requirements:released_in_progress_positive_shortage',records:[]},
  purchaseOrders:{actionType:'PROCUREMENT.OBSERVE_OPEN_POS',sourceAuthority:'source-checked-in-contract',
   sourceScope:'vyndi_purchase_orders:open_status_v1',records:[{demand_lineage_state:'CANCELLED_UPSTREAM_DEMAND',id:'PO1',status:'draft'}]},
 }[kind];
 if(!info)throw Error('unexpected source');
 const sourceCount=info.records.length;
 const input={sourceKind:kind,sourceScope:info.sourceScope,sourceCount,records:info.records};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(digestCanonical(input)));
 const sourceRevision=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 return {actionType:info.actionType,sourceAuthority:getVyndiBridgeRoute(info.actionType).authority,
  effectClass:'read',readOnly:true,sourceReceiptChecked:true,sourceCompletenessVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false,
  data:{...input,schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',sourceRevision,
    sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',asOf:'2026-11-05T12:00:00.000Z',
    asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',complete:true,hasMore:false,
    sourceCompletenessVerified:false,readOnly:true,actionAuthorized:false,productionWriteAuthorized:false}};
}
function harness({enabled=true,tamper=null}={}){
 const jobs=[],saved=[],signers=[];
 const getStore=()=>{signers.push('store');return {
  ingestOntologySourceReceipt:async receipt=>{
   saved.push(receipt);
   return {status:'SOURCE_UNVERIFIED',sourceKind:receipt.sourceKind,receiptId:'receipt-'+saved.length,
    durableReceiptStored:true,sourceCompletenessVerified:false,agentUsable:false,
    actionAuthorized:false,productionWriteAuthorized:false};
  },
 }};
 const getReader=()=>({execute:async job=>{
  jobs.push(job);
  const kind={['INVENTORY.OBSERVE_STOCK']:'inventory',
   ['PROCUREMENT.OBSERVE_SHORTAGE']:'shortages',
   ['PROCUREMENT.OBSERVE_OPEN_POS']:'purchaseOrders'}[job.actionType];
  const observation=await signedObservation(kind);
  return kind===tamper?{...observation,data:{...observation.data,sourceRevision:'0'.repeat(64)}}:observation;
 }});
 return {env:flags(enabled),getStore,getReader,jobs,saved,signers};
}

test('disabled and invalid scheduled controls never touch signer or persistence',async()=>{
 for(const [enabled,time,expected] of [[false,when(5),'DISABLED'],[true,when(6),'HOLD'],
  [true,NaN,'HOLD']]){
  const h=harness({enabled});
  const result=await runScheduledOntologyRefresh({...h,scheduledTime:time});
  assert.equal(result.status,expected);
  assert.equal(result.agentUsable,false);
  assert.equal(h.signers.length,0);
  assert.equal(h.saved.length,0);
 }
});

test('10-minute cycles persist only signed inventory and shortages; purchase orders every 30',async()=>{
 for(const [minute,count] of [[15,2],[35,3]]){
  const h=harness();
  const result=await runScheduledOntologyRefresh({...h,scheduledTime:when(minute)});
  assert.equal(result.status,'SOURCE_UNVERIFIED');
  assert.equal(result.agentUsable,false);
  assert.equal(result.actionAuthorized,false);
  assert.equal(result.productionWriteAuthorized,false);
  assert.equal(h.jobs.length,count);
  assert.equal(h.saved.length,count);
  assert.equal(h.jobs.every(job=>job.payload.limit===100&&job.payload.missionId==='ontology:scheduled-signed-read'),true);
  assert.deepEqual(h.saved.map(x=>x.sourceKind).sort(),(count===2?
   ['inventory','shortages']:['inventory','shortages','purchaseOrders']).sort());
  assert.equal(result.sources.every(x=>x.status==='SOURCE_UNVERIFIED'),true);
 }
});

test('invalid signed PO payload is HOLD without writing a PO receipt',async()=>{
 const h=harness({tamper:'purchaseOrders'});
 const r=await runScheduledOntologyRefresh({...h,scheduledTime:when(35)});
 assert.equal(r.status,'HOLD');
 assert.equal(r.agentUsable,false);
 assert.equal(r.productionWriteAuthorized,false);
 assert.deepEqual(h.saved.map(x=>x.sourceKind).sort(),['inventory','shortages']);
 assert.equal(r.sources.at(-1).status,'HOLD');
 assert.equal(JSON.stringify(r).includes('PO1'),false);
});

test('bounded cron is separate from existing hourly jobs and explicitly gated',async()=>{
 const worker=await readFile(new URL('../cloudflare-worker.mjs',import.meta.url),'utf8');
 const config=JSON.parse(await readFile(new URL('../../../wrangler.jsonc',import.meta.url),'utf8'));
 const flags=JSON.parse(config.vars.VAOS_FEATURE_FLAGS);
 assert.equal(ONTOLOGY_REFRESH_CRON,'5,15,25,35,45,55 * * * *');
 assert.deepEqual(config.triggers.crons,['0 * * * *',ONTOLOGY_REFRESH_CRON]);
 assert.equal(flags.VAOS_ONTOLOGY_AUTO_REFRESH_CONTROL,'signed-readonly-v1');
 assert.match(worker,/if\s*\(_controller\?\.cron===ONTOLOGY_REFRESH_CRON\)/);
 assert.match(worker,/runScheduledOntologyRefresh/);
 assert.match(worker,/runScheduledMissionSweep/);
});
