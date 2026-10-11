// One-shot browser-only spoken status lookup. The caller must already pass the
// founder-only capability gate and provide an authenticated GET-only fetcher.
// This module cannot post, create a mission, or authorize an action.
import {formatMissionSnapshotSpokenPreview,isReadOnlyMissionStatusQuestion} from './voice-pilot.mjs';

const MISSION_ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
export function createOneShotVoiceConversation({fetchSnapshot,speak,onReport=()=>{},onState=()=>{}}={}) {
  if(typeof fetchSnapshot!=='function'||typeof speak!=='function')throw new Error('VOICE_READONLY_CALLBACKS_REQUIRED');
  let active=null;
  let state='IDLE';
  let serial=0;
  function report(next,msg) {state=next;onState(next,msg);}
  function begin(id) {
    if(active||!MISSION_ID.test(id||''))return false;
    active={id,serial:++serial,controller:new AbortController(),phase:'LISTENING'};
    report('LISTENING','Listening once. Speech may be processed by the browser vendor.');
    return true;
  }
  async function acceptTranscript(transcript) {
    const job=active;
    if(!job||job.phase!=='LISTENING')return false;
    if(!isReadOnlyMissionStatusQuestion(transcript)){
      active=null;
      report('REJECTED','Only read-only status, progress, evidence or blocker questions are supported. No lookup performed.');
      return false;
    }
    job.phase='READING';
    report('READING','Recognized read-only status question. Reading one existing mission with authenticated GET.');
    try{
      const snapshot=await fetchSnapshot(job.id,{signal:job.controller.signal});
      if(active!==job||serial!==job.serial||job.controller.signal.aborted)return false;
      const grounded=formatMissionSnapshotSpokenPreview(snapshot,job.id);
      if(active!==job||serial!==job.serial||job.controller.signal.aborted)return false;
      onReport(grounded);
      // A browser speech queue is NOT independent confirmation of audible sound.
      const queued=speak('preview',grounded);
      if(active!==job||serial!==job.serial||job.controller.signal.aborted)return false;
      active=null;
      if(!queued){
        report('FAILED','Speech playback was not queued. Read the displayed mission snapshot.');
        return false;
      }
      report('SPOKEN_QUEUED','One grounded report queued for browser speech. Confirm that audio is audible.');
      return true;
    }catch{
      if(active!==job||serial!==job.serial||job.controller.signal.aborted)return false;
      active=null;
      report('FAILED','Authenticated mission evidence was unavailable or invalid. No answer synthesized.');
      return false;
    }
  }
  function cancel(){
    if(!active)return false;
    const job=active;
    active=null;
    ++serial;
    job.controller.abort();
    report('IDLE','Voice conversation cancelled. No further report will be spoken.');
    return true;
  }
  return Object.freeze({begin,acceptTranscript,cancel,state:()=>state});
}
