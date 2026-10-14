import {formatFederatedVoiceEvidence} from './lib/federated-voice-report.mjs';
import {resolveVoiceIntent} from './lib/voice-intelligence.mjs';
import {createG5ResponseTiming,formatG5ResponseTiming} from './lib/g5-response-timing.mjs';
import {createG6Conversation,classifyG6Interruption} from './lib/g6-conversation.mjs';
import {isAdvisoryQuestion} from './lib/business-advice.mjs';
import {planAdaptiveReads} from './lib/adaptive-read-planner.mjs';
import {createWakeListener,extractFinalTranscript} from './lib/hey-vaos.mjs?v=20261012-handsfree-unified';
import {createVoiceReadback} from './lib/voice-readback.mjs';
import {getMicrophoneReadiness,probeMicrophonePermission} from './lib/microphone-diagnostics.mjs';
import {prepareLocalSpeech,configureSpeechRecognition,SPEECH_LOCALES} from './lib/local-speech.mjs';
// Same signed VYNDI reads and repository evidence used by existing Founder Voice.
// This small home assistant deliberately performs no commands, approvals or writes.
const MODIFICATION=/\b(approve|reject|execute|delete|remove|pay|payment|transfer|send|dispatch|submit|create|change|edit|update|modify|post|purchase|authorize|authorise|activate|deactivate|override|merge|deploy|issue|book|order now|write)\b/i;
const SALES=/\b(sales|revenue|orders?|invoices?|customers?|deals?|pipeline|receivables?|quotations?)\b/i;
const SIGNED_VYNDI_SOURCE_AUTHORITIES=new Set([
 'listSalesOrders','getConfiguredDemandShortages','getAuthoritativeInventory',
 'getProductionJobCards','getAssetMaintenanceState','getAccountingWorkbench',
 'listPeopleOfficeAuthority','getEngineeringChangeControlState',
]);
const G5_ISO_UTC=/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function sanitizeVoiceTranscript(value){
 if(typeof value!=='string')return null;
 const s=value.trim().replace(/^(hey|hello|hi)\s+vaos\s*[,.:!?-]?\s*/i,'').trim();
 return s.length>=5&&s.length<=300&&!/[\x00-\x1f\x7f]/.test(s)?s:null;
}
export function classifyDashboardQuestion(value){
 const q=sanitizeVoiceTranscript(value);
 if(!q)return {kind:'DENY',question:q};
 if(!MODIFICATION.test(q)&&/\b(startup|prelaunch|start (?:my |the )?company|company readiness|first records|next startup actions)\b/i.test(q))return {kind:'STARTUP',question:q};
 const route=resolveVoiceIntent(q);
 if(route.reason==='BLOCKED_OR_UNBOUNDED')return {kind:'DENY',question:q};
 if(['CONTROLLED_ENGINEERING_AUTHORITY','MISSION_RECOVERY_EXPLANATION','READ_ONLY_AUTHORITY_EXPLANATION'].includes(route.reason)||['missions','governance'].includes(route.domain))
  return {kind:'INSIGHT',question:q,domain:route.domain};
 if(isAdvisoryQuestion(q)&&planAdaptiveReads(q).state!=='DENIED')return {kind:'ADVISORY',question:q,domain:'advisory'};
 return {kind:route.domain==='documentation'?'EVIDENCE':'INSIGHT',question:q,domain:route.domain};
}
/** Explicit hands-free opt-in supports read-only business questions directly.
 * Other speech (including background conversations) never submits a request.
 */
/** G5: simple factual questions use one signed departmental read. Cross-source
 * advice and canonical AI-workforce questions keep the existing adaptive path.
 * This saves the founder's AI budget and avoids substituting model summaries
 * for a directly available inventory, sales or finance observation.
 */
export function shouldUseAdaptiveAnswer(intent,selected){
 if(selected!==true||!intent||intent.kind==='DENY'||intent.kind==='STARTUP')return false;
 if(['governance','missions'].includes(intent.domain)||intent.domain==='engineering')return false;
 if(intent.kind==='ADVISORY'||intent.domain==='group')return true;
 if(/\b(?:weather|rain|temperature|snow|humidity|storm)\b/i.test(intent.question||''))return true;
 return typeof intent.question==='string'
  &&/\b(?:digital|ai|artificial intelligence)\s+(?:employees?|agents?|workforce)\b|\b(?:orchestrator|knowledge agent)\b/i.test(intent.question);
}

