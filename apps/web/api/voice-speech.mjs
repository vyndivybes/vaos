import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {createElevenLabsSpeech,elevenLabsConfiguration} from '../../../integrations/elevenlabs/text-to-speech.mjs';
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function createVoiceSpeechHandler({getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),synthesize=createElevenLabsSpeech}={}){
 return async(req)=>{
  const session=getSession(req);
  if(!session)return json(401,{error:'UNAUTHENTICATED'});
  if(session.email!=='shyamsundhar1982@gmail.com')return json(403,{error:'FOUNDER_ONLY'});
  if(req.env?.VAOS_VOICE_CONTROL!=='founder-readonly-browser-v1')return json(403,{error:'VOICE_DISABLED'});
  if(req.method==='GET')return json(200,{data:elevenLabsConfiguration(req.env)});
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(req.headers?.origin!==new URL(req.url).origin)return json(403,{error:'ORIGIN_DENIED'});
  if(!/^application\/json(?:;|$)/i.test(req.headers?.['content-type']||''))return json(415,{error:'JSON_REQUIRED'});
  const b=req.body;
  if(!b||Object.keys(b).sort().join(',')!=='language,text'||typeof b.text!=='string'||b.text.length>600||!['en','en-US','en-IN'].includes(b.language))return json(422,{error:'SPEECH_INPUT_INVALID'});
  try{
   const bytes=await synthesize({env:req.env,text:b.text,language:b.language,signal:req.signal});
   return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-VAOS-Voice-Provider':'elevenlabs','X-VAOS-Voice-Profile':'George-eleven-v4-free-personal'}});
  }catch(e){return json(e.status||503,{error:/^ELEVENLABS_[A-Z_]+$/.test(e.message)?e.message:'ELEVENLABS_UNAVAILABLE'});}
 };
}
export default createVoiceSpeechHandler();
