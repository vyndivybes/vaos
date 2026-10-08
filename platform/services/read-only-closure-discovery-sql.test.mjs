import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('completed read-only missions remain discoverable for closure without reopening or executing work', async () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(dir)).filter(name => name.endsWith('_read_only_closure_discovery_v1.sql'));
  assert.equal(names.length, 1);
  const source = await readFile(new URL(names[0], dir), 'utf8');
  assert.ok(source.includes('create or replace function public.vaos_list_runnable_missions('));
  assert.ok(source.includes('assert_server_key(p_server_key)'));
  assert.ok(source.includes("m.status='ACTIVE'"));
  assert.ok(source.includes("'COMPLETED'"));
  assert.ok(source.includes("'RISK.IDENTIFY'"));
  assert.ok(source.includes('not exists'));
  assert.ok(source.includes('human_approval_required'));
  assert.ok(source.includes('execution_mode'));
  assert.ok(source.includes('grant execute on function public.vaos_list_runnable_missions(text,integer)'));
  assert.ok(source.includes('to service_role'));
  assert.ok(source.includes('revoke all on function public.vaos_list_runnable_missions(text,integer)'));
  assert.equal(source.includes('update vaos_private.missions'), false);
});
