// Server-only immutable reply audit via authenticated Supabase Edge RPC.
import {resolveDurableControlConfig} from './durable-control-provider.mjs';
import {createFounderChatStore} from '../../../platform/persistence/founder-chat-store.mjs';
export function getFounderChatStore(env){
 return createFounderChatStore(resolveDurableControlConfig(env));
}
