import {appendVoiceTranscript, selectSpokenReadback} from './lib/voice-pilot.mjs';

const $ = (id) => document.getElementById(id);
const status = $('voice-pilot-status');
const startInstruction = $('voice-instruction-start');
const startFollowup = $('voice-followup-start');
const stopMic = $('voice-microphone-stop');
const speakPreview = $('voice-preview-speak');
const speakDraft = $('voice-draft-speak');
const stopAudio = $('voice-audio-stop');
const buttons = [startInstruction,startFollowup,stopMic,speakPreview,speakDraft,stopAudio];
buttons.forEach(button => {button.disabled = true;});
let recognition = null;
let enabled = false;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = typeof window.speechSynthesis !== 'undefined'
  && typeof window.SpeechSynthesisUtterance === 'function';

function updateButtons() {
  startInstruction.disabled = !enabled || !Recognition || recognition !== null;
  startFollowup.disabled = !enabled || !Recognition || recognition !== null;
  stopMic.disabled = !enabled || recognition === null;
  speakPreview.disabled = !enabled || !speechSupported;
  speakDraft.disabled = !enabled || !speechSupported;
  stopAudio.disabled = !enabled || !speechSupported;
}
function stopListening() {
  if (recognition) recognition.abort();
}
function startListening(targetId,limit) {
  if (!enabled || !Recognition || recognition) return;
  const target = $(targetId);
  const instance = new Recognition();
  instance.lang = 'en-IN';
  instance.interimResults = false;
  instance.continuous = false;
  instance.maxAlternatives = 1;
  recognition = instance;
  updateButtons();
  status.textContent = 'Listening. Audio may be processed by your browser vendor; stop at any time.';
  instance.onresult = event => {
    if (!event.results?.[0]?.isFinal) return;
    const text = event.results[0][0]?.transcript;
    try {
      target.value = appendVoiceTranscript(target.value,text,limit);
      target.dispatchEvent(new Event('input',{bubbles:true}));
      status.textContent = 'Transcript added as an editable draft. Review it and use the existing buttons to submit.';
    } catch {
      status.textContent = 'Transcript rejected. Edit the field manually; nothing was submitted.';
    }
    instance.stop();
  };
  instance.onerror = () => {status.textContent = 'Microphone or speech recognition failed. No instruction was submitted.';};
  instance.onend = () => {if (recognition === instance) recognition = null;updateButtons();};
  try {instance.start();} catch {recognition = null;updateButtons();status.textContent='Microphone start denied or unavailable.';}
}
function readAloud(source,sourceId) {
  if (!enabled || !speechSupported) return;
  try {
    const content=selectSpokenReadback(source,$(sourceId).textContent.trim());
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.lang = 'en-IN';
    utterance.rate = 1;
    utterance.onerror = () => {status.textContent = 'Speech playback failed. Read the on-screen result.';};
    window.speechSynthesis.speak(utterance);
    status.textContent = 'Speaking the displayed read-only result. No agent action was requested.';
  } catch {status.textContent='No eligible read-only result to speak. Generate a report first.';}
}
startInstruction.addEventListener('click',()=>startListening('instruction',2000));
startFollowup.addEventListener('click',()=>startListening('conversation-text',900));
stopMic.addEventListener('click',()=>{stopListening();status.textContent='Microphone stopped. Nothing submitted.';});
speakPreview.addEventListener('click',()=>readAloud('preview','report-preview'));
speakDraft.addEventListener('click',()=>readAloud('draft','founder-ai-response'));
stopAudio.addEventListener('click',()=>{window.speechSynthesis.cancel();status.textContent='Audio playback stopped.';});
window.addEventListener('pagehide',()=>{stopListening();if (speechSupported) window.speechSynthesis.cancel();});

async function checkCapability() {
  try {
    const response = await fetch('/api/voice-capabilities',{credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw new Error('VOICE_GATE_UNAVAILABLE');
    const payload = (await response.json())?.data;
    enabled = payload?.enabled===true && payload?.actionAuthorized===false
      && payload?.automaticSubmission===false && payload?.serverAudioEnabled===false;
    status.textContent = enabled
      ? 'Founder voice pilot ready. Press Start to dictate; no command is sent automatically.'
      : 'Voice pilot disabled until separately qualified and enabled.';
    if(enabled && !Recognition) status.textContent='Speech recognition unavailable in this browser. Use typed commands.';
    updateButtons();
  } catch {
    enabled=false;
    status.textContent='Voice qualification unavailable. Voice controls remain disabled.';
    updateButtons();
  }
}
checkCapability();
