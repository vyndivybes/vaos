import { featureControl } from '../../apps/web/lib/feature-flags.mjs';

export const VOICE_PROFILE = 'aura-1-orpheus';
const MODEL = '@cf/deepgram/aura-1';
const BUDGET_KEY = 'voice/workers-aura/daily-budget-v1.json';
const DAILY_CHARACTERS = 6000;
const MAX_AUDIO = 2_000_000;

function fail(code, status = 503) {
  throw Object.assign(new Error(code), { status });
}

export function speechConfiguration(env) {
  const bucket = env?.VAOS_ARTIFACTS;
  const ready = featureControl(env, 'VAOS_AURA_VOICE_CONTROL') === 'founder-workers-free-v1'
    && typeof env?.AI?.run === 'function' && typeof bucket?.get === 'function' && typeof bucket?.put === 'function';
  return { ready, provider: 'cloudflare-aura', profile: VOICE_PROFILE, dailyCharacterLimit: DAILY_CHARACTERS };
}

async function reserve(bucket, characters, time) {
  const day = new Date(time).toISOString().slice(0, 10);
  const previous = await bucket.get(BUDGET_KEY);
  const state = previous ? await previous.json() : { day, used: 0 };
  if (typeof state?.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.day) || state.day > day
      || !Number.isSafeInteger(state.used) || state.used < 0) fail('VOICE_TTS_BUDGET_UNAVAILABLE');
  const used = state.day === day ? state.used : 0;
  if (used + characters > DAILY_CHARACTERS) fail('VOICE_TTS_DAILY_LIMIT', 429);
  const saved = await bucket.put(BUDGET_KEY, JSON.stringify({ day, used: used + characters }), {
    onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
  });
  if (!saved) fail('VOICE_TTS_BUSY', 429);
}

async function readAudio(stream, signal) {
  const reader = stream?.getReader?.();
  if (!reader) fail('VOICE_TTS_AUDIO_INVALID');
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_AUDIO) fail('VOICE_TTS_AUDIO_INVALID');
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
  }
  signal?.throwIfAborted();
  const audio = Buffer.concat(chunks, length);
  const isMp3 = audio.subarray(0, 3).toString('ascii') === 'ID3' || (audio[0] === 255 && (audio[1] & 224) === 224);
  if (audio.length < 44 || !isMp3) fail('VOICE_TTS_AUDIO_INVALID');
  return audio;
}

export async function createAuraSpeech({ env, text, language = 'en-US', signal, now = Date.now } = {}) {
  if (!speechConfiguration(env).ready) fail('VOICE_TTS_NOT_CONFIGURED');
  if (typeof text !== 'string' || !text.trim() || text.length > 600
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail('VOICE_TTS_TEXT_INVALID', 422);
  if (!['en', 'en-US', 'en-IN', 'en-GB'].includes(language)) fail('VOICE_TTS_LANGUAGE_UNAVAILABLE', 422);
  signal?.throwIfAborted();
  try { await reserve(env.VAOS_ARTIFACTS, text.length, now()); }
  catch (error) {
    if (/^VOICE_TTS_/.test(error?.message || '')) throw error;
    fail('VOICE_TTS_BUDGET_UNAVAILABLE');
  }
  signal?.throwIfAborted();
  try {
    const result = await env.AI.run(MODEL, { text, speaker: 'orpheus', encoding: 'mp3' }, { returnRawResponse: true });
    if (result instanceof Response && !result.ok) {
      await result.body?.cancel().catch(() => {});
      if (result.status === 429 || result.status === 402) fail('VOICE_TTS_PROVIDER_LIMIT', 429);
      fail('VOICE_TTS_UNAVAILABLE');
    }
    return await readAudio(result instanceof Response ? result.body : result, signal);
  } catch (error) {
    if (/^VOICE_TTS_/.test(error?.message || '')) throw error;
    if (error?.status === 429 || /\b(?:429|3036|quota|neurons|rate limit)\b/i.test(error?.message || '')) fail('VOICE_TTS_PROVIDER_LIMIT', 429);
    fail('VOICE_TTS_UNAVAILABLE');
  }
}
