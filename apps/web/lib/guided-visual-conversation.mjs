/**
 * JARVIS guided camera Q&A. One user-initiated speech question may request
 * one consented frame. No request starts during camera/voice setup; no
 * microphone listens during inference or synthesized speech. Continuation
 * is explicitly opt-in and always requires fresh per-frame consent.
 */
export function createGuidedVisualConversation({
 isVisible=()=>true,isCameraActive=()=>false,
 dictation,readback,submitQuestion,shouldContinue=()=>false,onStatus=()=>{},onCommand=()=>{}
}={}){
 if(typeof dictation?.start!=='function'||typeof dictation?.stop!=='function'||
    typeof readback?.speak!=='function'||typeof readback?.cancel!=='function'||
    typeof submitQuestion!=='function')throw Error('GUIDED_DEPENDENCIES_REQUIRED');
 let enabled=false,busy=false,epoch=0,pendingAbort=null,awaitingPlayback=false;
 function stop({silent=false}={}){
  epoch++;enabled=false;busy=false;awaitingPlayback=false;
  const previous=pendingAbort;pendingAbort=null;
  previous?.abort();
  dictation.stop();readback.cancel();
  if(!silent)onStatus('Visual conversation stopped. No background listening or camera submissions.');
 }
 function listen(){
  if(!enabled||busy||awaitingPlayback||!isVisible()||!isCameraActive())return false;
  const started=dictation.start();
  if(!started){stop({silent:true});onStatus('Speech recognition unavailable. You can still type and capture manually.');return false;}
  onStatus('JARVIS listening for one visual question. No image sent yet.');
  return true;
 }
 function start({listenImmediately=true}={}){
  if(enabled||busy||!isVisible()||!isCameraActive()){
   onStatus('Start a visible camera preview before guided voice conversation.');
   return false;
  }
  enabled=true;epoch++;return listenImmediately?listen():true;
 }
 async function onTranscript(question){
  if(!enabled||busy||awaitingPlayback)return false;
  const command=typeof question==='string'?question.trim().toLowerCase().replace(/[.!?]+$/,''):''; 
  if(/^(?:(?:hey )?jarvis[, ]+)?(?:stop listening|end conversation|stop conversation)$/.test(command)){
   stop({silent:true});onStatus('JARVIS stopped listening; camera preview may remain on.');onCommand('STOP_LISTENING');return true;
  }
  if(/^(?:(?:hey )?jarvis[, ]+)?(?:stop camera|turn off (?:the )?camera|camera off)$/.test(command)){
   stop({silent:true});onStatus('JARVIS camera session stopped by voice.');onCommand('STOP_CAMERA');return true;
  }
  if(typeof question!=='string'||question.trim().length<4||question.length>1000){
   stop();onStatus('Question rejected. Visual conversation stopped.');return false;
  }
  busy=true;dictation.stop();
  const turn=++epoch,abort=new AbortController();
  pendingAbort=abort;
  onStatus('Question received. Approval is required before sending one camera frame.');
  try{
   const response=await submitQuestion(question.trim(),{
    signal:abort.signal,
    isCurrent:()=>enabled&&epoch===turn&&!abort.signal.aborted&&isVisible()&&isCameraActive()
   });
   if(!enabled||epoch!==turn||abort.signal.aborted||!isVisible()||!isCameraActive())return false;
   if(!response||typeof response.spokenText!=='string'||!response.spokenText.trim()){
    stop({silent:true});onStatus('Snapshot cancelled or answer unavailable. Nothing further submitted.');return false;
   }
   pendingAbort=null;busy=false;awaitingPlayback=true;
   if(!readback.speak(response.spokenText.slice(0,3200))){
    stop({silent:true});onStatus('Speaker unavailable. Answer remains visible; voice session stopped.');
    return false;
   }
   return true;
  }catch(error){
   if(enabled&&epoch===turn&&!abort.signal.aborted){
    stop({silent:true});
    onStatus('Visual question failed; stopped without additional capture. '+String(error?.message||''));
   }
   return false;
  }finally{
   if(pendingAbort===abort)pendingAbort=null;
   if(epoch===turn)busy=false;
  }
 }
 function interruptSpeech(){
  if(!enabled||!awaitingPlayback||busy||!isVisible()||!isCameraActive())return false;
  // Invalidate pending playback callbacks before cancelling the synthesizer.
  awaitingPlayback=false;
  readback.cancel();
  onStatus('JARVIS interrupted. Listening for your next question.');
  return listen();
 }
 function onPlaybackFinished(state){
  if(!enabled||!awaitingPlayback)return false;
  awaitingPlayback=false;
  if(state!=='FINISHED'){stop({silent:true});onStatus('Playback stopped. Microphone will not restart.');return false;}
  if(!shouldContinue()){stop({silent:true});onStatus('Visual question answered. Camera preview remains local; start again for another question.');return true;}
  return listen();
 }
 return Object.freeze({start,stop,onTranscript,interruptSpeech,onPlaybackFinished,active:()=>enabled,busy:()=>busy});
}
