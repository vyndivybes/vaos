// Controlled browser-only speech adapter. Adapted from PR #172's cancellation guards.
// NO auto-submit, approval, business write, or agent dispatch is present.
import {appendVoiceTranscript,selectSpokenReadback} from './voice-pilot.mjs';

export function createVoicePilotController({
  RecognitionClass,
  speechSynthesis,
  SpeechSynthesisUtteranceClass,
  onTranscript=()=>{},
  onStatus=()=>{},
  onListeningChanged=()=>{},
  onSpeakingChanged=()=>{},
}={}) {
  const dictationAvailable=typeof RecognitionClass==='function';
  const speechAvailable=typeof speechSynthesis?.speak==='function' &&
    typeof speechSynthesis?.cancel==='function' &&
    typeof SpeechSynthesisUtteranceClass==='function';
  let recognition=null;
  let utterance=null;

  function resetListening(current) {
    if(current!==recognition)return;
    recognition=null;
    onListeningChanged(false);
  }
  function stopListening() {
    const current=recognition;
    if(!current)return;
    // Disarm before abort: late result/end/error callbacks MUST NOT mutate a draft.
    resetListening(current);
    try {
      if(typeof current.abort==='function')current.abort();
      else current.stop?.();
    } catch {}
    onStatus('Microphone stopped. No request submitted.');
  }
  function startListening(targetId,maxLength) {
    if(!['instruction','conversation-text'].includes(targetId) ||
      (targetId==='instruction'&&maxLength!==2000) ||
      (targetId==='conversation-text'&&maxLength!==900))return false;
    if(!dictationAvailable || recognition)return false;
    let current;
    try {
      current=new RecognitionClass();
      current.lang='en-IN';
      current.continuous=false;
      current.interimResults=false;
      current.maxAlternatives=1;
      current.onresult=(event)=>{
        if(current!==recognition || event?.results?.[0]?.isFinal!==true)return;
        try {
          const value=appendVoiceTranscript('',event.results[0][0]?.transcript,maxLength);
          onTranscript(targetId,value,maxLength);
          onStatus('Transcript added to an editable draft. Review before manual submission.');
        }catch{
          onStatus('Transcript rejected. Nothing submitted.');
        }
        resetListening(current);
        try{current.stop?.();}catch{}
      };
      current.onerror=()=>{
        if(current!==recognition)return;
        resetListening(current);
        onStatus('Microphone or recognition unavailable. Nothing submitted.');
      };
      current.onend=()=>resetListening(current);
      recognition=current;
      current.start();
      onListeningChanged(true);
      onStatus('Listening to one utterance. Audio may be processed by the browser vendor.');
      return true;
    }catch{
      recognition=null;
      onListeningChanged(false);
      onStatus('Microphone could not start. Nothing submitted.');
      return false;
    }
  }
  function stopSpeaking() {
    utterance=null;
    if(speechAvailable)try{speechSynthesis.cancel();}catch{}
    onSpeakingChanged(false);
  }
  function speak(source,rawText) {
    let content;
    try {content=selectSpokenReadback(source,rawText);}
    catch {onStatus('No eligible read-only result to speak.');return false;}
    if(!speechAvailable){onStatus('Browser speech playback unavailable.');return false;}
    stopSpeaking();
    try {
      const current=new SpeechSynthesisUtteranceClass(content);
      current.lang='en-IN';current.rate=1;
      current.onstart=()=>{if(current===utterance)onSpeakingChanged(true);};
      current.onend=()=>{if(current===utterance){utterance=null;onSpeakingChanged(false);}};
      current.onerror=()=>{if(current===utterance){utterance=null;onSpeakingChanged(false);onStatus('Playback failed. Read the report.');}};
      utterance=current;
      speechSynthesis.speak(current);
      return true;
    }catch{
      utterance=null;onSpeakingChanged(false);
      onStatus('Playback could not start. Read the report.');
      return false;
    }
  }
  return Object.freeze({
    dictationAvailable,speechAvailable,
    startListening,stopListening,speak,stopSpeaking,
    isListening:()=>recognition!==null,
  });
}
