import test from 'node:test';
import assert from 'node:assert/strict';
import {videoTemporalEvidence} from './video-sense.mjs';
import {createGuidedVisualConversation} from './guided-visual-conversation.mjs';

test('temporal evidence exposes every unsampled gap and client-declared timing',()=>{
 const evidence=videoTemporalEvidence({durationSeconds:10,frames:[{timeSeconds:.1},{timeSeconds:.2},{timeSeconds:9}]});
 assert.deepEqual(evidence.sampleTimesSeconds,[.1,.2,9]);
 assert.deepEqual(evidence.unsampledIntervals,[{from:0,to:.1},{from:.1,to:.2},{from:.2,to:9},{from:9,to:10}]);
 assert.equal(evidence.largestGapSeconds,8.8);
 assert.equal(evidence.continuousMotionEstablished,false);
 assert.equal(evidence.timestampAuthority,'CLIENT_DECLARED_NOT_VIDEO_VERIFIED');
});

test('continuing voice stops after 12 answers without rearming or extra capture',async()=>{
 let listens=0,stops=0;
 const guided=createGuidedVisualConversation({isVisible:()=>true,isCameraActive:()=>true,shouldContinue:()=>true,
  dictation:{start:()=>{listens++;return true},stop(){}},readback:{speak:()=>true,cancel(){}},
  submitQuestion:async()=>({spokenText:'A sampled view.'}),onSessionEnd:()=>stops++});
 guided.start();
 for(let i=0;i<12;i++){assert.equal(await guided.onTranscript('What is visible?'),true);guided.onPlaybackFinished('FINISHED');}
 assert.equal(listens,12);assert.equal(guided.active(),false);assert.equal(stops,1);
 assert.equal(await guided.onTranscript('Another question'),false);
});

test('voice session expiry stops pending capture and ignores late answers',async()=>{
 let deadline,finish,ended=0,spoken=0;
 const guided=createGuidedVisualConversation({isVisible:()=>true,isCameraActive:()=>true,
  schedule:fn=>{deadline=fn;return 1},clear:()=>{},onSessionEnd:()=>ended++,
  dictation:{start:()=>true,stop(){}},readback:{speak:()=>{spoken++;return true},cancel(){}},
  submitQuestion:()=>new Promise(r=>finish=r)});
 guided.start();const pending=guided.onTranscript('What is visible?');deadline();finish({spokenText:'late'});
 assert.equal(await pending,false);assert.equal(ended,1);assert.equal(spoken,0);
});
