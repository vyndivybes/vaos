// One truthful, opt-in acknowledgement for a verified speech-originated read.
// It never sends business commands, starts listening, or claims completion.
const CUES=Object.freeze({
 HEARD:'I heard your question.',
 WAKE_READY:'Yes, Sir. I am listening.',
 SOURCE_REQUESTED:'Certainly, Sir. I am checking the available records.'
});
export function voiceAcknowledgementText(phase){
 return Object.hasOwn(CUES,phase)?CUES[phase]:'';
}
export function createVoiceAcknowledgement({
 synthesis,UtteranceClass,outputBusy=()=>false,onError=()=>{},onFinished=()=>{},
 schedule=(fn,delay)=>setTimeout(fn,delay),clear=id=>clearTimeout(id)
}={}){
 let active=null;
 function clearActive(state){if(state?.timer!=null){clear(state.timer);state.timer=null;}}
 const supported=()=>typeof synthesis?.speak==='function'&&
  typeof synthesis?.cancel==='function'&&typeof UtteranceClass==='function';
 function cancel(){
  if(!active)return false;
  const state=active;active=null;clearActive(state);
  try{synthesis.cancel()}catch{}
  return true;
 }
 function finish(state,reason){
  if(active!==state)return;
  active=null;clearActive(state);
  if(reason!=='SPEECH_FINISHED'){
   try{synthesis.cancel()}catch{}
   onError(reason);
  }
  onFinished(state.phase,reason);
 }
 function announce(phase,{enabled=false}={}){
  const phrase=voiceAcknowledgementText(phase);
  if(!enabled||!phrase||!supported()||outputBusy())return false;
  cancel();
  try{
   const speech=new UtteranceClass(phrase);
   speech.lang='en-US';
   speech.rate=1;
   const state={speech,phase,timer:null,started:false};
   speech.onstart=()=>{
    if(active!==state)return;
    state.started=true;clearActive(state);
    state.timer=schedule(()=>finish(state,'ACK_AUDIO_STALLED'),6500);
   };
   speech.onend=()=>finish(state,'SPEECH_FINISHED');
   speech.onerror=()=>finish(state,'ACK_AUDIO_UNAVAILABLE');
   active=state;
   state.timer=schedule(()=>finish(state,'ACK_AUDIO_NOT_STARTED'),3800);
   synthesis.speak(speech);
   return true;
  }catch{
   active=null;onError('ACK_AUDIO_UNAVAILABLE');
   return false;
  }
 }
 return Object.freeze({announce,cancel,active:()=>active!==null});
}
