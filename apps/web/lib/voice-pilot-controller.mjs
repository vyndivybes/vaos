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
    // Chromium can drop speech when an idle synthesis engine receives cancel()
    // immediately followed by speak(). Only cancel previously queued audio.
    if(utterance!==null || speechSynthesis.speaking===true || speechSynthesis.pending===true){
      stopSpeaking();
    }
    try {
      const current=new SpeechSynthesisUtteranceClass(content);
      const voices=typeof speechSynthesis.getVoices==='function'
        ?speechSynthesis.getVoices():[];
      if(Array.isArray(voices) && voices.length>0) {
        const chosen=voices.find(v=>String(v.lang).toLowerCase()==='en-in')
          ||voices.find(v=>String(v.lang).toLowerCase().startsWith('en-'))
          ||voices.find(v=>String(v.lang).toLowerCase()==='en')
          ||voices.find(v=>v.default===true)
          ||voices[0];
        current.voice=chosen;
        current.lang=chosen.lang;
      }
      // When no installed voice is enumerated, do not force en-IN: let
      // the browser choose its native default, which may not be en-IN.
      current.rate=1;
      current.onstart=()=>{
        if(current!==utterance)return;
        onSpeakingChanged(true);
        onStatus('Speech playback started. Check your speakers.');
      };
      current.onend=()=>{
        if(current!==utterance)return;
        utterance=null;
        onSpeakingChanged(false);
        onStatus('Speech playback finished.');
      };
      current.onerror=(event)=>{
        if(current!==utterance)return;
        utterance=null;
        onSpeakingChanged(false);
        const code=typeof event?.error==='string'&&/^[a-z-]{1,50}$/.test(event.error)
          ?event.error:'unknown';
        onStatus('Speech playback error: '+code+'. Check browser voice, speaker volume, output device and tab mute.');
      };
      utterance=current;
      speechSynthesis.speak(current);
      onStatus('Speech queued. Waiting for the browser audio engine to start.');
      return true;
    }catch{
      utterance=null;
      onSpeakingChanged(false);
      onStatus('Speech playback could not start. Check browser voice and output device.');
      return false;
    }
  }
  return Object.freeze({
    dictationAvailable,speechAvailable,
    startListening,stopListening,speak,stopSpeaking,
    isListening:()=>recognition!==null,
  });
}
