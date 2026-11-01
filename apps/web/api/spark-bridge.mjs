/** Device-authenticated, read-only desktop delegation to VAOS Jarvis.
 * Never accepts browser cookies, arbitrary actions, raw SQL, or desktop requests.
 */
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {resolveVoiceIntent,VOICE_DOMAIN_ACTIONS,interpretVoiceRecords,formatVoiceAnswer} from '../lib/voice-intelligence.mjs';
import {buildFounderMissionAnswer} from '../lib/founder-mission-answers.mjs';
import {getEightAgentOperatingService} from '../lib/operating-provider.mjs';

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE=/^[a-z][a-z0-9-]{3,63}$/;
const QUERY=/^[\s\S]{5,300}$/;
const TOKEN_MIN=32;
function fail(res,status,code){return res.status(status).json(apiError(code,code))}
function present({requestId,answer,status='HOLD',sourceSystem='VAOS_INTELLIGENCE',sourceAuthority=null,recordsObserved=null,
 observedAt=null,sourceWindow=null,dataCompleteness=null,diagnosticCode=null}){
 return {schemaVersion:'SPARK_JARVIS_V1',requestId,status,answer:String(answer||'Authoritative information unavailable.').slice(0,1300),
  sourceSystem,sourceAuthority,recordsObserved,observedAt,sourceWindow,dataCompleteness,diagnosticCode,
  readOnly:true,actionAuthorized:false,businessEffectsExecuted:false};
}
async function tokenMatches(received,expected){
 // Compare SHA-256 digests without short circuiting for same-length tokens.
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(received)),crypto.subtle.digest('SHA-256',encoder.encode(expected))]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;
 for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
 return difference===0;
}
export function createSparkBridgeHandler({
 getReader=makeCommercialReader,
 getMissionSummary=env=>getEightAgentOperatingService(env).founderMissionAnswerSummary()
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'METHOD_NOT_ALLOWED')}
  if(req.headers?.origin)return fail(res,403,'BROWSER_ORIGIN_DENIED');
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return fail(res,415,'CONTENT_TYPE_DENIED');
  const env=req.env||{};
  if(env.VAOS_SPARK_BRIDGE_CONTROL!=='read-only-v1'||typeof env.VAOS_SPARK_BRIDGE_TOKEN!=='string'
   ||env.VAOS_SPARK_BRIDGE_TOKEN.length<TOKEN_MIN||typeof env.VAOS_SPARK_DEVICE_ID!=='string'
   ||!DEVICE.test(env.VAOS_SPARK_DEVICE_ID))return fail(res,503,'SPARK_BRIDGE_NOT_COMMISSIONED');
  const header=String(req.headers?.authorization||'');
  if(!header.startsWith('Bearer ')||header.length>256||header.slice(7).length<TOKEN_MIN
   ||!(await tokenMatches(header.slice(7),env.VAOS_SPARK_BRIDGE_TOKEN)))return fail(res,401,'DEVICE_UNAUTHORIZED');
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)
   ||Object.keys(body).length!==5
   ||!['version','requestId','deviceId','operation','question'].every(k=>Object.hasOwn(body,k))
   ||body.version!==1||!ID.test(body.requestId||'')
   ||body.deviceId!==env.VAOS_SPARK_DEVICE_ID
   ||body.operation!=='ask'||typeof body.question!=='string'
   ||!QUERY.test(body.question)||/[\x00-\x1f\x7f]/.test(body.question))
   return fail(res,422,'BRIDGE_ENVELOPE_INVALID');
  const {requestId,question}=body;
  const intent=resolveVoiceIntent(question);
  if(intent.reason==='BLOCKED_OR_UNBOUNDED')return fail(res,422,'BRIDGE_WRITE_DENIED');
  if(intent.domain==='conversation')return res.status(200).json({data:present({
    requestId,status:'READY',sourceSystem:'VAOS_CONVERSATION',
    answer:"Hello from VAOS Jarvis. Ask about authorized sales, inventory, production, finance, people or an existing mission."})});
  if(intent.domain==='governance')return res.status(200).json({data:present({
    requestId,status:'OBSERVED',sourceSystem:'VAOS_POLICY',
    answer:'VAOS does not permit this bridge to approve payments, releases or business writes. All commitments require existing governed approval.'})});
  if(intent.domain==='missions'){
   try{
    const reply=buildFounderMissionAnswer(question,await getMissionSummary(env));
    return res.status(200).json({data:present({requestId,...reply,sourceSystem:'VAOS_MISSION_CONTROL'})});
   }catch{
    return res.status(200).json({data:present({requestId,sourceSystem:'VAOS_MISSION_CONTROL',
       answer:'The verified mission ledger is unavailable. No mission progress is inferred.'})});
   }
  }
  const action=VOICE_DOMAIN_ACTIONS[intent.domain];
  const route=action?getVyndiBridgeRoute(action):null;
  if(!route||route.effectClass!=='read'||route.executionEnabled!==true)
   return res.status(200).json({data:present({requestId,...formatVoiceAnswer(intent,null)})});
  try{
   const result=await getReader(env).execute({actionType:action,
    id:'spark-bridge:'+crypto.randomUUID(),intentId:'spark-bridge:'+crypto.randomUUID(),
    payload:{limit:100,missionId:'spark-readonly-desktop'}});
   if(result?.actionType!==action||result?.sourceAuthority!==route.authority)throw Error('BRIDGE_SOURCE_MISMATCH');
   const counted=interpretVoiceRecords(intent.domain,result.data,{limit:100});
   const answer=formatVoiceAnswer(intent,counted);
   return res.status(200).json({data:present({requestId,...answer,sourceAuthority:route.authority,
    sourceSystem:'VYNDI_OS',recordsObserved:counted.recordsObserved,
    observedAt:new Date().toISOString(),sourceWindow:'BOUNDED_SELECTED_ROWS',
    dataCompleteness:'BOUNDED_SOURCE_WINDOW'})});
  }catch{
   return res.status(200).json({data:present({requestId,...formatVoiceAnswer(intent,null),
     diagnosticCode:'SOURCE_UNAVAILABLE'})});
  }
 };
}
export default createSparkBridgeHandler();
