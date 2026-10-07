import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { createDurableControlService } from '../../../platform/services/durable-control-service.mjs';

let service;

export function resolveDurableControlConfig(runtimeEnv = undefined, processEnv = process.env) {
  const explicit = runtimeEnv && typeof runtimeEnv === 'object' ? runtimeEnv : {};
  const fallback = processEnv && typeof processEnv === 'object' ? processEnv : {};
  return {
    url: explicit.SUPABASE_URL || fallback.SUPABASE_URL,
    serverSecret: explicit.VAOS_DB_RPC_SECRET || fallback.VAOS_DB_RPC_SECRET,
  };
}

export function getDurableControlService(runtimeEnv = undefined) {
  if (!service) {
    const store = createSupabaseControlStore(resolveDurableControlConfig(runtimeEnv));
    service = createDurableControlService({ store });
  }
  return service;
}

export function resetDurableControlServiceForTest() {
  service = undefined;
}
