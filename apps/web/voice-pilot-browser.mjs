import {appendVoiceTranscript,VOICE_AUDIO_TEST_MESSAGE,isReadOnlyMissionStatusQuestion} from './lib/voice-pilot.mjs';
import {createVoicePilotController} from './lib/voice-pilot-controller.mjs';
import {createVoiceAudioDiagnostics} from './voice-audio-diagnostics.mjs';
import {createOneShotVoiceConversation} from './lib/voice-one-shot.mjs';
import {createVoiceMultiTurnSession} from './lib/voice-multiturn.mjs';

const $ = id => document.getElementById(id);
const autoAsk=$('vaos-auto-ask'),autoStop=$('vaos-auto-stop'),autoStatus=$('vaos-auto-status'),autoAnswer=$('vaos-auto-answer');
let autoLookupActive=false;
let autoSession=false;
let autoRearmTimer=null;
let autoAbort=null;
const status = $('voice-pilot-status');
const startInstruction = $('voice-instruction-start');
const startFollowup = $('voice-followup-start');
const stopMic = $('voice-microphone-stop');
const speakPreview = $('voice-preview-speak');
const speakDraft = $('voice-draft-speak');
const stopAudio = $('voice-audio-stop');
const demoSpeak = $('voice-demo-speak');
const voiceShortTest = $('voice-short-test');
const voiceToneTest = $('voice-tone-test');
const diagnosticsStatus = $('voice-audio-diagnostics');
const missionSpeak = $('voice-mission-speak');
const missionReadback = $('mission-summary');
const voiceQuestion=$('voice-readonly-question');
const voiceRequestDictate=$('voice-request-dictate');
const voiceReadMission=$('voice-read-mission');
const missionForm=$('mission-form');
const oneShotStart=$('voice-one-shot-start');
const oneShotStop=$('voice-one-shot-stop');
const oneShotStatus=$('voice-one-shot-status');
const oneShotReport=$('voice-one-shot-report');
const oneShotQuestion=$('voice-one-shot-question');
const v3Open=$('voice-v3-open');
const v4Open=$('voice-v4-open');
const v4Status=$('voice-v4-status');
const v3Ask=$('voice-v3-ask');
const v3Stop=$('voice-v3-stop');
const v3Status=$('voice-v3-status');
const v3Report=$('voice-v3-report');
const v3Question=$('voice-v3-question');
const buttons=[startInstruction,startFollowup,stopMic,speakPreview,speakDraft,stopAudio,demoSpeak,missionSpeak,voiceShortTest,voiceToneTest,voiceRequestDictate,voiceReadMission,oneShotStart,oneShotStop,v3Open,v4Open,v3Ask,v3Stop];
buttons.forEach(button=>{button.disabled=true;});
let enabled=false;
let oneShotEnabled=false;
let multiTurnEnabled=false;
let aiFocusEnabled=false;

const voice=createVoicePilotController({
  RecognitionClass:window.SpeechRecognition||window.webkitSpeechRecognition,
  SpeechSynthesisUtteranceClass:window.SpeechSynthesisUtterance,
  speechSynthesis:window.speechSynthesis,
  onStatus:message=>{status.textContent=message;},
  onListeningChanged:()=>{
    updateButtons();
    if(!voice.isListening() && oneShot?.state()==='LISTENING')oneShot.cancel();
    if(!voice.isListening() && multiTurn?.state()==='LISTENING')multiTurn.cancel();
  },
  onSpeakingChanged:speaking=>{
    updateButtons();
    if(!speaking&&autoSession&&!autoAbort){
      clearTimeout(autoRearmTimer);
      autoRearmTimer=setTimeout(()=>{
        if(autoSession&&!voice.isListening()&&!autoAbort){
          autoLookupActive=true;
          autoStatus.textContent='VAOS listening for your next question.';
          if(!voice.startListening('voice-readonly-question',900))autoStatus.textContent='Microphone needs a new tap. Select Ask VAOS.';
        }
      },450);
    }
  },
  onTranscript:(targetId,transcript,maxLength)=>{
    if(!enabled)return;
    if(targetId==='voice-readonly-question'&&autoLookupActive){
      autoLookupActive=false;
      void autoReadQuestion(transcript);
      return;
    }
    if(targetId==='voice-v3-question'){
      if(!multiTurnEnabled)return;
      v3Question.value=appendVoiceTranscript('',transcript,maxLength);
      void multiTurn.accept(v3Question.value);
      return;
    }
    if(targetId==='voice-one-shot-question'){
      if(!oneShotEnabled)return;
      oneShotQuestion.value=appendVoiceTranscript('',transcript,maxLength);
      void oneShot.acceptTranscript(oneShotQuestion.value);
      return;
    }
    const target=$(targetId);
    if(!target)return;
    // Only mutate an editable draft; never send or execute a request.
    target.value=appendVoiceTranscript(target.value,transcript,maxLength);
    target.dispatchEvent(new Event('input',{bubbles:true}));
  },
});

