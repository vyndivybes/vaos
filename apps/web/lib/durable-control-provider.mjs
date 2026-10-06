import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { createDurableControlService } from '../../../platform/services/durable-control-service.mjs';

let service;

export function getDurableControlService() {
  if (!service) {
    const store = createSupabaseControlStore({
      url: process.env.SUPABASE_URL,
      serverSecret: process.env.VAOS_DB_RPC_SECRET,
    });
    service = createDurableControlService({ store });
  }
  return service;
}

export function resetDurableControlServiceForTest() {
  service = undefined;
}
