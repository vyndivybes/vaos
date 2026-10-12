import {formatFederatedVoiceEvidence} from './lib/federated-voice-report.mjs';
import {resolveVoiceIntent} from './lib/voice-intelligence.mjs';
import {createWakeListener} from './lib/hey-vaos.mjs';
import {createVoiceReadback} from './lib/voice-readback.mjs';
// Same signed VYNDI reads and repository evidence used by existing Founder Voice.
// This small home assistant deliberately performs no commands, approvals or writes.
const MODIFICATION=/\b(approve|reject|execute|delete|remove|pay|payment|transfer|send|dispatch|submit|create|change|edit|update|modify|post|purchase|authorize|authorise|activate|deactivate|override|merge|deploy|issue|book|order now|write)\b/i;
const SALES=/\b(sales|revenue|orders?|invoices?|customers?|deals?|pipeline|receivables?|quotations?)\b/i;
export function sanitizeVoiceTranscript(value){
 if(typeof value!=='string')return null;
 const s=value.trim().replace(/^(hey|hello|hi)\s+vaos\s*[,.:!?-]?\s*/i,'').trim();
 return s.length>=5&&s.length<=300&&!/[\x00-\x1f\x7f]/.test(s)?s:null;
}
export function classifyDashboardQuestion(value){
 const q=sanitizeVoiceTranscript(value);
 if(!q)return {kind:'DENY',question:q};
 const route=resolveVoiceIntent(q);
 if(route.reason==='BLOCKED_OR_UNBOUNDED')return {kind:'DENY',question:q};
 return {kind:route.domain==='documentation'?'EVIDENCE':'INSIGHT',question:q,domain:route.domain};
}
export function voiceCapabilityReady(x){
 return x?.enabled===true&&x?.manualReviewRequired===true
 &&x.actionAuthorized===false&&x.agentDispatch===false
 &&x.automaticSubmission===false&&x.serverAudioEnabled===false;
}
export function formatReadOnlyResult(kind,data){
 if(kind==='COMMERCIAL'){
  if(data?.readOnly!==true||data?.actionAuthorized!==false
    ||data?.sourceSystem!=='VYNDI_OS'||typeof data?.answer!=='string'
    ||data.answer.length>4000)throw Error('COMMERCIAL_EVIDENCE_INVALID');
  return {status:'OBSERVED',answer:data.answer.slice(0,2100),sources:[]};
 }
 if(kind==='INSIGHT'){
  if(data?.readOnly!==true||data.actionAuthorized!==false
   ||!['VAOS_INTELLIGENCE','VYNDI_OS'].includes(data.sourceSystem)
   ||!['OBSERVED','HOLD'].includes(data.status)
   ||typeof data.answer!=='string'||data.answer.length<8||data.answer.length>5000
   ||data.status==='OBSERVED'&&data.sourceSystem!=='VYNDI_OS')
   throw Error('VOICE_INSIGHT_UNVERIFIED');
  return {status:data.status,answer:data.answer.slice(0,2900),sources:[]};
 }
 if(kind==='EVIDENCE'){
  if(typeof data?.answer!=='string'||!Array.isArray(data.sources)
     ||data.actionAuthorized!==false)return data?.sources?.length===0
      ?{status:'HOLD',answer:'No independently relevant evidence was found. No business conclusion can be drawn.',sources:[]}
      :(()=>{throw Error('EVIDENCE_UNVERIFIED')})();
  return {status:data.sources.length?'OBSERVED':'HOLD',answer:data.answer.slice(0,2500),sources:data.sources.slice(0,4)};
 }
 throw Error('READ_ONLY_INTENT_REQUIRED');
}
function init(){
 const root=document.querySelector('#vaos-main-voice');
 if(!root)return;
 const $=id=>root.querySelector('#'+id);
 const mic=$('vaos-voice-mic'),stop=$('vaos-voice-stop'),ask=$('vaos-voice-ask'),
  speech=$('vaos-voice-speak'),input=$('vaos-voice-question'),answer=$('vaos-voice-answer'),
  note=$('vaos-voice-status'),sources=$('vaos-voice-sources'),speakToggle=$('vaos-voice-speech-toggle'),
  wakeToggle=$('vaos-wake-toggle'),wakeIndicator=$('vaos-wake-indicator'),wakeStatus=$('vaos-wake-status'),testSpeaker=$('vaos-voice-test');
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let recognition=null,controller=null,voiceEnabled=false,lastAnswer='',busy=false,speechRun=0,wake=null;
 const setStatus=message=>{note.textContent=message;};
 const player=createVoiceReadback({
  synthesis:window.speechSynthesis,UtteranceClass:window.SpeechSynthesisUtterance,
  onState:mode=>{if(mode==='QUEUED')setStatus('Voice queued; checking audio output.');
    if(mode==='SPEAKING')setStatus('VAOS is speaking.');},
  onError:code=>setStatus('Audio unavailable ('+code+'). Read the displayed answer or test your speaker.'),
  onFinished:mode=>{if(mode==='FINISHED')setStatus('Spoken answer completed.');wake?.resume();state();}
 });
 const state=()=>{mic.disabled=!voiceEnabled||!SpeechRecognition||!!recognition||busy||!!wake?.state().active;
  ask.disabled=busy;
  if(wakeToggle)wakeToggle.disabled=!voiceEnabled||!SpeechRecognition;
  stop.disabled=!recognition&&!controller&&!player.active()&&!wake?.isEnabled();
  speech.disabled=!lastAnswer||!voiceEnabled||!window.speechSynthesis||!window.SpeechSynthesisUtterance;};
 const cancel=()=>{
  const active=recognition;recognition=null;
  if(active)try{active.abort()}catch{}
  if(controller){controller.abort();controller=null}
  player.cancel();
  busy=false;state();
 };
 const speakAnswer=()=>{
  if(!voiceEnabled||!lastAnswer)return false;
  wake?.pause();
  const started=player.speak(lastAnswer);
  if(!started)wake?.resume();
  state();return started;
 };
 testSpeaker?.addEventListener('click',()=>{
  wake?.pause();
  const started=player.speak('VAOS speaker test. If you can hear this voice, your browser audio output is working.');
  if(!started)wake?.resume();
  state();
 });
 mic.addEventListener('click',()=>{
  if(!voiceEnabled||!SpeechRecognition||recognition||busy)return;
  wake?.pause();
  player.cancel();
  const active=new SpeechRecognition();recognition=active;
  active.lang='en-IN';active.interimResults=false;active.continuous=false;active.maxAlternatives=1;
  active.onresult=event=>{
   if(recognition!==active)return;
   const t=sanitizeVoiceTranscript(extractFinalTranscript(event));
   if(!t){setStatus('No complete spoken question was recognized. Nothing was submitted.');return;}
   input.value=t;
   setStatus('Recognized your question. Requesting one read-only VAOS answer…');
   recognition=null;
   try{active.stop?.();}catch{}
   ask.click();
  };
  active.onerror=()=>{if(recognition===active)setStatus('Microphone unavailable. Type a question instead.');};
  active.onend=()=>{if(recognition===active){recognition=null;wake?.resume();state();}};
  try{active.start();setStatus('Listening once. Browser speech recognition may use a vendor service.');}
  catch{recognition=null;setStatus('Microphone blocked or unsupported. Type a question instead.');}
  state();
 });
 stop.addEventListener('click',()=>{
  wake?.disable('Hey VAOS switched off. Microphone stopped.');
  cancel();setStatus('Stopped. No business actions authorized.');
 });
 speech.addEventListener('click',speakAnswer);
 ask.addEventListener('click',async()=>{
  if(busy)return;
  const intent=classifyDashboardQuestion(input.value);
  if(intent.kind==='DENY'){setStatus('Read-only questions only. Commands, approvals, payments and changes must use governed VAOS controls.');return;}
  wake?.pause();
  cancel();busy=true;lastAnswer='';answer.textContent='Retrieving verified evidence…';sources.replaceChildren();state();
  const abort=new AbortController();controller=abort;
  const timer=setTimeout(()=>abort.abort(),25000);
  let speaking=false;
  try{
   const route=intent.kind==='EVIDENCE'
    ?'/api/federated-knowledge?q='+encodeURIComponent(intent.question)
    :'/api/voice-insight?q='+encodeURIComponent(intent.question);
   const response=await fetch(route,{method:'GET',credentials:'same-origin',cache:'no-store',signal:abort.signal});
   if(!response.ok)throw Error(response.status===401?'Session expired. Please sign in again.':response.status===422?'This request is not an allowed read-only question.':'This source is not commissioned or cannot be verified.');
   const data=(await response.json())?.data;
   const normalized=intent.kind==='EVIDENCE'
     ?formatReadOnlyResult('EVIDENCE',formatFederatedVoiceEvidence(data,intent.question))
     :formatReadOnlyResult('INSIGHT',data);
   if(controller!==abort||abort.signal.aborted)return;
   lastAnswer=normalized.answer;
   answer.textContent=normalized.answer;
   for(const ref of normalized.sources||[]){
    if(!/^https:\/\/github\.com\/vyndivybes\/(?:vaos|vyndios)\/blob\/|^https:\/\/github\.com\/vayu-shastr\/veloxis-engineering-design-manual\/blob\//.test(ref.url))continue;
    const a=document.createElement('a');a.href=ref.url;a.rel='noopener noreferrer';a.target='_blank';
    a.textContent=ref.repository+' · '+ref.path+' : '+ref.line;sources.append(a);
   }
   const diagnostic=typeof data?.diagnosticCode==='string'&&/^VOICE_[A-Z_]{3,45}$/.test(data.diagnosticCode)?' ['+data.diagnosticCode+']':'';
   setStatus(normalized.status==='OBSERVED'?'Read-only evidence retrieved. No changes performed.':'HOLD: relevant evidence not independently established.'+diagnostic);
   if(speakToggle.checked&&voiceEnabled)speaking=speakAnswer()===true;
  }catch(error){
   if(controller!==abort)return;
   const expired=abort.signal.aborted;
   const expiredText='I could not retrieve a verified business answer within 25 seconds. The source may be unavailable.';
   lastAnswer=expired?expiredText:'I could not retrieve a verified business answer. No records were changed.';
   answer.textContent=lastAnswer;
   setStatus(expired?'Request timed out. Try again or check source connections.':String(error?.message||'Read-only lookup unavailable.'));
   if(speakToggle.checked&&voiceEnabled)speaking=speakAnswer()===true;
  }finally{clearTimeout(timer);if(controller===abort)controller=null;busy=false;if(!speaking)wake?.resume();state();}
 });
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask.click();}});
 wake=createWakeListener({
  RecognitionClass:SpeechRecognition,
  isVisible:()=>document.visibilityState==='visible',
  validateQuestion:q=>classifyDashboardQuestion(q).kind!=='DENY',
  onDraft:q=>{input.value=q;state();},
  onConfirm:q=>{input.value=q;ask.click();},
  onStatus:message=>{if(wakeStatus)wakeStatus.textContent=message;},
  onChange:info=>{
   if(wakeToggle){wakeToggle.setAttribute('aria-pressed',String(info.enabled));wakeToggle.textContent=info.enabled?'■ Disable “Hey VAOS”':'◉ Enable “Hey VAOS”';}
   if(wakeIndicator){
    wakeIndicator.dataset.mode=info.active?'listening':info.enabled?'paused':'off';
    const stateLabel=info.active?'Microphone listening':info.enabled?'Microphone paused':'Microphone off';
    wakeIndicator.textContent=stateLabel;wakeIndicator.setAttribute('aria-label',stateLabel);
   }
   state();
  },
 });
 wakeToggle?.addEventListener('click',()=>{
  if(!voiceEnabled)return;
  if(wake.isEnabled())wake.disable('Hey VAOS disabled. This tab no longer listens.');
  else wake.enable();
  state();
 });
 document.addEventListener('visibilitychange',()=>{wake.onVisibilityChange();if(document.visibilityState!=='visible'){cancel();state();}});
 state();
 fetch('/api/voice-capabilities',{credentials:'same-origin',cache:'no-store'}).then(x=>x.ok?x.json():null).then(x=>{
  voiceEnabled=voiceCapabilityReady(x?.data);
  if(!voiceEnabled)wake?.disable('Voice wake capability is not yet qualified for this account.');
  if(!voiceEnabled)setStatus('Voice microphone is not qualified for this session. Text-based, read-only queries remain available.');
  else if(!SpeechRecognition)setStatus('Microphone recognition is unavailable in this browser. Type your question or use another supported browser.');
  else setStatus('Ready. Tap the microphone, or type a read-only question.');
  state();
 }).catch(()=>{setStatus('Voice qualification cannot be verified. Type a read-only question.');state();});
 window.addEventListener('pagehide',()=>{wake?.disable('Session ended; microphone off.');cancel();},{once:true});
}
if(typeof document!=='undefined')init();
