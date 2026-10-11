// Browser voice adapter for the governed, read-only founder conversation.
// Voice is an input/output modality ONLY: it never invokes agent tools,
// submits business effects, grants approval, or auto-sends a message.
const failTranscript=()=>{throw new Error('VOICE_TRANSCRIPT_INVALID');};
const failReply=()=>{throw new Error('VOICE_REPLY_NOT_READONLY');};
const CONTROL=/[\x00-\x1f\x7f]/;

export function prepareVoiceTranscript(value) {
  if(typeof value!=='string'||CONTROL.test(value))return failTranscript();
  const text=value.trim().replace(/\s+/g,' ');
  if(text.length<5||text.length>900)return failTranscript();
  return text;
}

export function prepareSpeakableFounderDraft(draft) {
  if(!draft||typeof draft!=='object'||Array.isArray(draft)
    ||draft.status!=='AI_DRAFT_UNVERIFIED'||draft.actionAuthorized!==false
    ||typeof draft.content!=='string'||CONTROL.test(draft.content)
    ||draft.content.trim().length<10||draft.content.length>1200)return failReply();
  return 'Unverified AI draft. '+draft.content.trim()+'. No business action authorized.';
}

export function createFounderVoiceController({
  RecognitionClass,
  synthesis,
  SpeechSynthesisUtteranceClass,
  onTranscript=()=>{},
  onListeningChanged=()=>{},
  onSpeakingChanged=()=>{},
  onStatus=()=>{},
}={}) {
  const dictationAvailable=typeof RecognitionClass==='function';
  const speechAvailable=typeof synthesis?.speak==='function'
    &&typeof synthesis?.cancel==='function'
    &&typeof SpeechSynthesisUtteranceClass==='function';
  let recognition=null;
  let utterance=null;

  function resetListening(current) {
    if(current!==recognition)return;
    recognition=null;
    onListeningChanged(false);
  }
  function stopDictation() {
    const current=recognition;
    if(!current)return;
    resetListening(current);
    try{current.stop();}catch{}
    onStatus('Microphone stopped. Review the transcript before manually submitting.');
  }
  function startDictation() {
    if(!dictationAvailable){onStatus('Browser speech recognition is unavailable. Type your request instead.');return false;}
    if(recognition)return false;
    let current;
    try{
      current=new RecognitionClass();
      current.lang='en-IN';
      current.continuous=false;
      current.interimResults=false;
      current.maxAlternatives=1;
      current.onresult=(event)=>{
        if(current!==recognition)return;
        try{
          const transcript=prepareVoiceTranscript(event?.results?.[0]?.[0]?.transcript);
          onTranscript(transcript);
          onStatus('Transcript ready. Review it, then use the existing read-only submission button.');
        }catch{onStatus('No valid transcript captured. Nothing submitted.');}
      };
      current.onerror=()=>{
        if(current!==recognition)return;
        resetListening(current);
        onStatus('Microphone or recognition unavailable. Nothing submitted.');
      };
      current.onend=()=>{
        resetListening(current);
      };
      recognition=current;
      current.start();
      onListeningChanged(true);
      onStatus('Listening for one English (India) utterance. No message will be sent automatically.');
      return true;
    }catch{
      recognition=null;
      onListeningChanged(false);
      onStatus('Microphone could not start. Nothing submitted.');
      return false;
    }
  }
  function stopSpeaking(){
    utterance=null;
    if(speechAvailable){try{synthesis.cancel();}catch{}}
    onSpeakingChanged(false);
  }
  function speakDraft(draft){
    let text;
    try{text=prepareSpeakableFounderDraft(draft);}
    catch{onStatus('Only recorded, unverified read-only AI drafts can be spoken.');return false;}
    if(!speechAvailable){onStatus('Browser speech playback unavailable. Read the transcript instead.');return false;}
    stopSpeaking();
    try{
      const current=new SpeechSynthesisUtteranceClass(text);
      current.lang='en-IN';
      current.rate=1;
      current.onstart=()=>{if(current===utterance)onSpeakingChanged(true);};
      current.onend=()=>{if(current===utterance){utterance=null;onSpeakingChanged(false);}};
      current.onerror=()=>{if(current===utterance){utterance=null;onSpeakingChanged(false);onStatus('Audio playback failed. Use the text transcript.');}};
      utterance=current;
      synthesis.speak(current);
      return true;
    }catch{
      utterance=null;onSpeakingChanged(false);
      onStatus('Audio playback could not start. Use the text transcript.');
      return false;
    }
  }
  return Object.freeze({
    dictationAvailable,speechAvailable,
    startDictation,stopDictation,speakDraft,stopSpeaking,
    isListening:()=>recognition!==null,
  });
}
