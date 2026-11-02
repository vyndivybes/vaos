import {featureControl} from '../../apps/web/lib/feature-flags.mjs';
async function sdkClient(key){
 const {ElevenLabsClient}=await import('@elevenlabs/elevenlabs-js');
 return new ElevenLabsClient({apiKey:key});
}
export const ELEVENLABS_PROFILE=Object.freeze({provider:'elevenlabs',voiceId:'JBFqnCBsd6RMkjVDRZzb',voiceName:'George',modelId:'eleven_v4',platformFallback:false,costPolicy:'FREE_PLAN_ONLY_NO_OVERAGE',commercialUseQualified:false});
export const ELEVENLABS_SAMPLE='Hello. I am JARVIS, your VAOS assistant. This is an ElevenLabs voice preview.';
const BUDGET_KEY='voice/elevenlabs/free-preview-budget-v1.json';
const fail=(code,status=503)=>{throw Object.assign(Error(code),{status});};
export function elevenLabsConfiguration(env){
 return {...ELEVENLABS_PROFILE,ready:featureControl(env,'VAOS_ELEVENLABS_CONTROL')==='free-personal-v1'&&!!env?.ELEVENLABS_API_KEY&&!!env?.VAOS_ARTIFACTS,
  configured:!!env?.ELEVENLABS_API_KEY,personalNoncommercialOnly:true,attribution:'Voice by ElevenLabs · elevenlabs.io',dailyCharacterLimit:1000};
}
async function providerJson(path,{key,fetcher,signal}){
 const r=await fetcher('https://api.elevenlabs.io'+path,{headers:{'xi-api-key':key},redirect:'error',signal});
 if(!r.ok)fail('ELEVENLABS_ACCOUNT_UNAVAILABLE');
 return r.json();
}
function verifyFreeAccount(sub,characters){
 if(sub?.tier!=='free'||sub.max_credit_limit_extension!==0||sub.can_extend_character_limit!==false||sub.allowed_to_extend_character_limit!==false)fail('ELEVENLABS_ZERO_COST_POLICY_REQUIRED',403);
 if(!Number.isSafeInteger(sub.character_count)||!Number.isSafeInteger(sub.character_limit)||sub.character_count<0||sub.character_limit>10000||sub.character_limit-sub.character_count<characters)fail('ELEVENLABS_FREE_CREDITS_EXHAUSTED',429);
}
async function reserve(bucket,characters,now){
 if(!bucket?.get||!bucket?.put)fail('ELEVENLABS_BUDGET_UNAVAILABLE');
 const previous=await bucket.get(BUDGET_KEY),day=new Date(now).toISOString().slice(0,10),id=crypto.randomUUID();
 let current=previous?await previous.json():{day,used:0,activeUntil:0};
 if(!current||typeof current.day!=='string'||!Number.isSafeInteger(current.used)||current.used<0||!Number.isFinite(current.activeUntil))fail('ELEVENLABS_BUDGET_UNAVAILABLE');
 if(current.activeUntil>now)fail('ELEVENLABS_BUSY',429);
 if(current.day!==day)current={day,used:0,activeUntil:0};
 if(current.used+characters>1000)fail('ELEVENLABS_DAILY_LIMIT',429);
 const next={day,used:current.used+characters,activeUntil:now+90000,id};
 const result=await bucket.put(BUDGET_KEY,JSON.stringify(next),{onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
 if(!result)fail('ELEVENLABS_BUSY',429);
 return async()=>{
  const object=await bucket.get(BUDGET_KEY);if(!object)return;
  const value=await object.json();if(value.id!==id)return;
  await bucket.put(BUDGET_KEY,JSON.stringify({...value,activeUntil:0}),{onlyIf:{etagMatches:object.etag},httpMetadata:{contentType:'application/json'}});
 };
}
export async function createElevenLabsSpeech({env,text,language='en-US',signal,fetcher=fetch,clientFactory=sdkClient,now=()=>Date.now()}={}){
 if(!elevenLabsConfiguration(env).ready)fail('ELEVENLABS_NOT_CONFIGURED');
 // User-approved personal/non-commercial test mode. Never upgrade a plan,
 // spend prepaid/paid credits, or fall back to a platform voice.
 if(typeof text!=='string'||!text.trim()||text.length>600||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fail('ELEVENLABS_TEXT_INVALID',422);
 if(!['en','en-US','en-IN'].includes(language))fail('ELEVENLABS_LANGUAGE_UNAVAILABLE',422);
 const abort=AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])]);
 const sub=await providerJson('/v1/user/subscription',{key:env.ELEVENLABS_API_KEY,fetcher,signal:abort});
 verifyFreeAccount(sub,text.length);
 const voice=await providerJson('/v1/voices/'+ELEVENLABS_PROFILE.voiceId,{key:env.ELEVENLABS_API_KEY,fetcher,signal:abort});
 if(voice.voice_id!==ELEVENLABS_PROFILE.voiceId||voice.category!=='premade')fail('ELEVENLABS_VOICE_NOT_QUALIFIED');
 const release=await reserve(env.VAOS_ARTIFACTS,text.length,now());
 try{
  // No retries after an ambiguous result; already reserved credits are not refunded.
  const client=await clientFactory(env.ELEVENLABS_API_KEY);
  const audio=await client.textToSpeech.convert(ELEVENLABS_PROFILE.voiceId,{text,modelId:ELEVENLABS_PROFILE.modelId,outputFormat:'mp3_44100_128',voiceSettings:{stability:0.5,similarityBoost:0.75}},{maxRetries:0,timeoutInSeconds:40,abortSignal:abort});
  const reader=audio.getReader(),chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000)fail('ELEVENLABS_AUDIO_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(size<44)fail('ELEVENLABS_AUDIO_INVALID');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(!((bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33)||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)))fail('ELEVENLABS_AUDIO_INVALID');
  return bytes;
 }catch(e){if(e?.status&&/^ELEVENLABS_[A-Z_]+$/.test(e.message))throw e;fail('ELEVENLABS_SYNTHESIS_UNAVAILABLE');}
 finally{await release().catch(()=>{});}
}
