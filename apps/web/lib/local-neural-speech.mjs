// Local pairing stays in page memory. Hosted audio uses the authenticated
// Cloudflare voice proxy. Neither path falls back to platform TTS.
import {hostedVoice,VOICE_TTS_SAMPLE} from './hosted-speech.mjs';
let connection=null;
const listeners=new Set();
const hostedSpeech=()=>!!globalThis.location&&!['127.0.0.1','localhost'].includes(globalThis.location.hostname);
let selectedLocal=false;
export const speechOutputReady=()=>hostedSpeech()||localCompanion.ready();
export const voiceOutputAuthorized=()=>!hostedSpeech()||selectedLocal||hostedVoice.accepted();
export const authorizeVoiceOutput=()=>!hostedSpeech()||selectedLocal||hostedVoice.authorize();
export const localCompanion={
 ready:()=>connection!==null,
 connect(endpoint,token){
  const url=new URL(endpoint);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof token!=='string'||!token.trim())throw Error('PAIRING_INVALID');
  selectedLocal=false;connection={endpoint:url.origin,token:token.trim()};for(const fn of listeners)fn();
 },
 disconnect(){selectedLocal=false;connection=null;for(const fn of listeners)fn();},
 subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
 async download(path){
  if(!connection)throw Error('PAIRING_REQUIRED');
  if(!/^\/api\/artifacts\/[a-f0-9-]+\.(?:pdf|xlsx|docx|bin)$/.test(path))throw Error('ARTIFACT_PATH_INVALID');
  const response=await fetch(connection.endpoint+path,{headers:{Authorization:'Bearer '+connection.token},credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('DOWNLOAD_FAILED');return response.blob();
 },
 async request(path,{method='GET',data,signal,binary=false}={}){
  if(!connection)throw Error('PAIRING_REQUIRED');
  if(!path.startsWith('/api/'))throw Error('LOCAL_PATH_INVALID');
  const response=await fetch(connection.endpoint+path,{method,headers:{Authorization:'Bearer '+connection.token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),signal:signal||AbortSignal.timeout(15000),credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok){const result=await response.json();throw Error(result.error||'LOCAL_REQUEST_FAILED');}
  if(binary){
   if(response.headers.get('X-VAOS-Voice-Provider')!=='kokoro-onnx'||response.headers.get('X-VAOS-Voice-Profile')!=='vaos-cinematic-v1')throw Error('NEURAL_PROVIDER_UNVERIFIED');
   return response.blob();
  }
  return response.json();
 }
};
export class NeuralUtterance{constructor(text){this.text=text;this.lang='en-US';}}
const speechFailures=Object.freeze({
 VOICE_TTS_NOT_CONFIGURED:'Cloudflare voice is not configured on the server.',
 VOICE_TTS_CONSENT_REQUIRED:'Enable Cloudflare voice in Voice settings to hear replies.',
 VOICE_TTS_AUTH_UNAVAILABLE:'Cloudflare voice authorization is unavailable.',
 VOICE_TTS_PROVIDER_LIMIT:'Cloudflare’s shared AI allowance is currently unavailable.',
 VOICE_TTS_BUDGET_UNAVAILABLE:'The server could not access the voice quota ledger.',
 VOICE_TTS_BUSY:'Another voice request is active. Wait before trying again.',
 VOICE_TTS_DAILY_LIMIT:'The cloud voice allowance is used up for today.',
 VOICE_TTS_SYNTHESIS_UNAVAILABLE:'Cloudflare did not return usable speech.',
 VOICE_TTS_AUDIO_TOO_LARGE:'The returned voice audio exceeded the size limit.',
 VOICE_TTS_AUDIO_INVALID:'The returned voice audio was invalid.',
 VOICE_TTS_TEXT_INVALID:'The text cannot be spoken within the current limits.',
 VOICE_TTS_LANGUAGE_UNAVAILABLE:'This test voice supports English only.',
 NEURAL_PLAYBACK_BLOCKED:'Your browser blocked audio playback. Allow sound for this site and try again.',
 NEURAL_AUDIO_INVALID:'The server did not return valid voice audio.',
 NEURAL_PROVIDER_UNVERIFIED:'The audio provider could not be verified.',
 NEURAL_SPEECH_UNAVAILABLE:'Voice is temporarily unavailable.'
});
export function neuralSpeechFailureMessage(code){return (speechFailures[code]||speechFailures.NEURAL_SPEECH_UNAVAILABLE);}
export function mountNeuralConnection(container){
 if(!container||container.querySelector?.('[data-neural-connection]'))return;
 if(hostedSpeech())mountHostedVoice(container);
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Local neural voice connection';details.append(summary);
 details.setAttribute('data-neural-connection','');
 const notice=document.createElement('p');notice.textContent='Pair the VAOS companion to speak with the local English neural voice without using the Cloudflare allowance.';
 const endpoint=document.createElement('input');endpoint.value='http://127.0.0.1:47831';endpoint.setAttribute('aria-label','Local companion address');
 const code=document.createElement('input');code.type='password';code.autocomplete='off';code.setAttribute('aria-label','Local companion pairing code');
 const connect=document.createElement('button');connect.type='button';connect.textContent='Connect neural voice';
 const disconnect=document.createElement('button');disconnect.type='button';disconnect.textContent='Disconnect neural voice';
 const status=document.createElement('p');status.setAttribute('role','status');
 const sampleSpeech=createNeuralSynthesis({transport:localCompanion});
 const sample=document.createElement('button');sample.type='button';sample.textContent='Play VAOS neural voice';
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop neural voice test';
 sample.addEventListener('click',()=>{
  const utterance=new NeuralUtterance('Good evening. I am VAOS. This is your local neural voice. Every decision remains under your control.');
  status.textContent='Generating local Kokoro neural audio. Windows TTS is disabled.';
  utterance.onstart=()=>status.textContent='Playing local Kokoro / vaos-cinematic-v1. Please confirm the sound yourself.';
  utterance.onend=()=>status.textContent='Neural voice playback finished. Listening acceptance still requires your confirmation.';
  utterance.onerror=()=>status.textContent='Neural voice unavailable. Pair the companion and install its neural models. No Windows voice was substituted.';
  sampleSpeech.speak(utterance);
 });
 stop.addEventListener('click',()=>{sampleSpeech.cancel();status.textContent='Neural voice test stopped.';});
 connect.addEventListener('click',async()=>{try{localCompanion.connect(endpoint.value,code.value);const expected=connection;code.value='';const result=await localCompanion.request('/api/status');if(connection!==expected)return;if(!result.capabilities.neuralVoice)throw Error('Install the companion neural voice requirements and models first.');selectedLocal=true;status.textContent='Local voice selected for this tab.';}catch(e){localCompanion.disconnect();status.textContent=e.message;}});
 disconnect.addEventListener('click',()=>{localCompanion.disconnect();status.textContent='Local neural voice disconnected.';});
 details.append(notice,endpoint,code,connect,disconnect,sample,stop,status);container.append(details);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')sampleSpeech.cancel();});
 window.addEventListener('pagehide',()=>sampleSpeech.dispose(),{once:true});
}
function mountHostedVoice(container){
 const details=document.createElement('details'),summary=document.createElement('summary');details.setAttribute('data-neural-connection','');summary.textContent='JARVIS voice · Cloudflare free allowance';details.append(summary);
 const notice=document.createElement('p');notice.textContent='JARVIS uses the Orpheus voice through Cloudflare Workers AI. Cloudflare processes spoken reply text. The allowance is shared with other VAOS AI features.';
 const status=document.createElement('p');status.setAttribute('role','status');
 const check=document.createElement('button');check.type='button';check.textContent='Check connection';
 const play=document.createElement('button');play.type='button';play.textContent='Play a sample';play.disabled=true;
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop sample';
 const speech=createNeuralSynthesis({transport:hostedVoice});
 check.addEventListener('click',async()=>{try{const {data}=await hostedVoice.request();play.disabled=data?.ready!==true;status.textContent=data?.ready?'Cloudflare voice is configured. Play a sample to check the sound.':'Cloudflare voice is awaiting a free-tier connection.';}catch{play.disabled=true;status.textContent='Could not check the voice connection. Sign in and try again.';}});
 play.addEventListener('click',()=>{if(!hostedVoice.authorize())return;const u=new NeuralUtterance(VOICE_TTS_SAMPLE);status.textContent='Preparing your sample…';u.onstart=()=>status.textContent='Playing JARVIS…';u.onend=()=>status.textContent='Sample finished.';u.onerror=e=>status.textContent=neuralSpeechFailureMessage(e.code);speech.speak(u);});
 stop.addEventListener('click',()=>{speech.cancel();status.textContent='Sample stopped.';});
 details.append(notice,check,play,stop,status);container.append(details);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')speech.cancel();});window.addEventListener('pagehide',()=>speech.dispose(),{once:true});
}
const activeVoice={
 request:(...args)=>(hostedSpeech()&&!selectedLocal?hostedVoice:localCompanion).request(...args),
 subscribe:localCompanion.subscribe,
};
export function createNeuralSynthesis({transport=activeVoice,makeAudio=()=>new Audio(),urls=URL,schedule=setTimeout,clear=clearTimeout}={}){
 let current=null;
 function cancel(){const st=current;current=null;if(!st)return;st.abort.abort();clear(st.timer);st.audio?.pause();if(st.url)urls.revokeObjectURL(st.url);}
 function speak(utterance){
  cancel();const st={abort:new AbortController(),audio:null,url:null,timer:null};current=st;
  function finish(error,code){if(current!==st)return;cancel();if(error)utterance.onerror?.({error,code:code||'NEURAL_SPEECH_UNAVAILABLE'});else utterance.onend?.();}
  st.timer=schedule(()=>finish('synthesis-failed'),180000);
  void (async()=>{
   try{
    const blob=await transport.request('/api/voice/synthesize',{method:'POST',data:{text:utterance.text,language:utterance.lang},signal:st.abort.signal,binary:true});
    if(current!==st)return;
    if(!['audio/wav','audio/mpeg'].includes(blob.type)||blob.size>12000000||blob.size<44)throw Error('NEURAL_AUDIO_INVALID');
    st.url=urls.createObjectURL(blob);st.audio=makeAudio();st.audio.src=st.url;
    st.audio.onplaying=()=>{if(current===st)utterance.onstart?.();};
    st.audio.onended=()=>finish();st.audio.onerror=()=>finish('audio-hardware');
    await st.audio.play();
   }catch(e){if(current===st)finish(e.message==='NEURAL_LANGUAGE_UNAVAILABLE'?'language-unavailable':'synthesis-unavailable',e.name==='NotAllowedError'?'NEURAL_PLAYBACK_BLOCKED':Object.hasOwn(speechFailures,e.message)?e.message:'NEURAL_SPEECH_UNAVAILABLE');}
  })();
 }
 const unsubscribe=transport.subscribe?.(()=>cancel());
 return {speak,cancel,dispose(){cancel();unsubscribe?.();}};
}
