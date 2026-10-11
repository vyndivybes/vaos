import {appendVoiceTranscript} from './lib/voice-pilot.mjs';
import {createVoicePilotController} from './lib/voice-pilot-controller.mjs';

const $ = id => document.getElementById(id);
const status = $('voice-pilot-status');
const startInstruction = $('voice-instruction-start');
const startFollowup = $('voice-followup-start');
const stopMic = $('voice-microphone-stop');
const speakPreview = $('voice-preview-speak');
const speakDraft = $('voice-draft-speak');
const stopAudio = $('voice-audio-stop');
const buttons=[startInstruction,startFollowup,stopMic,speakPreview,speakDraft,stopAudio];
buttons.forEach(button=>{button.disabled=true;});
let enabled=false;

const voice=createVoicePilotController({
  RecognitionClass:window.SpeechRecognition||window.webkitSpeechRecognition,
  SpeechSynthesisUtteranceClass:window.SpeechSynthesisUtterance,
  speechSynthesis:window.speechSynthesis,
  onStatus:message=>{status.textContent=message;},
  onListeningChanged:updateButtons,
  onSpeakingChanged:updateButtons,
  onTranscript:(targetId,transcript,maxLength)=>{
    if(!enabled)return;
    const target=$(targetId);
    if(!target)return;
    // Only mutate an editable draft; never send or execute a request.
    target.value=appendVoiceTranscript(target.value,transcript,maxLength);
    target.dispatchEvent(new Event('input',{bubbles:true}));
  },
});

function updateButtons() {
  startInstruction.disabled=!enabled||!voice.dictationAvailable||voice.isListening();
  startFollowup.disabled=!enabled||!voice.dictationAvailable||voice.isListening();
  stopMic.disabled=!enabled||!voice.isListening();
  speakPreview.disabled=!enabled||!voice.speechAvailable;
  speakDraft.disabled=!enabled||!voice.speechAvailable;
  stopAudio.disabled=!enabled||!voice.speechAvailable;
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
stopMic.addEventListener('click',()=>voice.stopListening());
speakPreview.addEventListener('click',()=>speakResult('preview','report-preview'));
speakDraft.addEventListener('click',()=>speakResult('draft','founder-ai-response'));
stopAudio.addEventListener('click',()=>voice.stopSpeaking());
window.addEventListener('pagehide',()=>{voice.stopListening();voice.stopSpeaking();});

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
    status.textContent=enabled
      ?'Founder voice pilot ready. Press Start to dictate; no command is sent automatically.'
      :'Voice pilot disabled until separately qualified and enabled.';
    if(enabled&&!voice.dictationAvailable){
      status.textContent='Speech recognition unsupported in this browser. Use typed commands.';
    }
    updateButtons();
  }catch{
    enabled=false;
    status.textContent='Voice qualification unavailable. Voice controls remain disabled.';
    updateButtons();
  }
}
checkCapability();
