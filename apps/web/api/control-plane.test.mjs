import test from 'node:test';
import assert from 'node:assert/strict';

import { controlPlaneDiagnostic } from './control-plane.mjs';

test('control-plane diagnostic exposes only safe configuration failure codes', () => {
  assert.equal(controlPlaneDiagnostic(new Error('SUPABASE_CONFIG_MISSING:url')), 'SUPABASE_URL_MISSING');
  assert.equal(controlPlaneDiagnostic(new Error('SUPABASE_CONFIG_MISSING:serverSecret')), 'VAOS_DB_RPC_SECRET_MISSING');
  assert.equal(controlPlaneDiagnostic(new Error('SUPABASE_EDGE_FAILED:401')), 'SUPABASE_EDGE_401');
  assert.equal(controlPlaneDiagnostic(new Error('unexpected internal detail')), 'CONTROL_PLANE_BOOTSTRAP_FAILED');
});