// No server-side voice model or write-capable tool is involved.
const oneShot=createOneShotVoiceConversation({
  fetchSnapshot:async (missionId,{signal})=>{
    const url='/api/missions?missionId='+encodeURIComponent(missionId);
    const response=await fetch(url,{method:'GET',credentials:'same-origin',cache:'no-store',signal});
    if(!response.ok)throw new Error('MISSION_READ_FAILED');
    return (await response.json())?.data;
  },
  speak:(source,report)=>voice.speak(source,report),
  onReport:report=>{oneShotReport.textContent=report;},
  onState:(_state,message)=>{oneShotStatus.textContent=message;updateButtons();},
});
function oneShotBusy(){return ['LISTENING','READING'].includes(oneShot.state());}

// Multi-turn replies always come from a fresh mission snapshot. V4 AI classifies topics only; no model-authored facts.
const multiTurn=createVoiceMultiTurnSession({
  fetchSnapshot:async(missionId,{signal})=>{
    const response=await fetch('/api/missions?missionId='+encodeURIComponent(missionId),
      {method:'GET',credentials:'same-origin',cache:'no-store',signal});
    if(!response.ok)throw new Error('MISSION_READ_UNAVAILABLE');
    return (await response.json())?.data;
  },
  classifyFocus:async(question,priorTopics,{signal})=>{
    if(!aiFocusEnabled)throw new Error('VOICE_AI_DISABLED');
    const response=await fetch('/api/voice-ai-focus',{
      method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question,priorTopics}),
    });
    if(!response.ok){
      if(response.status===429)v4Status.textContent='Daily AI cap reached; use deterministic Stage V3.';
      throw new Error('VOICE_AI_CLASSIFICATION_UNAVAILABLE');
    }
    const data=(await response.json())?.data;
    if(data?.modelInvoked!==true||data?.actionAuthorized!==false
       ||!Array.isArray(data?.topics))throw new Error('VOICE_AI_UNVERIFIED');
    return data;
  },
  speak:(source,report)=>voice.speak(source,report),
  onReport:report=>{v3Report.textContent=report;},
  onState:(_state,message)=>{v3Status.textContent=message;updateButtons();},
});
function multiTurnBusy(){return ['LISTENING','READING'].includes(multiTurn.state());}
function multiTurnOpen(){return !['IDLE','EXPIRED'].includes(multiTurn.state());}

const audioDiagnostics=createVoiceAudioDiagnostics({
  SpeechSynthesisUtteranceClass:window.SpeechSynthesisUtterance,
  speechSynthesis:window.speechSynthesis,
  AudioContextClass:window.AudioContext||window.webkitAudioContext,
  onStatus:message=>{diagnosticsStatus.textContent=message;},
});
function updateDiagnostics(){
  diagnosticsStatus.textContent=audioDiagnostics.describe();
}
if(typeof window.speechSynthesis?.addEventListener==='function'){
  window.speechSynthesis.addEventListener('voiceschanged',updateDiagnostics);
}

