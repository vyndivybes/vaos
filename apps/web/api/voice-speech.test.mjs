import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceSpeechHandler} from './voice-speech.mjs';
import {invokeCloudflareHandler} from '../lib/cloudflare-adapter.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const request=()=>({method:'POST',url:'https://vaos.example/api/voice-speech',headers:{origin:'https://vaos.example','content-type':'application/json'},body:{speechProcessingAccepted:true,text:'Fixture',language:'en-US'},env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1'}});
test('Cloudflare voice endpoint requires authenticated founder, qualified voice, same origin and bounded JSON',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-speech'],'function');let calls=0;
 for(const {session,change,status} of [{session:null,status:401},{session:{email:'other'},status:403},{change:r=>r.env={},status:403},{change:r=>r.headers.origin='https://evil.example',status:403},{change:r=>delete r.body.speechProcessingAccepted,status:403},{change:r=>r.body.voiceId='attacker-voice',status:422},{change:r=>r.body.text='x'.repeat(601),status:422}]){
  const r=request();change?.(r);const h=createVoiceSpeechHandler({getSession:()=>session===undefined?{email:'shyamsundhar1982@gmail.com'}:session,synthesize:async()=>{calls++;}});assert.equal((await h(r)).status,status);
 }assert.equal(calls,0);
});
test('authenticated proxy preserves audio bytes and Cloudflare voice provenance, while status contains no key',async()=>{
 const bytes=new Uint8Array([73,68,51,...Array(60).fill(0)]);
 const handler=createVoiceSpeechHandler({getSession:()=>({email:'shyamsundhar1982@gmail.com'}),synthesize:async()=>bytes});
 const response=await invokeCloudflareHandler(handler,new Request('https://vaos.example/api/voice-speech',{method:'POST',headers:{Origin:'https://vaos.example','Content-Type':'application/json'},body:JSON.stringify(request().body)}),request().env);
 assert.equal(response.status,200);assert.equal(response.headers.get('X-VAOS-Voice-Provider'),'cloudflare-aura');assert.equal(response.headers.get('X-VAOS-Voice-Profile'),'aura-1-orpheus');assert.equal(response.headers.get('Content-Type'),'audio/mpeg');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 const r=request();r.method='GET';r.env.VAOS_GEMINI_FREE_TTS_API_KEY='fixture-secret';
 const status=await handler(r),text=await status.text();
 assert.ok(!text.includes('fixture-secret'));assert.equal(JSON.parse(text).data.ready,false);
});