export function isDirectBusinessQuestion(value){
 const text=typeof value==='string'?value.trim():'';
 if(!/^(?:what|how|which|where|when|who|can you|could you|show|list|tell me|give me|do we|are there|is there|summarize|report)\b/i.test(text))return false;
 const intent=classifyDashboardQuestion(text);
 return intent.kind!=='DENY';
}
/** Founder-visible, privacy-safe runtime classification; no model prose is trusted. */
export function formatAdaptiveStatus(data){
 const count=data?.sourceCoverage?.observed;
 const observed=Number.isInteger(count)&&count>=0&&count<=3?count:0;
 const verified=data?.reasoningMode==='MODEL_CHECKED_ADVISORY'
  &&data?.verification?.status==='BOUNDED_CONSISTENCY_PASS';
 const label=verified?'model draft checked (bounded)':'evidence-only fallback';
 const reason=data?.diagnostics?.modelAvailability;
 const why=reason==='BUDGET_EXHAUSTED'?' · Daily AI quota reached'
  :reason==='DRAFT_REJECTED'?' · Unverified model draft withheld'
   :reason==='AI_BINDING_UNAVAILABLE'?' · AI inference unavailable':'';
 const elapsed=data?.diagnostics?.elapsedMs;
 const timing=Number.isInteger(elapsed)&&elapsed>=0&&elapsed<=60000
  ?' · '+(elapsed/1000).toFixed(1)+'s':'';
 const pilot=data?.v3Pilot?.pilotState==='READ_ONLY_EVALUATION_ACTIVE'&&data?.v3Pilot?.v3AutonomyState==='HOLD'
  ?'V3 supervised evaluation active (autonomous upgrade on HOLD) · ':'';
 const jarvis=data?.jarvisX?.mode==='READ_ONLY_ADVISORY_PREVIEW'
  &&data?.jarvisX?.actionAuthorized===false
  &&data?.jarvisX?.coordination?.dispatchedAgents===0
  ?'JARVIS X read-only preview (hypothetical reviews only) · ':'';
 return pilot+jarvis+'Adaptive '+label+' · '+observed+' sources observed'+why+timing+'. No business changes.';
}
export function voiceCapabilityReady(x){
 return x?.enabled===true&&x?.manualReviewRequired===true
 &&x.actionAuthorized===false&&x.agentDispatch===false
 &&x.automaticSubmission===false&&x.serverAudioEnabled===false;
}
export function formatReadOnlyResult(kind,data){
 if(kind==='STARTUP'){
  if(data?.schemaVersion!=='VAOS_PRELAUNCH_WORKSPACE_V1'||data.operatingPhase!=='PRELAUNCH'||!Array.isArray(data.employees)||data.employees.length!==16||data.automaticBusinessEffectsAuthorized!==false)throw Error('PRELAUNCH_SOURCE_INVALID');
  const available=data.employees.filter(e=>e.roleFloorMet===true).length;
  const fortnight='PRELAUNCH PRIORITIES — NEXT TWO WEEKS (proposed, not assigned).\\nWeek 1: (1) Knowledge/Corporate — reconcile the existing incorporation and CA handoff pack, mark missing filings clearly. (2) Engineering/VEDM — consolidate the authoritative geometry, Toray material requests and open validation gates. (3) Finance — prepare an opening-budget worksheet with unknown amounts unfilled.\\nWeek 2: (4) Procurement — collect draft supplier enquiries and quotations; do not release purchase orders without the appropriate BOM and approvals. (5) Commercial — build a proposed customer and lead pipeline, distinguishing prospective contacts from confirmed real orders. (6) Project/QA — map prototype dependencies, responsibilities and evidence gaps into a founder-reviewable action register.\\nThis is a proposed plan; no employee was dispatched and no document review or actual expenditure is claimed.';
  return {status:'OBSERVED',answer:available+' of 16 registered roles have recorded preparation status.\\n\\n'+fortnight,
    sources:[],language:'en'};
 }
 if(kind==='COMMERCIAL'){
  if(data?.readOnly!==true||data?.actionAuthorized!==false
    ||data?.sourceSystem!=='VYNDI_OS'||typeof data?.answer!=='string'
    ||data.answer.length>4000)throw Error('COMMERCIAL_EVIDENCE_INVALID');
  return {status:'OBSERVED',answer:data.answer.slice(0,2100),sources:[]};
 }
 if(kind==='ADVISORY'){
  if(data?.readOnly!==true||data?.actionAuthorized!==false||data?.advisoryOnly!==true
   ||data?.sourceSystem!=='BUSINESS_ADVISORY'||!['OBSERVED','HOLD'].includes(data.status)
   ||typeof data.answer!=='string'||data.answer.length<25||data.answer.length>7500)
   throw Error('BUSINESS_ADVISORY_INVALID');
  const refs=Array.isArray(data.webSources)?data.webSources.filter(x=>x&&typeof x.title==='string'
   &&/^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]+$/.test(x.url)).slice(0,3)
   .map(x=>({url:x.url,repository:'Unverified web headline',path:x.title.slice(0,150)})):[];
  const technical=Array.isArray(data.technicalSources)?data.technicalSources.filter(x=>
    x&&typeof x.url==='string'&&typeof x.repository==='string'&&typeof x.path==='string'
    &&/^https:\/\/github\.com\/vayu-shastr\/(?:veloxis-engineering-design-manual|adv-vibpe)\/blob\/[0-9a-f]{40}\/[A-Za-z0-9_./-]+$/.test(x.url)
    &&x.url.includes('/'+x.repository+'/blob/')&&x.url.endsWith('/'+x.path)).slice(0,5):[];
   return {status:data.status,answer:data.answer.slice(0,7100),sources:[...refs,...technical],
   language:data.translationQualified?data.language:'en',
   spokenAnswer:typeof data.spokenAnswer==='string'&&data.spokenAnswer.length>=20
     &&data.spokenAnswer.length<=450?data.spokenAnswer:data.answer.slice(0,320)};
 }
 if(kind==='ADAPTIVE'){
  const prepared=data?.status==='PREPARED'&&data?.planningMode==='STARTUP_PREPARATION'
   &&data?.reasoningMode==='PREPARED_PLAN'&&data?.executionCount===0
   &&data?.automationExecuted===false&&data?.sourceCoverage?.observed===0;
  if(data?.readOnly!==true||data?.advisoryOnly!==true||data?.actionAuthorized!==false
    ||data?.sourceSystem!=='VAOS_ADAPTIVE'||(!['OBSERVED','HOLD'].includes(data.status)&&!prepared)
    ||typeof data.answer!=='string'||data.answer.length<30||data.answer.length>6500)
   throw Error('ADAPTIVE_EVIDENCE_INVALID');
  const refs=Array.isArray(data.sources)?data.sources.filter(x=>x&&typeof x.url==='string'
   &&typeof x.repository==='string'&&typeof x.path==='string'
   &&/^https:\/\/github\.com\/vayu-shastr\/(?:veloxis-engineering-design-manual|adv-vibpe)\/blob\/[a-f0-9]{40}\/[A-Za-z0-9_./-]+$/.test(x.url)
   &&x.url.includes('/'+x.repository+'/blob/')&&x.url.endsWith('/'+x.path)).slice(0,5):[];
  return {status:data.status,answer:data.answer.slice(0,6300),sources:refs,language:'en',
   spokenAnswer:typeof data.spokenAnswer==='string'&&data.spokenAnswer.length>=20
    &&data.spokenAnswer.length<=450?data.spokenAnswer:data.answer.slice(0,320)};
 }
 if(kind==='INSIGHT'&&data?.sourceSystem==='VAOS_POLICY'){
  if(data?.schemaVersion!=='VAOS_GOVERNANCE_EXPLANATION_V1'
    ||data.readOnly!==true||data.actionAuthorized!==false
    ||data.status!=='OBSERVED'||typeof data.answer!=='string'
    ||data.answer.length<30||data.answer.length>2500)
   throw Error('VOICE_INSIGHT_UNVERIFIED');
  return {status:'OBSERVED',answer:data.answer,sources:[],language:'en'};
 }
 if(kind==='INSIGHT'&&data?.sourceSystem==='VAOS_MISSION_CONTROL'){
  if(data.readOnly!==true||data.actionAuthorized!==false
   ||data.businessEffectsExecuted!==false
   ||!['OBSERVED','HOLD'].includes(data.status)
   ||typeof data.answer!=='string'||data.answer.length<35||data.answer.length>4000
   ||(data.status==='OBSERVED'&&
    (data.schemaVersion!=='VAOS_FOUNDER_MISSION_ANSWER_V1'
    ||data.sourceAuthority!=='vaos_founder_mission_answer_summary')))
   throw Error('VOICE_INSIGHT_UNVERIFIED');
  return {status:data.status,answer:data.answer,sources:[],language:'en'};
 }

 if(kind==='INSIGHT'){
  if(data?.readOnly!==true||data.actionAuthorized!==false
   ||!['VAOS_INTELLIGENCE','VYNDI_OS','ENGINEERING_FEDERATION'].includes(data.sourceSystem)
   ||!['OBSERVED','HOLD'].includes(data.status)
   ||typeof data.answer!=='string'||data.answer.length<8||data.answer.length>5000
   ||data.status==='OBSERVED'&&!['VYNDI_OS','ENGINEERING_FEDERATION'].includes(data.sourceSystem))
   throw Error('VOICE_INSIGHT_UNVERIFIED');
  if(data.sourceSystem==='VYNDI_OS'&&data.status==='OBSERVED'){
   // A signed selected-window observation is not a certified enterprise total.
   if(!SIGNED_VYNDI_SOURCE_AUTHORITIES.has(data.sourceAuthority)
      ||!Number.isSafeInteger(data.recordsObserved)||data.recordsObserved<0||data.recordsObserved>200
      ||data.sourceWindow!=='BOUNDED_SELECTED_ROWS'
      ||data.dataCompleteness!=='BOUNDED_SOURCE_WINDOW'
      ||typeof data.observedAt!=='string'||!G5_ISO_UTC.test(data.observedAt)
      ||!Number.isFinite(Date.parse(data.observedAt)))
    throw Error('VOICE_INSIGHT_UNVERIFIED');
   const provenance='SOURCE [1] VYNDI OS · '+data.sourceAuthority+
    ' · '+data.recordsObserved+' selected rows (up to 100 per source collection) · observed '+data.observedAt+
    '. This is not a complete business total or an independently qualified financial or engineering release.';
   return {status:'OBSERVED',answer:(data.answer.slice(0,2600)+'\n\n'+provenance).slice(0,2900),
    spokenAnswer:data.answer.slice(0,900),sources:[],language:['en','ta','ml','hi'].includes(data.language)?data.language:'en'};
  }
  const refs=data.sourceSystem==='ENGINEERING_FEDERATION'&&Array.isArray(data.sources)
   ?data.sources.filter(x=>x&&typeof x.url==='string'
    &&/^https:\/\/github\.com\/vayu-shastr\/(?:veloxis-engineering-design-manual|adv-vibpe)\/blob\/[0-9a-f]{40}\//.test(x.url)).slice(0,6):[];
  return {status:data.status,answer:data.answer.slice(0,2900),sources:refs,language:['en','ta','ml','hi'].includes(data.language)?data.language:'en'};
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
/** Safely render decision sections as selectable cards rather than a wall of
 * ledger text. All content uses textContent, never untrusted HTML.
 */
export function splitDecisionBrief(answer){
 if(typeof answer!=='string'||answer.length>7500)return [];
 return answer.split(/\n\n+/).slice(0,15).map(section=>{
  const dash=section.indexOf(' — ');
  return dash<0?{label:'BUSINESS REVIEW',detail:section.slice(0,2300)}:
   {label:section.slice(0,dash).slice(0,40),detail:section.slice(dash+3).slice(0,2300)};
 });
}
function init(){
 const root=document.querySelector('#vaos-main-voice');
 if(!root)return;
 const $=id=>root.querySelector('#'+id);
 const mic=$('vaos-voice-mic'),stop=$('vaos-voice-stop'),ask=$('vaos-voice-ask'),
  speech=$('vaos-voice-speak'),input=$('vaos-voice-question'),answer=$('vaos-voice-answer'),
  note=$('vaos-voice-status'),sources=$('vaos-voice-sources'),speakToggle=$('vaos-voice-speech-toggle'),
  wakeToggle=$('vaos-wake-toggle'),wakeIndicator=$('vaos-wake-indicator'),wakeStatus=$('vaos-wake-status'),testSpeaker=$('vaos-voice-test'),replyLanguage=$('vaos-voice-language'),adaptive=$('vaos-voice-adaptive'),micCheck=$('vaos-voice-mic-check'),micDiagnostic=$('vaos-voice-mic-diagnostic');
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let localSpeech=null,interruption=null;
 let recognition=null,controller=null,voiceEnabled=false,lastAnswer='',spokenAnswer='',busy=false,speechRun=0,wake=null,answerLanguage='en',capability='loading',micPermission='unknown';
 const g5Timing=createG5ResponseTiming();
 const conversation=createG6Conversation();
 const setStatus=message=>{note.textContent=message;};
 const player=createVoiceReadback({
  synthesis:window.speechSynthesis,UtteranceClass:window.SpeechSynthesisUtterance,
  language:()=>({ta:'ta-IN',ml:'ml-IN',hi:'hi-IN'}[answerLanguage]||'en-US'),
  onState:mode=>{if(mode==='QUEUED')setStatus('Voice queued; checking audio output.');
    if(mode==='SPEAKING'){setStatus('VAOS is speaking.');startInterruption();}},
  onError:code=>setStatus('Audio unavailable ('+code+'). Read the displayed answer or test your speaker.'),
  onFinished:mode=>{stopInterruption();if(mode==='FINISHED')setStatus('Spoken answer completed.');wake?.resume();state();}
 });
 const readiness=()=>getMicrophoneReadiness({capability,
  recognitionAvailable:typeof SpeechRecognition==='function',
  secureContext:window.isSecureContext!==false,permission:micPermission});
 const state=()=>{
  const micState=readiness();
  if(micDiagnostic)micDiagnostic.textContent=micState.message;
  mic.disabled=!micState.mayListen||!!recognition||busy||!!wake?.state().active;
  ask.disabled=busy;
  if(wakeToggle)wakeToggle.disabled=!micState.mayListen;
  stop.disabled=!recognition&&!controller&&!player.active()&&!wake?.isEnabled();
  speech.disabled=!lastAnswer||!voiceEnabled||!window.speechSynthesis||!window.SpeechSynthesisUtterance;};
 function stopInterruption(){const active=interruption;interruption=null;if(active){clearTimeout(active.timer);try{active.recognition.abort();}catch{}}}
 function startInterruption(){
  if(interruption||localSpeech?.status!=='LOCAL_READY'||!wake?.isEnabled())return;
  let r;try{r=new SpeechRecognition();if(!('processLocally' in r))return;r.processLocally=true;r.lang=localSpeech.locale;r.interimResults=false;r.continuous=false;}catch{return;}
  const active={recognition:r,timer:setTimeout(()=>stopInterruption(),15000)};interruption=active;
  r.onresult=e=>{
   if(interruption!==active)return;
   const result=classifyG6Interruption(extractFinalTranscript(e),question=>{
    const resolved=conversation.resolve(question);
    const candidate=classifyDashboardQuestion(resolved.question);
    return candidate.kind!=='DENY'&&candidate.domain!=='unsupported'
     &&(conversation.canFollowUp(question)||isDirectBusinessQuestion(question));
   });
   if(result.kind==='IGNORE')return;
   stopInterruption();player.cancel();
   if(result.kind==='STOP'){
    setStatus('Spoken interruption received. Playback stopped.');wake?.resume();state();return;
   }
   // Require an explicit "Hey VAOS" on-device utterance before a new request.
   input.value=result.question;
   setStatus('Voice interrupted. Reading the new permitted question.');
   ask.click();
  };
  r.onend=()=>{if(interruption===active)stopInterruption();};r.onerror=()=>{if(interruption===active)stopInterruption();};
  try{r.start();}catch{stopInterruption();}
 }
 const cancel=()=>{
  stopInterruption();
  const active=recognition;recognition=null;
  if(active)try{active.abort()}catch{}
  if(controller){controller.abort();controller=null}
  player.cancel();
  busy=false;state();
 };
 const speakAnswer=()=>{
  if(!voiceEnabled||!lastAnswer)return false;
  wake?.pause();
  const started=player.speak(spokenAnswer||lastAnswer);
  if(!started)wake?.resume();
  state();return started;
 };
 testSpeaker?.addEventListener('click',()=>{
  wake?.pause();
  const started=player.speak('VAOS speaker test. If you can hear this voice, your browser audio output is working.');
  if(!started)wake?.resume();
  state();
 });
 mic.addEventListener('click',async()=>{
  if(!voiceEnabled||!SpeechRecognition||recognition||busy)return;
  wake?.pause();
  player.cancel();
  const active=new SpeechRecognition();recognition=active;
  const language=replyLanguage?.value||'en';
  const available=await prepareLocalSpeech(SpeechRecognition,language);
  if(recognition!==active||!voiceEnabled)return;
  const partial=configureSpeechRecognition(active,{language,localLocale:available.status==='LOCAL_READY'?available.locale:null,
   onInterim:text=>{if(recognition===active){input.value=text;setStatus('Listening: '+text+' (partial; not submitted)');}},
   onActivity:activity=>{if(recognition===active)setStatus(activity==='SPEECH_START'?'Speech detected.':'Speech ended; waiting for the final transcript.');}});
  active.onresult=event=>{
   if(recognition!==active)return;
   partial(event);
   const t=sanitizeVoiceTranscript(extractFinalTranscript(event));
   if(!t){setStatus('No complete spoken question was recognized. Nothing was submitted.');return;}
   input.value=t;
   setStatus('Recognized your question. Requesting one read-only VAOS answer…');
   recognition=null;
   try{active.stop?.();}catch{}
   ask.click();
  };
  active.onerror=error=>{
   if(recognition!==active)return;
   micPermission=error?.error==='not-allowed'||error?.error==='service-not-allowed'?'denied':'unavailable';
   setStatus(error?.error==='not-allowed'||error?.error==='service-not-allowed'
    ?'Browser denied microphone speech recognition. Open Chrome Site settings → Microphone → Allow and retry.'
    :'Speech recognition failed. Select Check microphone for diagnostics.');
   state();
  };
  active.onend=()=>{if(recognition===active){recognition=null;wake?.resume();state();}};
  try{active.start();setStatus(available.status==='LOCAL_READY'?'Listening on this device.':'Listening once. Browser speech recognition may use a vendor service.');}
  catch{recognition=null;micPermission='unavailable';setStatus('Microphone could not start. Select Check microphone for diagnostics, or type the question.');}
  state();
 });
 stop.addEventListener('click',()=>{
  // If only the synthesized answer is active, Stop means stop playback, not
  // end the founder's still-valid read-only conversation. This prevents
  // legitimate "And the blockers?" follow-ups after stopping a long answer.
  // The five-minute/three-follow-up volatile context bounds stay in force.
  if(player.active()&&!recognition&&!controller&&!wake?.isEnabled()){
   stopInterruption();
   player.cancel();
   setStatus('Spoken answer stopped. You can ask a follow-up in this tab.');
   state();
   return;
  }
  // Stop while the mic, hands-free or source request is active still ends
  // the session, invalidates late callbacks and clears conversation context.
  wake?.disable('Hey VAOS switched off. Microphone stopped.');
  cancel();conversation.clear();setStatus('Stopped. No business actions authorized. Conversation context cleared.');
 });
 speech.addEventListener('click',speakAnswer);
 ask.addEventListener('click',async()=>{
  if(busy)return;
  const resolved=conversation.resolve(input.value);
  const intent=classifyDashboardQuestion(resolved.question);
  if(intent.kind==='DENY'){conversation.clear();setStatus('Read-only questions only. Commands, approvals, payments and changes must use governed VAOS controls.');return;}
  wake?.pause();
  cancel();busy=true;lastAnswer='';spokenAnswer='';answerLanguage='en';answer.textContent='Retrieving verified evidence…';sources.replaceChildren();state();
  const requestedAt=performance.now();
  const abort=new AbortController();controller=abort;
  const timer=setTimeout(()=>abort.abort(),25000);
  let speaking=false;
  try{
   const startup=intent.kind==='STARTUP';
   const investigate=shouldUseAdaptiveAnswer(intent,adaptive?.checked);
   const route=startup?'/api/prelaunch-workforce':investigate?'/api/adaptive-intelligence?q='+encodeURIComponent(intent.question)+'&eval=v3-readonly&mode=jarvis-x'
    :intent.kind==='EVIDENCE'
    ?'/api/federated-knowledge?q='+encodeURIComponent(intent.question)
    :intent.domain==='engineering'
      ?'/api/engineering-knowledge?q='+encodeURIComponent(intent.question)
      :intent.kind==='ADVISORY'
        ?'/api/business-advisor?q='+encodeURIComponent(intent.question)+'&lang='+encodeURIComponent(replyLanguage?.value||'en')
        :'/api/voice-insight?q='+encodeURIComponent(intent.question)+'&lang='+encodeURIComponent(replyLanguage?.value||'en');
   const response=await fetch(route,{method:'GET',credentials:'same-origin',cache:'no-store',signal:abort.signal});
   if(!response.ok)throw Error(response.status===401?'Session expired. Please sign in again.':response.status===422?'This request is not an allowed read-only question.':'This source is not commissioned or cannot be verified.');
   const data=(await response.json())?.data;
   const normalized=startup?formatReadOnlyResult('STARTUP',data):investigate?formatReadOnlyResult('ADAPTIVE',data)
    :intent.kind==='EVIDENCE'
     ?formatReadOnlyResult('EVIDENCE',formatFederatedVoiceEvidence(data,intent.question))
     :formatReadOnlyResult(intent.kind==='ADVISORY'?'ADVISORY':'INSIGHT',data);
   if(controller!==abort||abort.signal.aborted)return;
   conversation.remember(intent,normalized.status,{usedContext:resolved.usedContext});
   lastAnswer=normalized.answer;
   spokenAnswer=normalized.spokenAnswer||normalized.answer;
   answerLanguage=normalized.language||'en';
   answer.textContent=normalized.answer;
   answer.className='';
   if((intent.kind==='ADVISORY'||investigate)&&answerLanguage==='en'&&typeof document.createElement==='function'){
    const blocks=splitDecisionBrief(normalized.answer);
    if(blocks.length>=3){
     answer.replaceChildren();
     answer.className='va-brief-grid';
     for(const block of blocks){
      const card=document.createElement('section');
      const head=document.createElement('h3');
      const body=document.createElement('p');
      card.className='va-brief-card'+(/^(DECISION|DO FIRST|WHAT-IF|FORECAST|RISK RANKING|30\/60\/90-DAY PLAN|SIX-MONTH OPERATING OUTLOOK)$/.test(block.label)?' va-brief-card--priority':'');
      head.textContent=block.label;body.textContent=block.detail;
      card.append(head,body);answer.append(card);
     }
    }
   }
   for(const ref of normalized.sources||[]){
    if(!/^https:\/\/github\.com\/vyndivybes\/(?:vaos|vyndios)\/blob\/|^https:\/\/github\.com\/vayu-shastr\/(?:veloxis-engineering-design-manual|adv-vibpe)\/blob\/|^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]+$/.test(ref.url))continue;
    const a=document.createElement('a');a.href=ref.url;a.rel='noopener noreferrer';a.target='_blank';
    a.textContent=ref.repository+' · '+ref.path+(Number.isInteger(ref.line)?' : '+ref.line:'');sources.append(a);
   }
   const diagnostic=typeof data?.diagnosticCode==='string'&&/^[A-Z][A-Z_]{4,55}$/.test(data.diagnosticCode)?' ['+data.diagnosticCode+']':'';
   const measured=g5Timing.record(Math.min(300000,Math.max(0,performance.now()-requestedAt)),
     normalized.status==='OBSERVED'?'OBSERVED':'HOLD');
   setStatus((investigate
    ?formatAdaptiveStatus(data)
    :normalized.status==='OBSERVED'?'Read-only evidence retrieved. No changes performed.':'HOLD: relevant evidence not independently established.'+diagnostic)
    +(resolved.usedContext?' · G6 follow-up: fresh read-only source':'')
    +' · '+formatG5ResponseTiming(measured));
   if(speakToggle.checked&&voiceEnabled)speaking=speakAnswer()===true;
  }catch(error){
   if(controller!==abort)return;
   const expired=abort.signal.aborted;
   const expiredText='I could not retrieve a verified business answer within 25 seconds. The source may be unavailable.';
   lastAnswer=expired?expiredText:'I could not retrieve a verified business answer. No records were changed.';
   spokenAnswer=lastAnswer;
   answer.textContent=lastAnswer;
   const measured=g5Timing.record(Math.min(300000,Math.max(0,performance.now()-requestedAt)),'ERROR');
   setStatus((expired?'Request timed out. Try again or check source connections.':
    'Read-only lookup unavailable.')+' · '+formatG5ResponseTiming(measured));
   if(speakToggle.checked&&voiceEnabled)speaking=speakAnswer()===true;
  }finally{clearTimeout(timer);if(controller===abort)controller=null;busy=false;if(!speaking)wake?.resume();state();}
 });
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask.click();}});
 wake=createWakeListener({
  configureRecognition:r=>{if(localSpeech?.status!=='LOCAL_READY')throw Error('LOCAL_SPEECH_REQUIRED');r.processLocally=true;r.lang=localSpeech.locale;},
  onInterim:text=>{if(wakeStatus)wakeStatus.textContent='Listening: '+text+' (partial; not submitted)';},
  onActivity:activity=>{if(wakeStatus)wakeStatus.textContent=activity==='SPEECH_START'?'Local speech detected.':'Waiting for the final transcript.';},
  RecognitionClass:SpeechRecognition,
  isVisible:()=>document.visibilityState==='visible',
  validateQuestion:q=>{
   const candidate=classifyDashboardQuestion(conversation.resolve(q).question);
   return candidate.kind!=='DENY'&&candidate.domain!=='unsupported';
  },
  acceptDirectQuestion:q=>isDirectBusinessQuestion(q)||conversation.canFollowUp(q),
  onHeard:event=>{if(event==='IGNORED')setStatus('Speech heard, but not an actionable business question. Ask about sales, production or HR directly, or say Hey VAOS.');},
  onDraft:q=>{input.value=q;state();},
  onConfirm:q=>{input.value=q;ask.click();},
  onStatus:message=>{if(wakeStatus)wakeStatus.textContent=message;},
  onChange:info=>{
   if(wakeToggle){wakeToggle.setAttribute('aria-pressed',String(info.enabled));wakeToggle.textContent=info.enabled?'■ Stop hands-free':'◉ Enable hands-free voice';}
   if(wakeIndicator){
    wakeIndicator.dataset.mode=info.active?'listening':info.enabled?'paused':'off';
    const stateLabel=info.active?'Microphone listening':info.enabled?'Microphone paused':'Microphone off';
    wakeIndicator.textContent=stateLabel;wakeIndicator.setAttribute('aria-label',stateLabel);
   }
   state();
  },
 });
 wakeToggle?.addEventListener('click',async()=>{
  if(!voiceEnabled)return;
  if(wake.isEnabled()){wake.disable('Hands-free voice disabled. This tab no longer listens.');conversation.clear();}
  else {
   setStatus('Checking the on-device speech language pack…');
   localSpeech=await prepareLocalSpeech(SpeechRecognition,replyLanguage?.value||'en');
   if(localSpeech.status!=='LOCAL_READY'&&window.confirm('Install the free browser speech language pack for local hands-free listening?'))localSpeech=await prepareLocalSpeech(SpeechRecognition,replyLanguage?.value||'en',{install:true});
   if(localSpeech.status==='LOCAL_READY')wake.enable();
   else setStatus('Local wake recognition is unavailable for this browser/language. The microphone button and typed questions remain available.');
  }
  state();
 });
 replyLanguage?.addEventListener('change',()=>{stopInterruption();localSpeech=null;conversation.clear();wake?.disable('Language changed. Enable local hands-free listening for the selected language.');state();});
 document.addEventListener('visibilitychange',()=>{wake.onVisibilityChange();if(document.visibilityState!=='visible'){cancel();conversation.clear();state();}});
 const refreshVoiceCapability=async()=>{
  let mode='unavailable';
  try{
   const response=await fetch('/api/voice-capabilities',{credentials:'same-origin',cache:'no-store'});
   if(response.status===401)mode='unauthenticated';
   else if(response.ok){
    const payload=await response.json();
    mode=voiceCapabilityReady(payload?.data)?'enabled':'disabled';
   }
  }catch{}
  capability=mode;voiceEnabled=mode==='enabled';
  if(!voiceEnabled){wake?.disable('Voice wake capability is not yet qualified for this account.');conversation.clear();}
  state();return mode;
 };
 // Initial capability discovery does not open or record the microphone.
 state();
 void refreshVoiceCapability().then(()=>{
  setStatus(readiness().message);
 });
 // Only this explicit user gesture requests microphone permission. The probe
 // stops every captured track immediately; no microphone audio is persisted.
 micCheck?.addEventListener('click',async()=>{
  if(micCheck.disabled)return;
  micCheck.disabled=true;
  setStatus('Checking VAOS voice qualification and browser microphone permission…');
  try{
   await refreshVoiceCapability();
   const current=readiness();
   if(current.canProbe){
    micPermission=await probeMicrophonePermission({
     mediaDevices:typeof navigator!=='undefined'?navigator.mediaDevices:null});
    if(micPermission==='unsupported')micPermission='unavailable';
   }
   setStatus(readiness().message);
  }finally{micCheck.disabled=false;state();}
 });
 window.addEventListener('pagehide',()=>{wake?.disable('Session ended; microphone off.');cancel();conversation.clear();},{once:true});
}
if(typeof document!=='undefined')init();