function updateButtons() {
  autoAsk.disabled=!enabled||!voice.dictationAvailable||!voice.speechAvailable||voice.isListening();
  autoStop.disabled=!enabled;
  startInstruction.disabled=!enabled||!voice.dictationAvailable||voice.isListening()||oneShotBusy()||multiTurnBusy();
  startFollowup.disabled=!enabled||!voice.dictationAvailable||voice.isListening()||oneShotBusy()||multiTurnBusy();
  stopMic.disabled=!enabled||!voice.isListening();
  speakPreview.disabled=!enabled||!voice.speechAvailable;
  speakDraft.disabled=!enabled||!voice.speechAvailable;
  stopAudio.disabled=!enabled||!voice.speechAvailable;
  demoSpeak.disabled=!enabled||!voice.speechAvailable;
  voiceShortTest.disabled=!enabled||!audioDiagnostics.speechAvailable;
  voiceToneTest.disabled=!enabled||!(window.AudioContext||window.webkitAudioContext);
  missionSpeak.disabled=!enabled||!voice.speechAvailable;
  voiceRequestDictate.disabled=!enabled||!voice.dictationAvailable||voice.isListening()||oneShotBusy()||multiTurnBusy();
  voiceReadMission.disabled=!enabled||oneShotBusy()||multiTurnBusy();
  oneShotStart.disabled=!enabled||!oneShotEnabled||!voice.dictationAvailable||!voice.speechAvailable||voice.isListening()||oneShotBusy()||multiTurnOpen();
  oneShotStop.disabled=!enabled||!oneShotEnabled||!(oneShotBusy()||oneShot.state()==='SPOKEN_QUEUED');
  v3Open.disabled=!enabled||!multiTurnEnabled||!voice.dictationAvailable||!voice.speechAvailable||voice.isListening()||oneShotBusy()||multiTurnOpen();
  v4Open.disabled=!enabled||!aiFocusEnabled||!voice.dictationAvailable||!voice.speechAvailable||voice.isListening()||oneShotBusy()||multiTurnOpen();
  v3Ask.disabled=!enabled||!multiTurnEnabled||!voice.dictationAvailable||!voice.speechAvailable||voice.isListening()||oneShotBusy()||multiTurnBusy()||!['READY','SPOKEN_QUEUED','REJECTED'].includes(multiTurn.state())||multiTurn.context().length>=3;
  v3Stop.disabled=!enabled||!multiTurnEnabled||!multiTurnOpen();
}
async function autoReadQuestion(transcript){
  const question=transcript.trim().replace(/^(hey|hello|hi)\s+vaos[.,!?\s]*/i,'').trim();
  if(!question){
    autoStatus.textContent='VAOS ready. Ask a status question using Ask VAOS.';
    voice.speak('preview','READ-ONLY PREVIEW — NOT AN AI REPLY\nVAOS is ready to answer a status question. No model invoked. No action authorized.');
    return;
  }
  const abort=new AbortController();autoAbort=abort;
  autoStatus.textContent='Searching available runnable missions (read-only)...';
  try{
    const response=await fetch('/api/voice-discover?q='+encodeURIComponent(question),{
      method:'GET',credentials:'same-origin',cache:'no-store',signal:abort.signal
    });
    if(!response.ok)throw new Error('VOICE_LOOKUP_UNAVAILABLE');
    const data=(await response.json())?.data;
    if(data?.readOnly!==true||data?.actionAuthorized!==false
      ||data?.scope!=='RUNNABLE_MISSIONS_ONLY'||typeof data?.answer!=='string')throw Error('VOICE_LOOKUP_INVALID');
    if(autoAbort!==abort)return;
    autoAnswer.textContent=data.answer;
    autoStatus.textContent='Read-only lookup complete. Speaking results.';
    voice.speak('preview','READ-ONLY PREVIEW — NOT AN AI REPLY\n'+data.answer+'\nNo model invoked. No action authorized.');
  }catch(error){
    if(autoAbort===abort){
      autoStatus.textContent=error?.name==='AbortError'?'Voice lookup cancelled.':'Voice lookup unavailable. No status inferred.';
    }
  }finally{if(autoAbort===abort)autoAbort=null;}
}
autoAsk.addEventListener('click',()=>{
  if(!enabled||!voice.dictationAvailable)return;
  autoAbort?.abort();autoAbort=null;
  clearTimeout(autoRearmTimer);
  autoSession=true;
  voice.stopSpeaking();
  autoLookupActive=true;
  autoAnswer.textContent='';
  autoStatus.textContent='Listening for one status question. You may say Hey VAOS followed by your question.';
  if(!voice.startListening('voice-readonly-question',900)){
    autoLookupActive=false;autoStatus.textContent='Microphone busy or unavailable.';
  }
});
autoStop.addEventListener('click',()=>{
  autoSession=false;autoLookupActive=false;clearTimeout(autoRearmTimer);autoAbort?.abort();autoAbort=null;
  voice.stopListening();voice.stopSpeaking();
  autoStatus.textContent='Stopped. No business action performed.';
});

