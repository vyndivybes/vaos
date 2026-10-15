import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraSession,createQuestionDictation} from './live-sense.mjs';

test('live camera requires explicit start, captures only after a preview, and stops all tracks',async()=>{
 const tracks=[{stopped:false,stop(){this.stopped=true;}},{stopped:false,stop(){this.stopped=true;}}];
 const media={calls:0,async getUserMedia(constraints){
  this.calls++;
  assert.equal(constraints.audio,false);
  return {getVideoTracks:()=>[tracks[0]],getTracks:()=>tracks};
 }};
 const video={readyState:2,videoWidth:1280,videoHeight:720,srcObject:null,async play(){this.played=true;},pause(){this.paused=true;}};
 const canvas={width:0,height:0,getContext(){return{drawImage(){}}},toDataURL(){return'data:image/jpeg;base64,'+'A'.repeat(400)}};
 const camera=createCameraSession({mediaDevices:media,video,createCanvas:()=>canvas});
 assert.equal(media.calls,0,'never open the webcam on initial render');
 assert.throws(()=>camera.capture(),/CAMERA_NOT_ACTIVE/);
 assert.equal(await camera.start(),true);
 assert.equal(media.calls,1);
 assert.equal(video.srcObject.getTracks().length,2);
 const image=camera.capture();
 assert.ok(image.startsWith('data:image/jpeg;base64,'));
 assert.ok(canvas.width<=760);
 camera.stop();
 assert.ok(tracks.every(t=>t.stopped));
 assert.equal(video.srcObject,null);
 assert.throws(()=>camera.capture(),/CAMERA_NOT_ACTIVE/);
});

test('camera start discarded on visibility loss before permission resolves',async()=>{
 let allow;const tracks=[{stopped:false,stop(){this.stopped=true;}}];
 const media={getUserMedia:()=>new Promise(resolve=>{allow=resolve;})};
 const video={srcObject:null,async play(){}};
 const camera=createCameraSession({mediaDevices:media,video,createCanvas:()=>({})});
 const pending=camera.start();camera.stop();
 allow({getVideoTracks:()=>tracks,getTracks:()=>tracks});
 assert.equal(await pending,false);
 assert.equal(tracks[0].stopped,true);
 assert.equal(video.srcObject,null);
});

test('camera rejects unsupported browser or absent pixels without uploading',async()=>{
 const camera=createCameraSession({mediaDevices:null,video:{srcObject:null},createCanvas:()=>({})});
 await assert.rejects(()=>camera.start(),/CAMERA_UNAVAILABLE/);
 assert.throws(()=>camera.capture(),/CAMERA_NOT_ACTIVE/);
});

test('question dictation is one-shot, opt-in, never dispatches an API request and can be stopped',()=>{
 let latest;const transcripts=[];
 class Recognizer{
  constructor(){latest=this;}
  start(){this.started=true;}
  abort(){this.aborted=true;}
  stop(){this.stopped=true;}
 }
 const speech=createQuestionDictation({RecognitionClass:Recognizer,onText:value=>transcripts.push(value)});
 assert.equal(latest,undefined);
 assert.equal(speech.start(),true);
 assert.equal(latest.started,true);
 latest.onresult({results:[{isFinal:true,0:{transcript:'What can you see on my desk?'}}]});
 assert.deepEqual(transcripts,['What can you see on my desk?']);
 assert.equal(latest.stopped,true);
 assert.equal(speech.active(),false);
 speech.start();const next=latest;
 speech.stop();assert.equal(next.aborted,true);
 next.onresult?.({results:[{isFinal:true,0:{transcript:'This must not be accepted'}}]});
 assert.equal(transcripts.length,1);
});

test('source-intelligence UI offers explicit camera, microphone and speech controls; does not claim continuous video',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../jarvis-multimodal.html',import.meta.url),'utf8');
 const ui=await readFile(new URL('../jarvis-multimodal.mjs',import.meta.url),'utf8');
 for(const id of ['camera-start','camera-stop','camera-capture','camera-preview','dictate-question','speak-result','stop-result-speech'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(ui,/createCameraSession/);
 assert.match(ui,/createQuestionDictation/);
 assert.ok(ui.includes("request('ANALYZE_IMAGE'"));
 assert.match(ui,/visibilitychange/);
 assert.match(ui,/pagehide/);
 assert.match(html,/one selected camera frame/i);
 assert.ok(html.includes('.live-camera[hidden]{display:none}'),'hide local camera when stopped');
 assert.doesNotMatch(ui,/\bgetDisplayMedia\s*\(/,'no covert screen capture');
});
