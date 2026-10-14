/**
 * G6: short-lived, domain-only conversation context for Ask VAOS.
 * Never retains transcripts, prompts, source rows, answers or model state.
 * Every resolved follow-up is a NEW existing read-only GET with fresh evidence.
 * No new server route, persistence, agent dispatch or voice authorization.
 */
import {parseWakePhrase,extractFinalTranscript} from './hey-vaos.mjs';

const TTL_MS=300000;
const MAX_FOLLOWUPS=3;
const DOMAINS=new Set(['missions','engineering','inventory','procurement','production',
 'commercial','finance','people','maintenance','governance']);
const REJECT_CONTROL=/[;\n\r<>[\]{}\\]/;
const FOLLOWUP=/^(?:and(?:\s+what\s+about)?|what\s+about)\s+(.+?)\s*[?.!]*$/i;

const MISSION={
 blockers:'Which assigned missions remain unfinished and what blockers are recorded?',
 progress:'Which assigned missions remain unfinished, and why?',
 latest:'What happened in the latest completed departmental mission? Identify the saved evidence.',
 recovery:'If a departmental task is interrupted after saving its report, how is the result recovered?',
};
const ENGINEERING={
 material:'Has the proposed Toray carbon prepreg been validated for final production use?',
 validation:'What engineering validation remains before the carbon frameset can be released?',
 geometry:'Which VEDM bicycle geometry revision is currently authoritative?',
};
const INVENTORY={
 status:'What inventory information can you currently verify from VYNDI OS?',
 shortages:'Are there confirmed material shortages affecting the proposed bicycle builds?',
};
const PROCUREMENT={
 shortages:'Are there confirmed material shortages affecting the proposed bicycle builds?',
 status:'What material shortage information can you currently verify from VYNDI OS?',
};
const PRODUCTION={
 status:'What production job-card activity is currently recorded?',
};
const COMMERCIAL={
 status:'Are there actual customer orders, or only commercial plans?',
};
const FINANCE={
 status:"What financial records are available, and can you establish the company's cash position?",
};
const PEOPLE={
 status:'What HR or recruitment records exist, separate from the 16 AI employees?',
};
const LOOKUP=Object.freeze({
 missions:MISSION,engineering:ENGINEERING,inventory:INVENTORY,
 procurement:PROCUREMENT,production:PRODUCTION,commercial:COMMERCIAL,
 finance:FINANCE,people:PEOPLE,maintenance:PRODUCTION,governance:undefined,
});
function normalizedFocus(value){
 if(typeof value!=='string'||value.length<5||value.length>145||REJECT_CONTROL.test(value))return null;
 const m=value.match(FOLLOWUP);
 if(!m)return null;
 const phrase=m[1].trim().toLowerCase().replace(/^(?:its|their|the|that|those)\s+/,'').replace(/\s+/g,' ');
 if(!/^[a-z ]{4,60}$/.test(phrase))return null;
 if(['blocker','blockers','obstacle','obstacles'].includes(phrase))return 'blockers';
 if(['status','progress','current status','latest status','current progress'].includes(phrase))return 'progress';
 if(['latest result','last result','latest completed result','latest evidence','saved evidence'].includes(phrase))return 'latest';
 if(['recovery','restarting','interrupted task','interrupted tasks'].includes(phrase))return 'recovery';
 if(['material','material qualification','prepreg','toray','toray prepreg'].includes(phrase))return 'material';
 if(['validation','engineering validation','remaining validation','release','testing'].includes(phrase))return 'validation';
 if(['geometry','revision','geometry revision','authoritative revision'].includes(phrase))return 'geometry';
 if(['inventory','stock','stock status','inventory status','available stock','stock balance'].includes(phrase))return 'status';
 if(['shortage','shortages','material shortages'].includes(phrase))return 'shortages';
 if(['orders','customer orders','customers','pipeline','sales'].includes(phrase))return 'status';
 if(['finance','ledger','cash position','cash'].includes(phrase))return 'status';
 if(['hr','recruitment','personnel','workforce'].includes(phrase))return 'status';
 if(['production','job cards','production status'].includes(phrase))return 'status';
 return null;
}
export function createG6Conversation({now=()=>Date.now()}={}){
 if(typeof now!=='function')throw Error('G6_CLOCK_REQUIRED');
 let current=null;
 function active(){
  if(current&&(!Number.isFinite(now())||now()-current.since>TTL_MS||now()<current.since)){
   current=null;
  }
  return current;
 }
 function clear(){current=null;}
 function resolve(question){
  if(typeof question!=='string')return {question,usedContext:false};
  const c=active(),focus=normalizedFocus(question);
  const mapped=c&&c.turns<MAX_FOLLOWUPS&&focus?LOOKUP[c.domain]?.[focus]:null;
  return mapped?{question:mapped,usedContext:true}:{question,usedContext:false};
 }
 function remember(intent,status,{usedContext=false}={}){
  if(status!=='OBSERVED'||intent?.kind!=='INSIGHT'||!DOMAINS.has(intent.domain))return false;
  const previous=active();
  if(usedContext){
   if(!previous||previous.turns>=MAX_FOLLOWUPS)return false;
   // If a follow-up explicitly changes to another read-only source, it can
   // become the new referent but not an unlimited voice session.
   current={domain:intent.domain,since:previous.since,turns:previous.turns+1};
  }else{
   current={domain:intent.domain,since:now(),turns:0};
  }
  return true;
 }
 function snapshot(){
  const c=active();
  return Object.freeze({domain:c?.domain||null,remaining:c?MAX_FOLLOWUPS-c.turns:0,
   ttlMs:c?Math.max(0,TTL_MS-(now()-c.since)):0});
 }
 return Object.freeze({resolve,remember,clear,snapshot,canFollowUp:q=>resolve(q).usedContext});
}
/** Explicit on-device barge-in while browser audio is already speaking.
 * Never treat synthesized speech, background conversation or an effectful
 * request as consent to dispatch another question. No automatic approval.
 */
