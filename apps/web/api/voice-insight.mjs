import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {resolveVoiceIntent,VOICE_DOMAIN_ACTIONS,interpretVoiceRecords,formatVoiceAnswer} from '../lib/voice-intelligence.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const CONTROL='founder-readonly-browser-v1';
const QUERY=/^[\s\S]{5,300}$/;
export function createVoiceInsightHandler({getReader=makeCommercialReader}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(req.env?.VAOS_VOICE_CONTROL!==CONTROL)return res.status(409).json(apiError('VOICE_DISABLED','Read-only voice not commissioned'));
  let question='';try{question=new URL(req.url).searchParams.get('q')||'';}catch{}
  if(!QUERY.test(question)||/[\x00-\x1f\x7f]/.test(question))
   return res.status(422).json(apiError('VOICE_QUERY_INVALID','Read-only question must contain 5–300 characters'));
  const intent=resolveVoiceIntent(question);
  if(intent.reason==='BLOCKED_OR_UNBOUNDED')
   return res.status(422).json(apiError('VOICE_WRITE_DENIED','No write or sensitive request permitted'));
  const action=VOICE_DOMAIN_ACTIONS[intent.domain];
  if(!action){
   const answer=formatVoiceAnswer(intent,null);
   return res.status(200).json({data:{...answer,readOnly:true,actionAuthorized:false,sourceSystem:'VAOS_INTELLIGENCE'}});
  }
  const contract=getVyndiBridgeRoute(action);
  if(!contract||contract.effectClass!=='read'||contract.executionEnabled!==true)
   return res.status(200).json({data:{...formatVoiceAnswer(intent,null),readOnly:true,actionAuthorized:false,sourceSystem:'VAOS_INTELLIGENCE'}});
  try{
   const result=await getReader(req.env).execute({actionType:action,
    id:'voice-insight:'+crypto.randomUUID(),intentId:'voice-insight:'+crypto.randomUUID(),
    payload:{limit:100,missionId:'vaos-founder-readonly-insight'}
   });
   if(result?.actionType!==action||result?.sourceAuthority!==contract.authority)
    throw Error('VOICE_AUTHORITY_MISMATCH');
   const counted=interpretVoiceRecords(intent.domain,result.data,{limit:100});
   return res.status(200).json({data:{...formatVoiceAnswer(intent,counted),
    readOnly:true,actionAuthorized:false,sourceSystem:'VYNDI_OS',
    observedAt:new Date().toISOString(),dataCompleteness:'BOUNDED_SOURCE_WINDOW'}});
  }catch{
   return res.status(200).json({data:{...formatVoiceAnswer(intent,null),
    readOnly:true,actionAuthorized:false,sourceSystem:'VAOS_INTELLIGENCE'}});
  }
 };
}
export default createVoiceInsightHandler();
