import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { createEightAgentOperatingService } from '../../../platform/services/eight-agent-operating-service.mjs';
import { resolveDurableControlConfig } from './durable-control-provider.mjs';

export function getEightAgentOperatingService(runtimeEnv = undefined) {
  return createEightAgentOperatingService({
    store: createSupabaseControlStore(resolveDurableControlConfig(runtimeEnv)),
  });
}
