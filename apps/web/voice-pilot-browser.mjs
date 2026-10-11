import {appendVoiceTranscript,VOICE_AUDIO_TEST_MESSAGE,isReadOnlyMissionStatusQuestion} from './lib/voice-pilot.mjs';
import {createVoicePilotController} from './lib/voice-pilot-controller.mjs';
import {createVoiceAudioDiagnostics} from './voice-audio-diagnostics.mjs';
import {createOneShotVoiceConversation} from './lib/voice-one-shot.mjs';

const $ = id => document.getElementById(id);
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
const buttons=[startInstruction,startFollowup,stopMic,speakPreview,speakDraft,stopAudio,demoSpeak,missionSpeak,voiceShortTest,voiceToneTest,voiceRequestDictate,voiceReadMission,oneShotStart,oneShotStop];
buttons.forEach(button=>{button.disabled=true;});
let enabled=false;
let oneShotEnabled=false;

const voice=createVoicePilotController({
  RecognitionClass:window.SpeechRecognition||window.webkitSpeechRecognition,
  SpeechSynthesisUtteranceClass:window.SpeechSynthesisUtterance,
  speechSynthesis:window.speechSynthesis,
  onStatus:message=>{status.textContent=message;},
  onListeningChanged:()=>{
    updateButtons();
    if(!voice.isListening() && oneShot?.state()==='LISTENING')oneShot.cancel();
  },
  onSpeakingChanged:updateButtons,
  onTranscript:(targetId,transcript,maxLength)=>{
    if(!enabled)return;
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
  startInstruction.disabled=!enabled||!voice.dictationAvailable||voice.isListening()||oneShotBusy();
  startFollowup.disabled=!enabled||!voice.dictationAvailable||voice.isListening()||oneShotBusy();
  stopMic.disabled=!enabled||!voice.isListening();
  speakPreview.disabled=!enabled||!voice.speechAvailable;
  speakDraft.disabled=!enabled||!voice.speechAvailable;
  stopAudio.disabled=!enabled||!voice.speechAvailable;
  demoSpeak.disabled=!enabled||!voice.speechAvailable;
  voiceShortTest.disabled=!enabled||!audioDiagnostics.speechAvailable;
  voiceToneTest.disabled=!enabled||!(window.AudioContext||window.webkitAudioContext);
  missionSpeak.disabled=!enabled||!voice.speechAvailable;
  voiceRequestDictate.disabled=!enabled||!voice.dictationAvailable||voice.isListening()||oneShotBusy();
  voiceReadMission.disabled=!enabled||oneShotBusy();
  oneShotStart.disabled=!enabled||!oneShotEnabled||!voice.dictationAvailable||!voice.speechAvailable||voice.isListening()||oneShotBusy();
  oneShotStop.disabled=!enabled||!oneShotEnabled||!(oneShotBusy()||oneShot.state()==='SPOKEN_QUEUED');
}
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
window.addEventListener('pagehide',()=>{oneShot.cancel();voice.stopListening();voice.stopSpeaking();audioDiagnostics.stopSpeech();});

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
    enabled=false;oneShotEnabled=false;oneShot.cancel();
    oneShotStatus.textContent='One-shot capability unavailable. Nothing sent.';
    status.textContent='Voice qualification unavailable. Voice controls remain disabled.';
    updateButtons();
  }
}
checkCapability();
