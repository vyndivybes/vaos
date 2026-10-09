import { createProviderControlPlane } from './provider-control-plane.mjs';
import { createReconciliationService } from './reconciliation-service.mjs';
import { createCallbackGateway } from './callback-gateway.mjs';
import { createProviderRuntime } from './provider-runtime.mjs';

function fail(code){const e=new Error(code);e.code=code;e.retryable=false;return e}

export function createDurableAutomationFabric({providers=[],stores,adapters={},adapterFactories={},resolvers={},callback,routingPolicy=null,recordAudit=async()=>{},now=()=>new Date(),controlPlaneOptions={},reconciliationOptions={}}={}){
  if(!stores?.providerState||!stores?.callbackReceipts||!stores?.reconciliation)throw fail('AUTOMATION_FABRIC_STORES_REQUIRED');
  if(!callback||typeof callback.tokenFactory!=='function'||typeof callback.hashToken!=='function'||typeof callback.baseUrl!=='string')throw fail('AUTOMATION_FABRIC_CALLBACK_CONFIG_REQUIRED');
  const controlPlane=createProviderControlPlane({providers,recordAudit,now,stateStore:stores.providerState,...controlPlaneOptions});
  const reconciliation=createReconciliationService({store:stores.reconciliation,resolvers,recordAudit,now,...reconciliationOptions});
  const callbackGateway=createCallbackGateway({store:stores.callbackReceipts,tokenFactory:callback.tokenFactory,hashToken:callback.hashToken,baseUrl:callback.baseUrl,validators:callback.validators||{},recordAudit,now});
  const runtime=createProviderRuntime({controlPlane,adapters,adapterFactories,reconciliation,routingPolicy,recordAudit,now});
  let initialized=false;
  async function initialize(){if(!initialized){await controlPlane.restore();initialized=true}return Object.freeze({initialized:true})}
  async function execute(input){if(!initialized)throw fail('AUTOMATION_FABRIC_NOT_INITIALIZED');return runtime.execute(input)}
  return Object.freeze({initialize,execute,controlPlane,reconciliation,callbackGateway,runtime});
}
