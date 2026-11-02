// Local pairing stays in page memory. Hosted audio uses the authenticated
// ElevenLabs proxy. Neither path falls back to platform TTS.
import {elevenLabsSpeech,ELEVENLABS_SAMPLE} from './elevenlabs-speech.mjs';
let connection=null;
const listeners=new Set();
const hostedSpeech=()=>!!globalThis.location&&!['127.0.0.1','localhost'].includes(globalThis.location.hostname);
export const speechOutputReady=()=>hostedSpeech()||localCompanion.ready();
export const localCompanion={
 ready:()=>connection!==null,
 connect(endpoint,token){
  const url=new URL(endpoint);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof token!=='string'||!token.trim())throw Error('PAIRING_INVALID');
  connection={endpoint:url.origin,token:token.trim()};for(const fn of listeners)fn();
 },
 disconnect(){connection=null;for(const fn of listeners)fn();},
 subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
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
 ELEVENLABS_NOT_CONFIGURED:'ElevenLabs is not configured on the server.',
 ELEVENLABS_ACCOUNT_UNAVAILABLE:'ElevenLabs account check failed on the server.',
 ELEVENLABS_ZERO_COST_POLICY_REQUIRED:'The account does not meet the free-only, no-overage policy.',
 ELEVENLABS_FREE_CREDITS_EXHAUSTED:'The included free credits are exhausted.',
 ELEVENLABS_VOICE_NOT_QUALIFIED:'The selected ElevenLabs voice could not be verified.',
 ELEVENLABS_BUDGET_UNAVAILABLE:'The server could not access the voice quota ledger.',
 ELEVENLABS_BUSY:'Another voice request is active. Wait before trying again.',
 ELEVENLABS_DAILY_LIMIT:'The daily free voice limit has been reached.',
 ELEVENLABS_SYNTHESIS_UNAVAILABLE:'ElevenLabs did not return usable speech.',
 ELEVENLABS_AUDIO_TOO_LARGE:'The returned voice audio exceeded the size limit.',
 ELEVENLABS_AUDIO_INVALID:'The returned voice audio was invalid.',
 ELEVENLABS_TEXT_INVALID:'The text cannot be spoken within the current limits.',
 ELEVENLABS_LANGUAGE_UNAVAILABLE:'This test voice supports English only.',
 NEURAL_PLAYBACK_BLOCKED:'Your browser blocked audio playback. Allow sound for this site and try again.',
 NEURAL_AUDIO_INVALID:'The server did not return valid voice audio.',
 NEURAL_PROVIDER_UNVERIFIED:'The audio provider could not be verified.',
 NEURAL_SPEECH_UNAVAILABLE:'ElevenLabs preview unavailable.'
});
export function neuralSpeechFailureMessage(code){return (speechFailures[code]||speechFailures.NEURAL_SPEECH_UNAVAILABLE)+' ['+(Object.hasOwn(speechFailures,code)?code:'NEURAL_SPEECH_UNAVAILABLE')+'] No Windows voice was substituted.';}
export function mountNeuralConnection(container){
 if(!container||container.querySelector?.('[data-neural-connection]'))return;
 if(hostedSpeech())return mountElevenLabsVoice(container);
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Local neural voice connection';details.append(summary);
 details.setAttribute('data-neural-connection','');
 const notice=document.createElement('p');notice.textContent='Connect the free local companion for the original VAOS English voice. No Windows voice fallback. Other reply languages remain available as text.';
 const endpoint=document.createElement('input');endpoint.value='http://127.0.0.1:47831';endpoint.setAttribute('aria-label','Local companion address');
 const code=document.createElement('input');code.type='password';code.autocomplete='off';code.setAttribute('aria-label','Local companion pairing code');
 const connect=document.createElement('button');connect.type='button';connect.textContent='Connect neural voice';
 const disconnect=document.createElement('button');disconnect.type='button';disconnect.textContent='Disconnect neural voice';
 const status=document.createElement('p');status.setAttribute('role','status');
 const sampleSpeech=createNeuralSynthesis();
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
 connect.addEventListener('click',async()=>{try{localCompanion.connect(endpoint.value,code.value);code.value='';const result=await localCompanion.request('/api/status');if(!result.capabilities.neuralVoice)throw Error('Install the companion neural voice requirements and models first.');status.textContent='Local English neural voice connected. Memory profile: '+result.memoryScope.tenantId+' / '+result.memoryScope.subject;}catch(e){localCompanion.disconnect();status.textContent=e.message;}});
 disconnect.addEventListener('click',()=>{localCompanion.disconnect();status.textContent='Local neural voice disconnected.';});
 details.append(notice,endpoint,code,connect,disconnect,sample,stop,status);container.append(details);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')sampleSpeech.cancel();});
 window.addEventListener('pagehide',()=>sampleSpeech.dispose(),{once:true});
}
function mountElevenLabsVoice(container){
 const details=document.createElement('details'),summary=document.createElement('summary');details.setAttribute('data-neural-connection','');summary.textContent='ElevenLabs personal test voice';details.append(summary);
 const notice=document.createElement('p');notice.textContent='Voice by ElevenLabs · elevenlabs.io. Personal/non-commercial use only, with free credits and no overages. Text you choose to speak is sent to ElevenLabs under its retention policy. VAOS memory deletion does not delete ElevenLabs speech history. Windows TTS and automatic provider fallback are disabled.';
 const status=document.createElement('p');status.setAttribute('role','status');
 const check=document.createElement('button');check.type='button';check.textContent='Check ElevenLabs connection';
 const play=document.createElement('button');play.type='button';play.textContent='Test ElevenLabs voice';play.disabled=true;
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop voice preview';
 const speech=createNeuralSynthesis({transport:elevenLabsSpeech});
 check.addEventListener('click',async()=>{try{const {data}=await elevenLabsSpeech.request();play.disabled=data?.ready!==true;status.textContent=data?.ready?'ElevenLabs / George / Eleven v4 configured for your personal test. Up to 1,000 characters per day within the remaining free allowance. No paid requests are allowed.':'ElevenLabs personal test is not activated. No Windows voice will be substituted.';}catch{play.disabled=true;status.textContent='ElevenLabs connection unavailable. Sign in and check server configuration.';}});
 play.addEventListener('click',()=>{const u=new NeuralUtterance(ELEVENLABS_SAMPLE);status.textContent='Requesting the fixed ElevenLabs audition using free credits only.';u.onstart=()=>status.textContent='ElevenLabs / George / Eleven v4 is playing. Please confirm what you hear.';u.onend=()=>status.textContent='ElevenLabs preview completed. Human listening acceptance is still required.';u.onerror=e=>status.textContent=neuralSpeechFailureMessage(e.code);speech.speak(u);});
 stop.addEventListener('click',()=>{speech.cancel();status.textContent='ElevenLabs preview stopped.';});
 details.append(notice,check,play,stop,status);container.append(details);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')speech.cancel();});window.addEventListener('pagehide',()=>speech.dispose(),{once:true});
}
export function createNeuralSynthesis({transport=hostedSpeech()?elevenLabsSpeech:localCompanion,makeAudio=()=>new Audio(),urls=URL,schedule=setTimeout,clear=clearTimeout}={}){
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
