import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDurableControlConfig } from './durable-control-provider.mjs';

test('durable control config prefers explicit runtime bindings over process env', () => {
  const config = resolveDurableControlConfig({
    SUPABASE_URL: 'https://runtime.supabase.co',
    VAOS_DB_RPC_SECRET: 'runtime-secret',
  }, {
    SUPABASE_URL: 'https://process.supabase.co',
    VAOS_DB_RPC_SECRET: 'process-secret',
  });

  assert.deepEqual(config, {
    url: 'https://runtime.supabase.co',
    serverSecret: 'runtime-secret',
  });
});

test('durable control config falls back to process env outside Cloudflare', () => {
  const config = resolveDurableControlConfig(undefined, {
    SUPABASE_URL: 'https://process.supabase.co',
    VAOS_DB_RPC_SECRET: 'process-secret',
  });

  assert.deepEqual(config, {
    url: 'https://process.supabase.co',
    serverSecret: 'process-secret',
  });
});

test('durable control config accepts legacy SUPABASE runtime binding alias', () => {
  const config = resolveDurableControlConfig({
    SUPABASE: 'https://alias.supabase.co',
    VAOS_DB_RPC_SECRET: 'runtime-secret',
  }, {});

  assert.deepEqual(config, {
    url: 'https://alias.supabase.co',
    serverSecret: 'runtime-secret',
  });
});
