import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedVisualConversation} from './guided-visual-conversation.mjs';

test('guided visual turn requires consented visible camera, then accepts one bounded transcript',async()=>{
 const calls=[],speeches=[],statuses=[];
 let camera=false,visible=true,listenCount=0;
 const guided=createGuidedVisualConversation({
  isCameraActive:()=>camera,isVisible:()=>visible,
  dictation:{start:()=>{listenCount++;return true},stop(){}},
  readback:{speak:text=>{speeches.push(text);return true},cancel(){}},
  submitQuestion:async(q)=>{calls.push(q);return{spokenText:'I see a bicycle wheel.'}},
  shouldContinue:()=>false,onStatus:x=>statuses.push(x)
 });
 assert.equal(guided.start(),false);
 assert.equal(listenCount,0);
 camera=true;visible=false;assert.equal(guided.start(),false);
 visible=true;assert.equal(guided.start(),true);
 assert.equal(listenCount,1);
 assert.equal(calls.length,0,'recognition setup is not an automatic model request');
 assert.equal(await guided.onTranscript('What do you see?'),true);
 assert.deepEqual(calls,['What do you see?']);
 assert.deepEqual(speeches,['I see a bicycle wheel.']);
 assert.equal(listenCount,1,'microphone must remain off during playback');
 guided.onPlaybackFinished('FINISHED');
 assert.equal(guided.active(),false);
 assert.equal(listenCount,1,'one-shot mode does not re-arm microphone');
});

test('opt-in continuing mode listens again only after spoken reply finishes',async()=>{
 let listens=0;const output=[];
 const guided=createGuidedVisualConversation({
  isCameraActive:()=>true,isVisible:()=>true,
  dictation:{start:()=>{listens++;return true},stop(){}},
  readback:{speak:value=>{output.push(value);return true},cancel(){}},
  submitQuestion:async()=>({spokenText:'Frame is unclear.'}),
  shouldContinue:()=>true
 });
 assert.equal(guided.start(),true);
 await guided.onTranscript('What is visible?');
 assert.equal(listens,1);
 guided.onPlaybackFinished('FINISHED');
 assert.equal(listens,2);
 assert.equal(guided.active(),true);
 await guided.onTranscript('Is there text?');
 assert.equal(output.length,2);
 guided.stop();
 guided.onPlaybackFinished('FINISHED');
 assert.equal(listens,2,'stop must prevent deferred microphone restart');
});

test('manual stop cancels outstanding inference and drops delayed response',async()=>{
 let complete=null,signal=null;
 const spoken=[];let stopCount=0,cancelCount=0;
 const guided=createGuidedVisualConversation({
  isCameraActive:()=>true,isVisible:()=>true,
  dictation:{start:()=>true,stop:()=>{stopCount++}},
  readback:{speak:t=>{spoken.push(t);return true},cancel:()=>{cancelCount++}},
  submitQuestion:(_q,opts)=>{signal=opts.signal;return new Promise(resolve=>{complete=resolve;})}
 });
 guided.start();const task=guided.onTranscript('Is this image clear?');
 assert.equal(signal.aborted,false);
 guided.stop();
 assert.equal(signal.aborted,true);
 complete({spokenText:'Stale result must never play'});
 assert.equal(await task,false);
 assert.deepEqual(spoken,[]);
 assert.ok(stopCount>=1);assert.ok(cancelCount>=1);
});

test('declined snapshot and failed microphone never trigger background analysis',async()=>{
 let calls=0;
 const guided=createGuidedVisualConversation({
  isCameraActive:()=>true,isVisible:()=>true,
  dictation:{start:()=>false,stop(){}},
  readback:{speak:()=>true,cancel(){}},
  submitQuestion:()=>{calls++;return null}
 });
 assert.equal(guided.start(),false);
 assert.equal(guided.active(),false);
 assert.equal(calls,0);
 const other=createGuidedVisualConversation({
  isCameraActive:()=>true,isVisible:()=>true,
  dictation:{start:()=>true,stop(){}},
  readback:{speak:()=>true,cancel(){}},
  submitQuestion:async()=>{calls++;return null}
 });
 other.start();assert.equal(await other.onTranscript('Explain the picture'),false);
 assert.equal(other.active(),false);
 assert.equal(calls,1);
 assert.equal(await other.onTranscript('Do not submit again'),false);
 assert.equal(calls,1);
});

test('camera start controls offer automatic first spoken observation with a bounded AI frame budget',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../jarvis-multimodal.html',import.meta.url),'utf8');
 const ui=await readFile(new URL('../jarvis-multimodal.mjs',import.meta.url),'utf8');
 assert.match(html,/>Start JARVIS</);
 assert.match(html,/>Stop JARVIS</);
 assert.match(html,/up to 12 compressed camera frames/);
 assert.match(ui,/MAX_VISUAL_TURNS=12/);
 assert.match(ui,/framesInSession\+\+/);
 assert.match(ui,/guided\.onTranscript\('Describe what is visible/);
 assert.match(ui,/autoVisualSession=false/);
 assert.ok(ui.includes("document.visibilityState==='hidden'"));
});

test('guided camera conversation is discoverable and gated by explicit user controls',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../jarvis-multimodal.html',import.meta.url),'utf8');
 const ui=await readFile(new URL('../jarvis-multimodal.mjs',import.meta.url),'utf8');
 assert.ok(html.includes('id="guided-visual-start"'));
 assert.ok(html.includes('id="guided-visual-stop"'));
 assert.ok(html.includes('id="guided-visual-continue"'));
 assert.match(html,/confirm.*camera snapshot|approve.*camera snapshot|per-frame approval/i);
 assert.ok(ui.includes('createGuidedVisualConversation'));
 assert.ok(ui.includes("request('ANALYZE_IMAGE'"));
 assert.ok(ui.includes('if(document.visibilityState===\'hidden\')'));
 assert.match(ui,/pagehide/);
});
