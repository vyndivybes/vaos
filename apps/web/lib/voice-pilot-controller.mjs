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
  let playback=null;

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
    if(!['instruction','conversation-text','voice-readonly-question'].includes(targetId) ||
      (targetId==='instruction'&&maxLength!==2000) ||
      (targetId!=='instruction'&&maxLength!==900))return false;
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
    const wasActive=utterance!==null||playback!==null||
      speechSynthesis?.speaking===true||speechSynthesis?.pending===true;
    playback=null;
    utterance=null;
    if(wasActive&&speechAvailable)try{speechSynthesis.cancel();}catch{}
    onSpeakingChanged(false);
  }
  // Keep utterances short: several Chromium/browser voices fail silently on long text.
  // Preserve the full grounded disclaimer; never synthesize unverified free-form text.
  function splitSpeech(text,max=180){
    const result=[];
    let rest=text.replace(/\s+/g,' ').trim();
    while(rest.length>max){
      let cut=rest.lastIndexOf(' ',max);
      if(cut<max/2)cut=max;
      result.push(rest.slice(0,cut).trim());
      rest=rest.slice(cut).trim();
    }
    if(rest)result.push(rest);
    return result;
  }
  function speak(source,rawText) {
    let content;
    try{content=selectSpokenReadback(source,rawText);}
    catch{onStatus('No eligible read-only result to speak.');return false;}
    if(!speechAvailable){onStatus('Browser speech playback unavailable.');return false;}
    if(utterance||playback||speechSynthesis.speaking===true||speechSynthesis.pending===true){
      stopSpeaking();
    }
    // Match the independently audible short-speech test: let Chromium resolve
    // its native en-US speech voice. Explicit voice objects can select a silent
    // engine on devices that advertise dozens of language packs.
    const playbackLang='en-US';
    const state={chunks:splitSpeech(content),index:0};
    playback=state;
    function playNext(){
      if(playback!==state)return;
      if(state.index>=state.chunks.length){
        utterance=null;playback=null;onSpeakingChanged(false);
        onStatus('Speech playback finished.');
        return;
      }
      try{
        const current=new SpeechSynthesisUtteranceClass(state.chunks[state.index]);
        current.lang=playbackLang;
        current.rate=1;
        current.onstart=()=>{
          if(playback!==state||utterance!==current)return;
          onSpeakingChanged(true);
          onStatus('Speech playback started, segment '+(state.index+1)+' of '+state.chunks.length+'.');
        };
        current.onend=()=>{
          if(playback!==state||utterance!==current)return;
          state.index++;
          utterance=null;
          playNext();
        };
        current.onerror=event=>{
          if(playback!==state||utterance!==current)return;
          playback=null;utterance=null;
          onSpeakingChanged(false);
          const code=typeof event?.error==='string'&&/^[a-z-]{1,50}$/.test(event.error)
            ?event.error:'unknown';
          onStatus('Speech playback error: '+code+' (segment '+(state.index+1)+'). Check browser voices.');
        };
        utterance=current;
        speechSynthesis.speak(current);
      }catch{
        utterance=null;playback=null;onSpeakingChanged(false);
        onStatus('Speech playback could not start. Check browser voice and output device.');
      }
    }
    playNext();
    if(playback!==state)return false;
    // Do not overwrite a synchronous onstart event with an unverified queued state.
    onStatus('Speech queued in '+state.chunks.length+' short segments.');
    return true;
  }
  return Object.freeze({
    dictationAvailable,speechAvailable,
    startListening,stopListening,speak,stopSpeaking,
    isListening:()=>recognition!==null,
  });
}
