/** Playback for verified, read-only VAOS answers.
 * Uses the previously audio-qualified native en-US voice (no forced voice
 * object) and reports errors rather than claiming queued audio was spoken.
 */
export function splitVoiceText(value,max=180){
 if(typeof value!=='string'||!value.trim()||value.length>5000)return [];
 const parts=[];let rest=value.replace(/\s+/g,' ').trim();
 while(rest.length>max){
  const i=rest.lastIndexOf(' ',max);
  const cut=i<Math.floor(max/2)?max:i;
  parts.push(rest.slice(0,cut).trim());
  rest=rest.slice(cut).trim();
 }
 if(rest)parts.push(rest);
 return parts.slice(0,24);
}
export function createVoiceReadback({
 synthesis,UtteranceClass,language=()=> 'en-US',
 onState=()=>{},onError=()=>{},onFinished=()=>{},
 schedule=(fn,delay)=>setTimeout(fn,delay),clear=id=>clearTimeout(id),
}={}){
 let active=null,generation=0;
 const ready=()=>typeof synthesis?.speak==='function'&&typeof synthesis?.cancel==='function'&&typeof UtteranceClass==='function';
 function clearTimer(st){if(st?.timer!=null){clear(st.timer);st.timer=null;}}
 function cancel(){
  generation++;const previous=active;active=null;clearTimer(previous);
  if(previous)try{synthesis?.cancel()}catch{}
 }
 function conclude(st,event,code){
  if(active!==st)return;
  active=null;generation++;clearTimer(st);
  if(event==='ERROR'){try{synthesis?.cancel()}catch{};onError(code||'SPEECH_ERROR');}
  onState(event);onFinished(event);
 }
 function speak(text){
  cancel();
  if(!ready()){onError('SPEECH_UNAVAILABLE');return false;}
  const chunks=splitVoiceText(text);
  if(!chunks.length){onError('SPEECH_TEXT_INVALID');return false;}
  const st={chunks,index:0,started:false,timer:null};
  active=st;
  function next(){
   if(active!==st)return;
   if(st.index>=st.chunks.length){conclude(st,'FINISHED');return;}
   const index=st.index;
   let utterance;
   try{
    utterance=new UtteranceClass(st.chunks[index]);
    utterance.lang=['en-US','en-IN','ta-IN','ml-IN','hi-IN'].includes(language())?language():'en-US';utterance.rate=1; // Chromium native voice is more reliable than en-IN on some Windows installs.
    utterance.onstart=()=>{
     if(active!==st)return;
     st.started=true;clearTimer(st);onState('SPEAKING');
    };
    utterance.onend=()=>{
     if(active!==st)return;
     clearTimer(st);st.index++;st.started=false;next();
    };
    utterance.onerror=()=>{
     if(active!==st)return;
     conclude(st,'ERROR','SPEECH_ERROR');
    };
    st.timer=schedule(()=>{
     if(active!==st||st.started)return;
     conclude(st,'ERROR','SPEECH_NOT_STARTED');
    },5000);
    synthesis.speak(utterance);
    onState('QUEUED');
   }catch{
    conclude(st,'ERROR','SPEECH_UNAVAILABLE');
   }
  }
  next();return active===st;
 }
 return Object.freeze({speak,cancel,active:()=>active!==null});
}
