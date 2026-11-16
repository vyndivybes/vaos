import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSpeech } from './text-to-speech.mjs';

const pcm = Buffer.from([0x21,0x05,0x4a,0x80]);
const now = () => Date.UTC(2026, 10, 16);
function fixture({ characters = 0, count = 0, audio = pcm.toString('base64'), mime = 'audio/L16;codec=pcm;rate=24000', compete = false, providerStatus = 200 } = {}) {
  let previous = characters || count ? { day: '2026-11-16', characters, requests: count } : null;
  const requests = [];
  const env = {
    VAOS_FEATURE_FLAGS: '{"VAOS_GOOGLE_TTS_CONTROL":"founder-gemini-free-v1"}',
    VAOS_GEMINI_FREE_TTS_API_KEY: 'AQ.test-fixture.key-with-32-chars',
    VAOS_ARTIFACTS: {
      get: async () => previous && { etag: 'test-etag', json: async () => previous },
      put: async (_key, value, options) => {
        assert.deepEqual(options.onlyIf, previous ? { etagMatches: 'test-etag' } : { etagDoesNotMatch: '*' });
        if (compete) return null;
        previous = JSON.parse(value);
        return { etag: 'next-etag' };
      },
    },
  };
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent');
    assert.equal(init.headers['x-goog-api-key'], env.VAOS_GEMINI_FREE_TTS_API_KEY);
    assert.equal(init.redirect, 'manual');
    assert.ok(previous, 'usage must be reserved before synthesis');
    return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:mime,data:audio}}]}}]}, {status:providerStatus});
  };
  return { env, fetcher, now, requests, ledger: () => previous };
}

test('Gemini sends one bounded Charon synthesis request and wraps PCM for browser playback', async () => {
  const f = fixture();
  const text = 'JARVIS is online. Ready for your next question.';
  const bytes = await createGoogleSpeech({ ...f, text, language: 'en-IN' });
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WAVE');
  assert.equal(bytes.readUInt32LE(24),24000);
  assert.deepEqual(bytes.subarray(44),pcm);
  assert.equal(f.ledger().characters,text.length);
  assert.equal(f.ledger().requests,1);
  const body=JSON.parse(f.requests[0].init.body);
  assert.deepEqual(body.generationConfig.responseModalities,['AUDIO']);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Charon');
  assert.ok(body.contents[0].parts[0].text.endsWith(JSON.stringify(text)));
});

test('disabled, cancelled or invalid requests cannot reach Google', async () => {
  const f = fixture();
  await assert.rejects(createGoogleSpeech({ ...f, env: {}, text: 'JARVIS' }), /GOOGLE_TTS_NOT_CONFIGURED/);
  await assert.rejects(createGoogleSpeech({ ...f, language: 'ta-IN', text: 'JARVIS' }), /GOOGLE_TTS_LANGUAGE_UNAVAILABLE/);
  await assert.rejects(createGoogleSpeech({ ...f, text: ' ' }), /GOOGLE_TTS_TEXT_INVALID/);
  await assert.rejects(createGoogleSpeech({ ...f, text: 'JARVIS', signal:AbortSignal.abort() }), /GOOGLE_TTS_CANCELLED/);
  assert.equal(f.requests.length, 0);
});

test('character, request and conditional reservation limits refuse the provider request', async () => {
  for (const [params, error] of [[{characters:998},/GOOGLE_TTS_DAILY_LIMIT/],[{count:12},/GOOGLE_TTS_DAILY_LIMIT/],[{compete:true},/GOOGLE_TTS_BUSY/]]) {
    const f = fixture(params);
    await assert.rejects(createGoogleSpeech({ ...f, text: 'JARVIS' }), error);
    assert.equal(f.requests.length, 0);
  }
});

test('provider throttling and unexpected audio are rejected without retry or refund', async () => {
  for(const [params,error] of [[{providerStatus:429},/GOOGLE_TTS_PROVIDER_LIMIT/],[{mime:'audio/mp3'},/GOOGLE_TTS_AUDIO_INVALID/]]){
    const f=fixture(params);
    await assert.rejects(createGoogleSpeech({...f,text:'JARVIS'}),error);
    assert.equal(f.ledger().characters,6);
    assert.equal(f.requests.length,1);
  }
});