export function classifyG6Interruption(transcript,allowRead=()=>false){
 const value=typeof transcript==='string'?transcript.trim():'';
 if(!value||value.length>300||/[\x00-\x1f\x7f]/.test(value))return {kind:'IGNORE'};
 if(/^(?:stop|cancel|hey[ ,]+vaos[ ,]+(?:stop|cancel))[.! ]*$/i.test(value))return {kind:'STOP'};
 if(!/^hey[ ,]+vaos(?=[ ,.!?:-])/i.test(value))return {kind:'IGNORE'};
 const {wake,question}=parseWakePhrase(value);
 if(!wake||question.length<5||question.length>300||REJECT_CONTROL.test(question)||!allowRead(question))
  return {kind:'IGNORE'};
 return {kind:'QUESTION',question};
}


/**
 * G6 on-device interruption windows. While an already consented browser voice
 * reply is speaking, rearm a short local-only recognition window after each
 * timeout/normal completion. Maximum 10 windows x 12 seconds; never
 * silently enable an ambient/remote microphone or authorize business effects.
 * The UI handles STOP or a separately allowed explicit "Hey VAOS" question.
 */
export function createG6BargeInListener({
 RecognitionClass,getLocalLocale=()=>null,isSpeechActive=()=>false,
 isOptedIn=()=>false,allowQuestion=()=>false,onDecision=()=>{},onActivity=()=>{},
 schedule=(fn,delay)=>setTimeout(fn,delay),clear=id=>clearTimeout(id),
}={}){
 const MAX_WINDOWS=10;
 const WINDOW_MS=12000;
 const REARM_MS=250;
 const LOCAL_LOCALE=/^(?:en-(?:IN|US)|ta-IN|ml-IN|hi-IN)$/;
 let enabled=false,serial=0,windowCount=0,current=null,restart=null;
 function clearCurrent(){
  const job=current;current=null;
  if(!job)return;
  if(job.timer!=null)clear(job.timer);
  try{job.recognition.abort?.();}catch{}
 }
 function stop(){
  ++serial;enabled=false;
  if(restart!=null){clear(restart);restart=null;}
  clearCurrent();windowCount=0;
 }
 const eligible=()=>enabled&&isSpeechActive()&&isOptedIn()
   &&LOCAL_LOCALE.test(String(getLocalLocale()||''));
 function listen(run){
  if(!eligible()||run!==serial||windowCount>=MAX_WINDOWS){stop();return false;}
  if(typeof RecognitionClass!=='function'){stop();return false;}
  let recognition;
  try{
   recognition=new RecognitionClass();
   if(!('processLocally' in recognition)){stop();return false;}
   recognition.processLocally=true;
   recognition.lang=getLocalLocale();
   recognition.continuous=false;recognition.interimResults=false;
   recognition.maxAlternatives=1;
  }catch{stop();return false;}
  const job={recognition,timer:null};current=job;windowCount++;
  function retire(){
   if(current!==job||run!==serial)return;
   clearCurrent();
   if(!eligible()||windowCount>=MAX_WINDOWS){stop();return;}
   restart=schedule(()=>{
    restart=null;
    if(run!==serial||!eligible())return void stop();
    listen(run);
   },REARM_MS);
  }
  recognition.onresult=event=>{
   if(current!==job||run!==serial||!eligible())return;
   const result=classifyG6Interruption(extractFinalTranscript(event),allowQuestion);
   if(result.kind==='IGNORE')return;
   stop();
   onDecision(result);
  };
  recognition.onspeechstart=()=>{
   if(current===job&&run===serial)onActivity('SPEECH_START');
  };
  recognition.onspeechend=()=>{
   if(current===job&&run===serial)onActivity('SPEECH_END');
  };
  recognition.onend=()=>retire();
  recognition.onerror=event=>{
   if(current!==job)return;
   if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(String(event?.error||''))){
    stop();onActivity('LOCAL_UNAVAILABLE');return;
   }
   retire();
  };
  try{
   recognition.start();
   if(current===job)job.timer=schedule(retire,WINDOW_MS);
  }catch{stop();onActivity('LOCAL_UNAVAILABLE');return false;}
  return enabled;
 }
 function start(){
  if(enabled)return true;
  if(!isOptedIn()||!isSpeechActive()||typeof RecognitionClass!=='function'
     ||!LOCAL_LOCALE.test(String(getLocalLocale()||'')))return false;
  enabled=true;windowCount=0;
  return listen(++serial);
 }
 return Object.freeze({start,stop,isActive:()=>enabled});
}
