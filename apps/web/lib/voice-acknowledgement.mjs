// One truthful, opt-in acknowledgement for a verified speech-originated read.
// It never sends business commands, starts listening, or claims completion.
const CUES=Object.freeze({
 HEARD:'I heard your question.',
 SOURCE_REQUESTED:'I heard you. I am checking the available records.'
});
export function voiceAcknowledgementText(phase){
 return Object.hasOwn(CUES,phase)?CUES[phase]:'';
}
export function createVoiceAcknowledgement({
 synthesis,UtteranceClass,outputBusy=()=>false,onError=()=>{}
}={}){
 let active=null;
 const supported=()=>typeof synthesis?.speak==='function'&&
  typeof synthesis?.cancel==='function'&&typeof UtteranceClass==='function';
 function cancel(){
  if(!active)return false;
  active=null;
  try{synthesis.cancel()}catch{}
  return true;
 }
 function announce(phase,{enabled=false}={}){
  const phrase=voiceAcknowledgementText(phase);
  if(!enabled||!phrase||!supported()||outputBusy())return false;
  cancel();
  try{
   const speech=new UtteranceClass(phrase);
   speech.lang='en-US';
   speech.rate=1;
   speech.onend=()=>{if(active===speech)active=null;};
   speech.onerror=()=>{if(active===speech){active=null;onError('ACK_AUDIO_UNAVAILABLE');}};
   active=speech;
   synthesis.speak(speech);
   return true;
  }catch{
   active=null;onError('ACK_AUDIO_UNAVAILABLE');
   return false;
  }
 }
 return Object.freeze({announce,cancel,active:()=>active!==null});
}
