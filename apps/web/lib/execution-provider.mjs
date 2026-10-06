import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { createExecutionAdapterRegistry } from '../../../platform/execution/adapter-registry.mjs';
import { createExecutionEngine } from '../../../platform/execution/execution-engine.mjs';

let engine;

export function getExecutionEngine() {
  if (!engine) {
    const store = createSupabaseControlStore({
      url: process.env.SUPABASE_URL,
      serverSecret: process.env.VAOS_DB_RPC_SECRET,
    });

    const qaCapa = Object.freeze({
      openCapa(job, input) { return store.openCapa(job, input); },
      getCapa(job, capaId) { return store.getCapa(job, capaId); },
    });

    engine = createExecutionEngine({
      store,
      registry: createExecutionAdapterRegistry({ qaCapa }),
      workerId: 'vaos-vercel-worker',
    });
  }
  return engine;
}

export function resetExecutionEngineForTest() {
  engine = undefined;
}
