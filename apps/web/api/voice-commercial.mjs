import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
export function makeCommercialReader(env){
 const signer=createSupabaseControlStore(resolveDurableControlConfig(env));
 return createVyndiReadBridgeClient({signer,serviceBinding:env?.VYNDI});
}
export function summarizeCommercialRecords(source){
 if(source?.actionType!=='COMMERCIAL.OBSERVE_PIPELINE'||source?.sourceAuthority!=='listSalesOrders')throw Error('COMMERCIAL_SOURCE_INVALID');
 const value=source.data;
 // No inference of zero sales from a missing, unknown or unqualified schema.
 const records=Array.isArray(value)?value:Array.isArray(value?.records)?value.records:null;
 if(!records||records.length>100)throw Error('COMMERCIAL_RECORD_SCHEMA_UNVERIFIED');
 if(records.some(r=>!r||typeof r!=='object'||Array.isArray(r)
  ||!['lead','confirmed','delivered','cancelled'].includes(r.status)))throw Error('COMMERCIAL_RECORD_SCHEMA_UNVERIFIED');
 const counts={lead:0,confirmed:0,delivered:0,cancelled:0};
 for(const r of records)counts[r.status]++;
 const complete=value?.complete===true||value?.pagination?.hasMore===false;
 return {observedCount:records.length,counts,complete,
  answer:'The authorized VYNDI OS sales-order read returned '+records.length+' records'+
   (complete?' in the reported result.':'. The result may be partial.')+
   ' Recorded states: '+counts.lead+' leads, '+counts.confirmed+' confirmed, '+
   counts.delivered+' delivered, and '+counts.cancelled+' cancelled. '+
   'These are sales-order statuses, not verified collected revenue, invoicing, or profit.'};
}
export function createVoiceCommercialHandler({getReader=makeCommercialReader}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder access required'));
  if(req.env?.VAOS_VOICE_CONTROL!=='founder-readonly-browser-v1'
     ||req.env?.VAOS_VOICE_COMMERCIAL_CONTROL!=='founder-readonly-v1')
   return res.status(409).json(apiError('COMMERCIAL_VOICE_DISABLED','Commercial voice read not qualified'));
  try{
   const result=await getReader(req.env).execute({
    actionType:'COMMERCIAL.OBSERVE_PIPELINE',
    id:'voice-commercial:'+crypto.randomUUID(),intentId:'voice-commercial:'+crypto.randomUUID(),
    payload:{limit:100,missionId:'voice-commercial-read'}
   });
   const summary=summarizeCommercialRecords(result);
   return res.status(200).json({data:{...summary,sourceSystem:'VYNDI_OS',readOnly:true,actionAuthorized:false,
     qualification:'AUTHORITATIVE_READ_NOT_FINANCIAL_AUDIT'}});
  }catch{
   return res.status(503).json(apiError('COMMERCIAL_READ_UNVERIFIED','Signed VYNDI commercial read unavailable or schema not qualified'));
  }
 };
}
export default createVoiceCommercialHandler();
