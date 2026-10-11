import {resolveDurableControlConfig} from './durable-control-provider.mjs';
import {createFounderConversationStore} from '../../../platform/persistence/founder-conversation-store.mjs';
export function getFounderConversationStore(env){
 return createFounderConversationStore(resolveDurableControlConfig(env));
}