function speakResult(source,id) {
  if(!enabled)return;
  voice.speak(source,$(id)?.textContent?.trim());
}
startInstruction.addEventListener('click',()=>{
  if(enabled)voice.startListening('instruction',2000);
});
startFollowup.addEventListener('click',()=>{
  if(enabled)voice.startListening('conversation-text',900);
});
voiceRequestDictate.addEventListener('click',()=>{
  if(enabled)voice.startListening('voice-readonly-question',900);
});
voiceQuestion.addEventListener('input',()=>{
  // The last retrieved mission must not be presented as answering a new question.
  delete missionReadback.dataset.voiceReadback;
});
voiceReadMission.addEventListener('click',()=>{
  if(!enabled)return;
  if(!isReadOnlyMissionStatusQuestion(voiceQuestion.value)){
    status.textContent='Only status, evidence, progress and blocker questions are allowed. No request sent.';
    return;
  }
  const missionId=$('mission-id').value.trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(missionId)){
    status.textContent='Enter a valid existing mission ID in Mission evidence lookup. No request sent.';
    return;
  }
  // Explicit button click; the existing authenticated mission form performs only GET.
  delete missionReadback.dataset.voiceReadback;
  status.textContent='Reading existing mission snapshot via GET. Review its contents before speaking.';
  missionForm.requestSubmit();
});
v3Open.addEventListener('click',()=>{
  if(!enabled||!multiTurnEnabled||voice.isListening()||oneShotBusy())return;
  voice.stopSpeaking();
  audioDiagnostics.stopSpeech();
  v3Question.value='';
  v3Report.textContent='No V3 mission evidence retrieved.';
  if(!multiTurn.open($('mission-id').value.trim()))
    v3Status.textContent='Choose an existing valid mission ID below; no request sent.';
  updateButtons();
});
v4Open.addEventListener('click',()=>{
  if(!enabled||!aiFocusEnabled||voice.isListening()||oneShotBusy())return;
  voice.stopSpeaking();
  audioDiagnostics.stopSpeech();
  v3Question.value='';
  v3Report.textContent='No AI-assisted mission report retrieved.';
  if(!multiTurn.open($('mission-id').value.trim(),{ai:true}))
    v4Status.textContent='Select an existing mission ID. AI session not opened.';
  else v4Status.textContent='AI-assisted session ready. Click Ask next question (each question uses one daily model allowance).';
  updateButtons();
});
v3Ask.addEventListener('click',()=>{
  if(!enabled||!multiTurnEnabled||voice.isListening()||oneShotBusy())return;
  voice.stopSpeaking();
  audioDiagnostics.stopSpeech();
  if(!multiTurn.ask()){updateButtons();return;}
  v3Question.value='';
  if(!voice.startListening('voice-v3-question',900))multiTurn.cancel();
  updateButtons();
});
v3Stop.addEventListener('click',()=>{
  multiTurn.cancel();
  voice.stopListening();
  voice.stopSpeaking();
  v3Question.value='';
  v3Report.textContent='V3 session ended. Context erased from this tab.';
  updateButtons();
});
oneShotStart.addEventListener('click',()=>{
  if(!enabled||!oneShotEnabled||oneShotBusy()||voice.isListening())return;
  const missionId=$('mission-id').value.trim();
  voice.stopSpeaking();
  audioDiagnostics.stopSpeech();
  oneShotQuestion.value='';
  oneShotReport.textContent='No retrieved report yet.';
  if(!oneShot.begin(missionId)){
    oneShotStatus.textContent='Select a valid existing mission ID below. Nothing sent.';
    return;
  }
  if(!voice.startListening('voice-one-shot-question',900))oneShot.cancel();
  updateButtons();
});
oneShotStop.addEventListener('click',()=>{
  oneShot.cancel();
  voice.stopListening();
  voice.stopSpeaking();
  oneShotStatus.textContent='Voice stopped. No additional read or speech authorized.';
  updateButtons();
});
$('mission-id').addEventListener('input',()=>{
  if(oneShotBusy()){oneShot.cancel();voice.stopListening();}
  if(multiTurnOpen()){multiTurn.cancel();voice.stopListening();v3Question.value='';v3Report.textContent='Mission changed; V3 context cleared.';}
  voice.stopSpeaking();
  oneShotReport.textContent='Selection changed; previous spoken result is no longer current.';
  updateButtons();
});
stopMic.addEventListener('click',()=>voice.stopListening());
speakPreview.addEventListener('click',()=>speakResult('preview','report-preview'));
speakDraft.addEventListener('click',()=>speakResult('draft','founder-ai-response'));
stopAudio.addEventListener('click',()=>{voice.stopSpeaking();audioDiagnostics.stopSpeech();});
voiceShortTest.addEventListener('click',()=>{if(enabled){voice.stopSpeaking();audioDiagnostics.testShortSpeech();}});
voiceToneTest.addEventListener('click',()=>{if(enabled)audioDiagnostics.testTone();});
demoSpeak.addEventListener('click',()=>{if(enabled)voice.speak('preview',VOICE_AUDIO_TEST_MESSAGE);});
missionSpeak.addEventListener('click',()=>{
  if(!enabled)return;
  const id=$('mission-id').value.trim(),speech=missionReadback.dataset.voiceReadback;
  if(!speech||!id||!missionReadback.textContent.startsWith('Mission: '+id+'\n')){
    status.textContent='Read an existing mission snapshot first. No record created.';
    return;
  }
  voice.speak('preview',speech);
});
window.addEventListener('pagehide',()=>{autoSession=false;clearTimeout(autoRearmTimer);autoAbort?.abort();multiTurn.cancel();oneShot.cancel();voice.stopListening();voice.stopSpeaking();audioDiagnostics.stopSpeech();});

