/** Playback for verified, read-only VAOS answers.
 * Uses the explicitly supplied playback adapter and reports actual audio
 * events rather than claiming queued audio was spoken.
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
 synthesis,UtteranceClass,language=()=> 'en-US',startTimeout=5000,
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
    utterance.lang=['en-US','en-IN','ta-IN','ml-IN','hi-IN'].includes(language())?language():'en-US';utterance.rate=1;
    utterance.onstart=()=>{
     if(active!==st)return;
     st.started=true;clearTimer(st);onState('SPEAKING');
    };
    utterance.onend=()=>{
     if(active!==st)return;
     clearTimer(st);st.index++;st.started=false;next();
    };
    utterance.onerror=event=>{
     if(active!==st)return;
     const allowed=new Set(['audio-busy','audio-hardware','network','synthesis-unavailable','synthesis-failed','language-unavailable','voice-unavailable','text-too-long','invalid-argument','not-allowed','canceled','interrupted']);
     const providerCode=typeof event?.code==='string'&&/^(?:ELEVENLABS|NEURAL)_[A-Z_]{4,55}$/.test(event.code)?event.code:null;
     const reason=providerCode||(allowed.has(event?.error)?'SPEECH_'+event.error.replaceAll('-','_').toUpperCase():'SPEECH_ERROR');
     conclude(st,'ERROR',reason);
    };
    st.timer=schedule(()=>{
     if(active!==st||st.started)return;
     conclude(st,'ERROR','SPEECH_NOT_STARTED');
    },startTimeout);
    synthesis.speak(utterance);
    if(active===st)onState('QUEUED');
   }catch{
    conclude(st,'ERROR','SPEECH_UNAVAILABLE');
   }
  }
  next();return active===st;
 }
 return Object.freeze({speak,cancel,active:()=>active!==null});
}
