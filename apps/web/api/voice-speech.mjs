import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {createAuraSpeech,speechConfiguration,VOICE_PROFILE} from '../../../integrations/workers-aura/text-to-speech.mjs';
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function createVoiceSpeechHandler({getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),synthesize=createAuraSpeech}={}){
 return async(req)=>{
  const session=getSession(req);
  if(!session)return json(401,{error:'UNAUTHENTICATED'});
  if(session.email!=='shyamsundhar1982@gmail.com')return json(403,{error:'FOUNDER_ONLY'});
  if(req.env?.VAOS_VOICE_CONTROL!=='founder-readonly-browser-v1')return json(403,{error:'VOICE_DISABLED'});
  if(req.method==='GET')return json(200,{data:speechConfiguration(req.env)});
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(req.headers?.origin!==new URL(req.url).origin)return json(403,{error:'ORIGIN_DENIED'});
  if(!/^application\/json(?:;|$)/i.test(req.headers?.['content-type']||''))return json(415,{error:'JSON_REQUIRED'});
  const b=req.body;
  if(b?.speechProcessingAccepted!==true)return json(403,{error:'VOICE_TTS_CONSENT_REQUIRED'});
  if(Object.keys(b).sort().join(',')!=='language,speechProcessingAccepted,text'||typeof b.text!=='string'||b.text.length>600||!['en','en-US','en-IN','en-GB'].includes(b.language))return json(422,{error:'SPEECH_INPUT_INVALID'});
  try{
   const bytes=await synthesize({env:req.env,text:b.text,language:b.language,signal:req.signal});
   return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-VAOS-Voice-Provider':'cloudflare-aura','X-VAOS-Voice-Profile':VOICE_PROFILE}});
  }catch(e){
   const error=/^VOICE_TTS_[A-Z_]+$/.test(e.message)?e.message:'VOICE_TTS_UNAVAILABLE';
   console.warn('VAOS_VOICE_REQUEST_FAILED',error);
   return json(e.status||503,{error});
  }
 };
}
export default createVoiceSpeechHandler();
