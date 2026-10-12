import test from 'node:test';import assert from 'node:assert/strict';
import {getMicrophoneReadiness,probeMicrophonePermission} from './microphone-diagnostics.mjs';
test('microphone readiness explains browser support, voice policy, session and permission instead of silently disabling mic',()=>{
 const base={capability:'enabled',recognitionAvailable:true,secureContext:true,permission:'prompt'};
 assert.deepEqual(getMicrophoneReadiness(base).code,'READY');
 assert.equal(getMicrophoneReadiness({...base,recognitionAvailable:false}).code,'SPEECH_UNAVAILABLE');
 assert.equal(getMicrophoneReadiness({...base,capability:'disabled'}).code,'VOICE_CONTROL_DISABLED');
 assert.equal(getMicrophoneReadiness({...base,capability:'unauthenticated'}).code,'SESSION_REQUIRED');
 assert.equal(getMicrophoneReadiness({...base,secureContext:false}).code,'INSECURE_CONTEXT');
 assert.equal(getMicrophoneReadiness({...base,permission:'denied'}).code,'PERMISSION_DENIED');
 assert.equal(getMicrophoneReadiness({...base,capability:'unavailable'}).code,'CAPABILITY_UNAVAILABLE');
});
test('ready state never bypasses signed server qualification for microphone access',()=>{
 const report=getMicrophoneReadiness({capability:'disabled',recognitionAvailable:true,secureContext:true,permission:'granted'});
 assert.equal(report.mayListen,false);
 assert.equal(report.canProbe,false);
 assert.match(report.message,/VAOS voice access/i);
});
test('a user-triggered permission probe releases all tracks immediately and never uploads or stores audio',async()=>{
 let reads=0,stops=0;
 const media={async getUserMedia(constraints){reads++;assert.deepEqual(constraints,{audio:true,video:false});
  return {getTracks:()=>[{stop(){stops++}},{stop(){stops++}}]};}};
 const result=await probeMicrophonePermission({mediaDevices:media});
 assert.equal(result,'granted');
 assert.equal(reads,1);
 assert.equal(stops,2);
});
test('probe reports denied or unsupported hardware without producing an unhandled error',async()=>{
 assert.equal(await probeMicrophonePermission({mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('blocked'),{name:'NotAllowedError'})}}}),'denied');
 assert.equal(await probeMicrophonePermission({mediaDevices:null}),'unsupported');
 assert.equal(await probeMicrophonePermission({mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('missing'),{name:'NotFoundError'})}}}),'no-device');
});
