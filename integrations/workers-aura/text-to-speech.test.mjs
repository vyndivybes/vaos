import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuraSpeech } from './text-to-speech.mjs';

const bytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(80)]);
const now = () => Date.UTC(2026, 10, 17);
function fixture(used, { race = false, status = 200 } = {}) {
  let calls = 0;
  let state = { day: '2026-11-17', used };
  const env = {
    VAOS_FEATURE_FLAGS: '{"VAOS_AURA_VOICE_CONTROL":"founder-workers-free-v1"}',
    VAOS_ARTIFACTS: {
      async get() { return { etag: 'existing', json: async () => state }; },
      async put(_key, raw, option) {
        assert.equal(option.onlyIf.etagMatches, 'existing');
        if (race) return null;
        state = JSON.parse(raw);
        return { etag: 'next' };
      },
    },
    AI: {
      async run(model, input, options) {
        calls++;
        assert.equal(model, '@cf/deepgram/aura-1');
        assert.equal(input.speaker, 'orpheus');
        assert.equal(input.encoding, 'mp3');
        assert.deepEqual(options, { returnRawResponse: true });
        assert.equal(state.used, used + input.text.length);
        return new Response(bytes, { status });
      },
    },
  };
  return { env, now, calls: () => calls };
}
test('a full spoken turn still works after passing the former 1,000 character limit', async () => {
  const f = fixture(1200);
  const result = await createAuraSpeech({ ...f, text: 'A complete answer. '.repeat(27) });
  assert.deepEqual(result, bytes);
  assert.equal(f.calls(), 1);
});
test('reserve the voice allowance before provider use and stop on a race or exhausted budget', async () => {
  const full = fixture(5999), race = fixture(10, { race: true });
  await assert.rejects(createAuraSpeech({ ...full, text: 'sample' }), /VOICE_TTS_DAILY_LIMIT/);
  await assert.rejects(createAuraSpeech({ ...race, text: 'sample' }), /VOICE_TTS_BUSY/);
  assert.equal(full.calls() + race.calls(), 0);
});
test('shared Workers AI quota stops the turn with no provider retry', async () => {
  const f = fixture(0, { status: 429 });
  await assert.rejects(createAuraSpeech({ ...f, text: 'sample' }), /VOICE_TTS_PROVIDER_LIMIT/);
  assert.equal(f.calls(), 1);
});
