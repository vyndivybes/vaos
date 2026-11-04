import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JARVIS_GOVERNED_MODEL,
  JARVIS_AUTHORITY_LEVELS,
  validateGovernedAdvisory,
  runJarvisGovernedAdvisory,
} from './jarvis-governed-model.mjs';

const validBody = {
  recommendation: 'HOLD_FOR_EVIDENCE',
  riskPosture: 'MEDIUM',
  summary: 'Source coverage is incomplete so independent review is required before any preparation.',
};

function mockAi(responseText, extra = {}) {
  return {
    async run(model, params) {
      assert.equal(model, JARVIS_GOVERNED_MODEL);
      assert.equal(params.stream, false);
      assert.equal(params.temperature, 0);
      assert.ok(params.max_tokens <= 180);
      assert.ok(typeof params.prompt === 'string');
      assert.ok(!Object.hasOwn(params, 'tools'));
      return { response: responseText, ...extra };
    },
  };
}

test('authority levels are exactly L0-L3', () => {
  assert.deepEqual([...JARVIS_AUTHORITY_LEVELS], ['L0', 'L1', 'L2', 'L3']);
});

test('validateGovernedAdvisory accepts a bounded HOLD advisory', () => {
  const out = validateGovernedAdvisory(validBody, { authorityLevel: 'L2', domain: 'finance' });
  assert.equal(out.authority, 'ADVISORY_ONLY');
  assert.equal(Object.hasOwn(out, 'modelInvoked'), false);
  assert.equal(out.actionAuthorized, false);
  assert.equal(out.executionEnabled, false);
  assert.equal(out.qualificationGranted, false);
  assert.equal(out.operationallyQualified, false);
  assert.equal(out.recommendation, 'HOLD_FOR_EVIDENCE');
});

test('L0 and L1 cannot recommend PROCEED_WITH_REVIEW', () => {
  const proceed = {
    recommendation: 'PROCEED_WITH_REVIEW',
    riskPosture: 'LOW',
    summary: 'Observed sources look coherent enough for a preparation draft under review.',
  };
  assert.throws(
    () => validateGovernedAdvisory(proceed, { authorityLevel: 'L0', domain: 'project' }),
    (e) => e.code === 'JARVIS_MODEL_AUTHORITY_DENIED',
  );
  assert.throws(
    () => validateGovernedAdvisory(proceed, { authorityLevel: 'L1', domain: 'project' }),
    (e) => e.code === 'JARVIS_MODEL_AUTHORITY_DENIED',
  );
  const ok = validateGovernedAdvisory(proceed, { authorityLevel: 'L2', domain: 'project' });
  assert.equal(ok.recommendation, 'PROCEED_WITH_REVIEW');
});

test('rejects approval language, numerals, tools and extra keys', () => {
  assert.throws(
    () => validateGovernedAdvisory({
      ...validBody,
      summary: 'This is approved and certified for autonomous L5 execution tomorrow.',
    }, { authorityLevel: 'L2', domain: 'finance' }),
    (e) => e.code === 'JARVIS_MODEL_OUTPUT_REJECTED',
  );
  assert.throws(
    () => validateGovernedAdvisory({
      ...validBody,
      summary: 'Expected savings of 12 percent if the transfer proceeds.',
    }, { authorityLevel: 'L2', domain: 'finance' }),
    (e) => e.code === 'JARVIS_MODEL_OUTPUT_REJECTED',
  );
  assert.throws(
    () => validateGovernedAdvisory({ ...validBody, extra: true }, { authorityLevel: 'L2', domain: 'finance' }),
    (e) => e.code === 'JARVIS_MODEL_OUTPUT_REJECTED',
  );
});

test('runJarvisGovernedAdvisory invokes model and returns validated advisory', async () => {
  const ai = mockAi(JSON.stringify(validBody));
  const out = await runJarvisGovernedAdvisory({
    ai,
    authorityLevel: 'L2',
    domain: 'procurement',
    subjectId: 'SHORTAGE-REVIEW-1',
    observations: [{ domain: 'procurement', status: 'HOLD' }],
    question: 'Should we prepare a purchase order?',
  });
  assert.equal(out.domain, 'procurement');
  assert.equal(out.modelInvoked, true);
  assert.equal(out.recommendation, 'HOLD_FOR_EVIDENCE');
  assert.equal(out.actionAuthorized, false);
});

test('tool calls from the model are rejected', async () => {
  const ai = {
    async run() {
      return {
        choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'x' }] } }],
      };
    },
  };
  await assert.rejects(
    () => runJarvisGovernedAdvisory({
      ai,
      authorityLevel: 'L2',
      domain: 'finance',
      subjectId: 'FIN-1',
    }),
    (e) => e.code === 'JARVIS_MODEL_TOOL_CALL_REJECTED',
  );
});

test('missing ai binding and bad domain fail closed', async () => {
  await assert.rejects(
    () => runJarvisGovernedAdvisory({
      authorityLevel: 'L2',
      domain: 'finance',
      subjectId: 'X-1',
    }),
    (e) => e.code === 'JARVIS_MODEL_BINDING_UNAVAILABLE',
  );
  await assert.rejects(
    () => runJarvisGovernedAdvisory({
      ai: mockAi('{}'),
      authorityLevel: 'L2',
      domain: 'not-a-domain',
      subjectId: 'X-1',
    }),
    (e) => e.code === 'JARVIS_MODEL_DOMAIN_REJECTED',
  );
});

test('L4 and L5 authority levels are refused at the boundary', () => {
  assert.throws(
    () => validateGovernedAdvisory(validBody, { authorityLevel: 'L4', domain: 'finance' }),
    (e) => e.code === 'JARVIS_MODEL_AUTHORITY_DENIED',
  );
  assert.throws(
    () => validateGovernedAdvisory(validBody, { authorityLevel: 'L5', domain: 'finance' }),
    (e) => e.code === 'JARVIS_MODEL_AUTHORITY_DENIED',
  );
});


test('a proceed recommendation cannot override missing, held, or unknown evidence', async () => {
  const run = observations => runJarvisGovernedAdvisory({
    ai: mockAi(JSON.stringify({ ...validBody, recommendation: 'PROCEED_WITH_REVIEW' })),
    domain: 'finance',
    subjectId: 'FIN',
    observations,
  });
  for (const observations of [[], ...['HOLD', 'UNKNOWN', 'OBSERVED'].map(status => [{ domain: 'finance', status }])]) {
    await assert.rejects(() => run(observations), { code: 'JARVIS_MODEL_SOURCE_EVIDENCE_REQUIRED' });
  }
  assert.equal((await run([{ domain: 'finance', status: 'OBSERVED', recordsObserved: 1 }])).recommendation, 'PROCEED_WITH_REVIEW');
});

test('whitespace padding cannot satisfy minimum advisory length', () => {
  assert.throws(() => validateGovernedAdvisory({
    ...validBody,
    summary: ' '.repeat(25) + 'Hold',
  }, { authorityLevel: 'L2', domain: 'finance' }), { code: 'JARVIS_MODEL_OUTPUT_REJECTED' });
});
