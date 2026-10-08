import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261008100344_commissioning_replay_hardening_v1.sql',
  import.meta.url,
);

test('Knowledge Q2 duplicate business effect is returned as immutable replay evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create or replace function public\.vaos_link_knowledge_qualification/i);
  assert.match(sql, /'outcome','REPLAY'/);
  assert.match(sql, /'replayedFromExecutionJobId'/);
  assert.match(sql, /'replayedFromIntentId'/);
  assert.doesNotMatch(sql, /LINK_ALREADY_EXISTS/);
});

test('operational commissioning blocks unresolved dead letters but preserves resolved history', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create or replace function public\.vaos_operational_commissioning_snapshot/i);
  assert.match(sql, /dead_letter_resolution/);
  assert.match(sql, /deadLettersHistorical/);
  assert.match(sql, /deadLettersResolved/);
  assert.match(sql, /deadLettersUnresolved/);
  assert.match(sql, /v_unresolved_dead_letters\s*=\s*0/);
  assert.match(sql, /QUALIFICATION_TERMINAL/);
  assert.match(sql, /WORKFORCE\.QUALIFY/);
  assert.match(sql, /qualificationKnowledgeLink/);
});
