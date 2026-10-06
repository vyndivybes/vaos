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

    const engineeringChange = Object.freeze({
      recordBaselineChange(job, input) { return store.recordBaselineChange(job, input); },
      getBaselineChange(job, baseline) { return store.getBaselineChange(job, baseline); },
    });

    engine = createExecutionEngine({
      store,
      registry: createExecutionAdapterRegistry({ qaCapa, engineeringChange }),
      workerId: 'vaos-vercel-worker',
    });
  }
  return engine;
}

export function resetExecutionEngineForTest() {
  engine = undefined;
}