async function checkCapability() {
  try {
    const response=await fetch('/api/voice-capabilities',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('VOICE_GATE_UNAVAILABLE');
    const payload=(await response.json())?.data;
    enabled=payload?.enabled===true
      &&payload?.manualReviewRequired===true
      &&payload?.actionAuthorized===false
      &&payload?.agentDispatch===false
      &&payload?.automaticSubmission===false
      &&payload?.serverAudioEnabled===false;
    oneShotEnabled=enabled && payload?.oneShotEnabled===true
      &&payload?.oneShotMode==='FOUNDER_ONE_SHOT_READONLY_GET';
    multiTurnEnabled=oneShotEnabled && payload?.multiTurnEnabled===true
      &&payload?.multiTurnMode==='FOUNDER_MULTITURN_READONLY_GET';
    aiFocusEnabled=multiTurnEnabled && payload?.aiFocusEnabled===true
      &&payload?.aiFocusMode==='FOUNDER_AI_FOCUS_READONLY_V1';
    v4Status.textContent=aiFocusEnabled
      ?'Stage V4 model-assisted topic classification enabled; 3 daily AI requests maximum.'
      :'Stage V4 AI voice disabled until separately commissioned.';
    v3Status.textContent=multiTurnEnabled
      ?'Stage V3 ready. Select an existing mission and start a three-question session.'
      :'Stage V3 disabled until separately commissioned.';
    oneShotStatus.textContent=oneShotEnabled
      ?'Ready: select an existing mission, then press Ask VAOS once.'
      :'One-shot conversation disabled until separately commissioned.';
    status.textContent=enabled
      ?'Founder voice pilot ready. Press Start to dictate; no command is sent automatically.'
      :'Voice pilot disabled until separately qualified and enabled.';
    if(enabled&&!voice.dictationAvailable){
      status.textContent='Speech recognition unsupported in this browser. Use typed commands.';
    }
    updateButtons();
    if(enabled)updateDiagnostics();
  }catch{
    enabled=false;oneShotEnabled=false;multiTurnEnabled=false;aiFocusEnabled=false;oneShot.cancel();multiTurn.cancel();
    v4Status.textContent='Stage V4 AI unavailable; deterministic V3 remains separately gated.';
    v3Status.textContent='Stage V3 unavailable. No request sent.';
    oneShotStatus.textContent='One-shot capability unavailable. Nothing sent.';
    status.textContent='Voice qualification unavailable. Voice controls remain disabled.';
    updateButtons();
  }
}
checkCapability();
