// Stage V3: deterministic, short-lived, per-tab read-only voice context.
// No LLM call, persistent transcript, POST, approval or agent dispatch.
// A separate future AI classifier must have its own budget and qualification.
import {formatMissionSnapshotSpokenPreview,isReadOnlyMissionStatusQuestion} from './voice-pilot.mjs';

const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
const MAX_TURNS=3;
const TTL_MS=300000;
function focus(question){
 const q=question.toLowerCase();
 if(/\bblock(?:ers?|ed|ing)\b/.test(q))return 'blockers';
 if(/\bevidence\b|\bproof\b/.test(q))return 'evidence';
 if(/\bprogress\b|\bcompleted\b|\bverification\b/.test(q))return 'progress';
 return 'status';
}
function focusedReport(record,id,topics,turn,aiAssisted=false){
 const topic=topics[0];
 const raw=formatMissionSnapshotSpokenPreview(record,id);
 const line=topic==='evidence'
   ?'Question focus: evidence. This status snapshot provides work-package state counts, not independent proof of engineering validation.'
   :'Question focus: '+topic+'.';
 const prefix='READ-ONLY PREVIEW — NOT AN AI REPLY\n';
 const full=aiAssisted
  ?'AI-ASSISTED READ-ONLY PREVIEW — NOT AGENT EVIDENCE\n'+
   'Spoken turn '+turn+' of '+MAX_TURNS+'. Model-selected topics: '+topics.join(', ')+'.\n'+
   raw.slice(prefix.length).replace('No model invoked. No action authorized.',
    'Model classified topics only. No business action authorized.')
  :prefix+'Spoken turn '+turn+' of '+MAX_TURNS+'.\n'+line+'\n'+raw.slice(prefix.length);
 if(full.length>3200)throw Error('VOICE_V3_REPORT_TOO_LONG');
 return full;
}
export function createVoiceMultiTurnSession({fetchSnapshot,speak,classifyFocus,onReport=()=>{},onState=()=>{},now=()=>Date.now(),timeoutMs=15000}={}) {
 if(typeof fetchSnapshot!=='function'||typeof speak!=='function'||typeof now!=='function')
   throw Error('VOICE_V3_CALLBACKS_REQUIRED');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('VOICE_V3_TIMEOUT_INVALID');
 let session=null,active=null,phase='IDLE',nonce=0;
 // Race cancellation even when a provider ignores AbortSignal. Always remove
 // the listener and timer; the existing nonce guard discards late completions.
 async function bounded(job,operation){
   const signal=job.controller.signal;
   let timer,onAbort;
   const stopped=new Promise((_,reject)=>{
     onAbort=()=>reject(Error('VOICE_V3_CANCELLED'));
     signal.addEventListener('abort',onAbort,{once:true});
     timer=setTimeout(()=>job.controller.abort(),timeoutMs);
   });
   try{
     if(signal.aborted)throw Error('VOICE_V3_CANCELLED');
     return await Promise.race([operation(),stopped]);
   }finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
 }
 function set(next,msg){phase=next;onState(next,msg);}
 function expired(){
   if(!session)return false;
   if(now()-session.startedAt>TTL_MS){
     if(active)active.controller.abort();
     active=null;session=null;++nonce;
     set('EXPIRED','Session expired after five minutes. Select the mission and start again.');
     return true;
   }
   return false;
 }
 function open(missionId,{ai=false}={}){
   if(session||active||typeof missionId!=='string'||!ID.test(missionId)||typeof ai!=='boolean'||(ai&&typeof classifyFocus!=='function'))return false;
   session={missionId,startedAt:now(),turns:[],ai};
   set('READY','Session ready: up to three read-only spoken questions within five minutes.');
   return true;
 }
 function ask(){
   if(!session||active||expired()||session.turns.length>=MAX_TURNS
      ||!['READY','SPOKEN_QUEUED','REJECTED'].includes(phase))return false;
   active={controller:new AbortController(),session,token:++nonce,state:'LISTENING'};
   set('LISTENING','Listening once. No persistent transcript is stored.');
   return true;
 }
 async function accept(transcript){
   const job=active;
   if(!job||job.state!=='LISTENING'||expired())return false;
   if(!isReadOnlyMissionStatusQuestion(transcript)){
     active=null;
     set('REJECTED','Only read-only mission status, blockers, progress or evidence questions are accepted.');
     return false;
   }
   const topic=focus(transcript);
   job.state='READING';
   set('READING','Reading one fresh authenticated mission snapshot.');
   try{
     const record=await bounded(job,()=>fetchSnapshot(job.session.missionId,{signal:job.controller.signal}));
     if(active!==job||job.token!==nonce||expired()||job.controller.signal.aborted)return false;
     // Validate the current authoritative snapshot BEFORE spending model quota.
     formatMissionSnapshotSpokenPreview(record,job.session.missionId);
     let topics=[topic];
     if(job.session.ai){
       const prior=job.session.turns.slice(-2).map(item=>item.topic);
       const picked=await bounded(job,()=>classifyFocus(transcript,prior,{signal:job.controller.signal}));
       if(active!==job||job.token!==nonce||expired()||job.controller.signal.aborted)return false;
       const ALLOWED=new Set(['status','verification','blockers','evidence','closure']);
       if(!picked||picked.modelInvoked!==true||picked.actionAuthorized!==false
          ||!Array.isArray(picked.topics)||picked.topics.length<1||picked.topics.length>5
          ||picked.topics.some(t=>!ALLOWED.has(t))||new Set(picked.topics).size!==picked.topics.length)
         throw Error('VOICE_AI_FOCUS_REJECTED');
       topics=picked.topics;
     }
     const report=focusedReport(record,job.session.missionId,topics,job.session.turns.length+1,job.session.ai);
     if(active!==job||job.controller.signal.aborted)return false;
     onReport(report);
     const queued=speak(job.session.ai?'ai-preview':'preview',report);
     if(active!==job||job.controller.signal.aborted)return false;
     active=null;
     if(!queued){set('FAILED','Voice audio could not be queued; no successful spoken turn was recorded.');return false;}
     // Only a bounded topic is held in memory; no raw transcript or model output.
     job.session.turns.push(Object.freeze({sequence:job.session.turns.length+1,topic:job.session.ai?topics[0]:topic}));
     set('SPOKEN_QUEUED','Turn '+job.session.turns.length+'/'+MAX_TURNS+' queued for speech. Confirm sound on your device.');
     return true;
   }catch{
     if(active!==job||job.token!==nonce)return false;
     active=null;
     set('FAILED','Fresh mission read or verification failed. No reply was authorized.');
     return false;
   }
 }
 function cancel(){
   if(!session&&!active)return false;
   if(active)active.controller.abort();
   active=null;session=null;++nonce;
   set('IDLE','Multi-turn voice session stopped; all in-memory context cleared.');
   return true;
 }
 return Object.freeze({open,ask,accept,cancel,state:()=>phase,context:()=>Object.freeze(session?.turns.map(t=>({...t}))||[])});
}
