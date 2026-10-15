/** Browser-only opt-in wake listener. No recording/upload by this module.
 * SpeechRecognition may send audio to the browser vendor. No activation
 * without founder voice qualification and explicit in-page user gesture.
 */
const WAKE=/^(?:hey[ ,.!?]+)?(?:jarvis|vaos|v[ .-]?a[ .-]?o[ .-]?s|vay[ .-]?os|vay[ .-]?us)(?=$|[ ,.!?:-])/i;
const COMMAND_CONFIRM=/^(?:confirm|yes confirm|confirm question)[.! ]*$/i;
const COMMAND_CANCEL=/^(?:cancel|stop|never mind|no cancel)[.! ]*$/i;
const initial=()=>({mode:'WAKE',pending:null});
export function extractFinalTranscript(event){
 const results=event?.results;
 if(!results||!Number.isInteger(results.length)||results.length<1)return null;
 for(let i=results.length-1;i>=0;i--){
  const item=results[i];if(item?.isFinal!==true)continue;
  const transcript=item[0]?.transcript;
  if(typeof transcript==='string'&&transcript.trim())return transcript.trim();
 }
 return null;
}

export function parseWakePhrase(value){
 const text=typeof value==='string'?value.trim():'';
 const match=text.match(WAKE);
 if(!match)return {wake:false,question:''};
 return {wake:true,question:text.slice(match[0].length).replace(/^[ ,.!?:-]+/,'').trim()};
}
export function advanceWakeTurn(input,utterance,validateQuestion=()=>true,{acceptDirectQuestion=()=>false}={}){
 const state=input?.mode?input:initial();
 const text=typeof utterance==='string'?utterance.trim():'';
 if(COMMAND_CANCEL.test(text))return {event:'CANCELLED',state:initial()};
 const wake=parseWakePhrase(text);
 // User explicitly opted into hands-free listening; only supported business
 // questions are accepted without a wake phrase. Ambient speech is ignored.
 if(state.mode==='WAKE'&&!wake.wake&&!acceptDirectQuestion(text))
  return {event:'IGNORED',state};
 const question=state.mode==='QUESTION'
  ?(wake.wake?wake.question:text)
  :wake.wake?wake.question:text;
 if(!question)return {event:'PROMPT',state:{mode:'QUESTION',pending:null}};
 if(question.length<5||question.length>300||!validateQuestion(question))
  return {event:'REJECTED',state:initial()};
 // A deliberate wake phrase is consent for ONE read-only lookup after opt-in.
 // Write commands are separately rejected by validateQuestion and the API.
 return {event:'SUBMIT',question,state:initial()};
}
export function createWakeListener({
 RecognitionClass,isVisible=()=>true,validateQuestion=()=>true,acceptDirectQuestion=()=>false,
 onStatus=()=>{},onDraft=()=>{},onConfirm=()=>{},onChange=()=>{},onHeard=()=>{},onPrompt=()=>{},
 schedule=(fn,delay)=>setTimeout(fn,delay),clear=id=>clearTimeout(id),
 clock=()=>Date.now(),configureRecognition=()=>{},onInterim=()=>{},onActivity=()=>{},
}={}){
 let enabled=false,paused=false,current=null,turn=initial(),generation=0,timer=null,restart=null;
 let starts=[],transientFailures=0;
 const tell=s=>{onStatus(s);onChange({enabled,paused,mode:turn.mode,active:!!current});};
 function clearTimers(){if(timer!==null)clear(timer);if(restart!==null)clear(restart);timer=null;restart=null;}
 function abortCurrent(){
  const r=current;current=null;
  if(r)try{r.abort?.()}catch{}
 }
 function disable(reason='Hey VAOS is off. Microphone stopped.'){
  enabled=false;paused=false;generation++;turn=initial();clearTimers();abortCurrent();
  tell(reason);
 }
 function expire(g){
  if(!enabled||paused||generation!==g)return;
  turn=initial();tell('Question window expired. Ask a business question or say Hey VAOS again.');
 }
 function armExpiry(){if(timer!==null)clear(timer);const g=generation;timer=schedule(()=>{timer=null;expire(g);},16000);}
 function listen(){
  if(!enabled||paused||current||!isVisible())return;
  const now=clock();
  starts=starts.filter(t=>now-t<60000);
  if(starts.length>=70){disable('Hands-free listening paused after repeated microphone restarts. Enable it again to retry.');return;}
  starts.push(now);
  let next;try{next=new RecognitionClass();}catch{disable('Microphone recognition is unavailable in this browser.');return;}
  current=next;
  next.lang='en-IN';next.continuous=false;next.interimResults=true;next.maxAlternatives=1;
  try{configureRecognition(next);}catch{disable('On-device wake recognition is unavailable. Use the microphone button or type your question.');return;}
  next.onspeechstart=()=>onActivity('SPEECH_START');
  next.onspeechend=()=>onActivity('SPEECH_END');
  const g=generation;
  next.onresult=event=>{
   if(current!==next||!enabled||paused||generation!==g||!isVisible())return;
   const transcript=extractFinalTranscript(event);
   if(!transcript){const rows=event?.results;let text='';if(rows)for(let i=0;i<rows.length;i++)if(rows[i]?.isFinal!==true)text+=rows[i]?.[0]?.transcript||'';if(text)onInterim(text.slice(0,300));return;}
   const result=advanceWakeTurn(turn,transcript,validateQuestion,{acceptDirectQuestion});
   onHeard(result.event);
   turn=result.state;
   if(result.event==='IGNORED'){
    tell('Speech recognized, but not a supported business question. Ask about sales, production or materials; “Hey VAOS” is optional in hands-free mode.');
    return;
   }
   if(result.event==='PROMPT'){
    tell('Hey JARVIS activated. Ask your read-only question.');
    onPrompt();
   }
   else if(result.event==='REJECTED'){tell('That request is not an allowed read-only question. Say Hey VAOS to try again.');}
   else if(result.event==='CANCELLED'){tell('Question cancelled. Listening for Hey VAOS.');}
   else if(result.event==='SUBMIT'){
    transientFailures=0;onDraft(result.question);
    tell('Business question recognized: '+result.question+'. Retrieving an authorized read-only answer.');
    // Pause BEFORE dispatch so only one GET is sent and VAOS does not
    // recognize its own reply as a new question.
    pause();
    onConfirm(result.question);
    return;
   }
   if(turn.mode!=='WAKE')armExpiry();
   else if(timer!==null){clear(timer);timer=null;}
  };
  next.onerror=e=>{
   if(current!==next||generation!==g||!enabled)return;
   const code=String(e?.error||'unknown');
   if(['not-allowed','service-not-allowed','audio-capture'].includes(code)){
    disable('Microphone permission denied, or no microphone found. Hey VAOS is off.');return;
   }
   if(code==='aborted')return;
   if(code!=='no-speech')transientFailures++;
   if(transientFailures>=3){disable('Voice recognition repeatedly failed. Hey VAOS is off.');return;}
   tell(code==='no-speech'?'Waiting for Hey VAOS. Browser recognition was silent.':'Voice recognition interrupted; retrying while this tab is active.');
  };
  next.onend=()=>{
   if(current!==next||generation!==g)return;
   current=null;
   onChange({enabled,paused,mode:turn.mode,active:false});
   if(!enabled||paused||!isVisible())return;
   restart=schedule(()=>{restart=null;listen();},550);
  };
  try{next.start();tell(turn.mode==='WAKE'?'Hands-free listening. Ask a business question directly, or say “Hey VAOS”.':'Listening for your question.');}
  catch{current=null;transientFailures++;if(transientFailures>=3)disable('Microphone cannot be restarted. Hey VAOS is off.');
   else restart=schedule(()=>{restart=null;listen();},1000);}
 }
 function enable(){
  if(enabled)return true;
  if(typeof RecognitionClass!=='function'){tell('Wake phrase unavailable: this browser has no speech recognition.');return false;}
  if(!isVisible()){tell('Bring the VAOS tab into view before enabling the microphone.');return false;}
  enabled=true;paused=false;generation++;transientFailures=0;starts=[];turn=initial();
  listen();return enabled;
 }
 function pause({preserveQuestion=false}={}){
  if(!enabled)return;
  paused=true;generation++;
  if(!preserveQuestion||turn.mode!=='QUESTION')turn=initial();
  clearTimers();abortCurrent();onChange({enabled,paused,mode:turn.mode,active:false});
 }
 function resume({preserveQuestion=false}={}){
  if(!enabled||!isVisible())return false;
  paused=false;generation++;
  if(!preserveQuestion||turn.mode!=='QUESTION')turn=initial();
  clearTimers();listen();
  if(turn.mode==='QUESTION')armExpiry();
  return true;
 }
 function onVisibilityChange(){if(!isVisible()&&enabled)disable('Hey VAOS stopped because the tab is not visible. Enable it again when you return.');}
 return {enable,disable,pause,resume,onVisibilityChange,isEnabled:()=>enabled,state:()=>({enabled,paused,mode:turn.mode,active:!!current})};
}
