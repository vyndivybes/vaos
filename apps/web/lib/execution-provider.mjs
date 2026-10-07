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

    const projectRisk = Object.freeze({
      escalateRisk(job, input) { return store.escalateRisk(job, input); },
      getRiskEscalation(job, riskId) { return store.getRiskEscalation(job, riskId); },
    });

    const digitalThread = Object.freeze({
      linkDomainRecords(job, input) { return store.linkDomainRecords(job, input); },
      getDomainLink(job, input) { return store.getDomainLink(job, input); },
    });

    engine = createExecutionEngine({
      store,
      registry: createExecutionAdapterRegistry({ qaCapa, engineeringChange, projectRisk, digitalThread }),
      workerId: 'vaos-vercel-worker',
    });
  }
  return engine;
}

export function resetExecutionEngineForTest() {
  engine = undefined;
}
