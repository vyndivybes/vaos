import {createFounderInboxStore} from '../../../platform/persistence/founder-inbox-store.mjs';
import {resolveDurableControlConfig} from './durable-control-provider.mjs';
export function getFounderInboxStore(env){
 return createFounderInboxStore(resolveDurableControlConfig(env));
}
