function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(input,key){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail('PROVIDER_RUNTIME_INPUT_INVALID',`PROVIDER_RUNTIME_INPUT_INVALID:${key}`);return v.trim()}
function defaultIdFactory(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();throw fail('PROVIDER_RUNTIME_ID_FACTORY_REQUIRED')}
function safeRefs(value){return Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()):[]}
function clock(now){const d=now();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('PROVIDER_RUNTIME_CLOCK_INVALID');return d.toISOString()}
function safeProviderError(error){
  const code=typeof error?.code==='string'&&error.code?error.code:'PROVIDER_EXECUTION_FAILED';
  const sanitized=fail(code);
  if(typeof error?.retryable==='boolean')sanitized.retryable=error.retryable;
  if(typeof error?.outcomeUnknown==='boolean')sanitized.outcomeUnknown=error.outcomeUnknown;
  if((typeof error?.providerRunId==='string'&&error.providerRunId.trim())||Number.isFinite(error?.providerRunId)){
    sanitized.providerRunId=String(error.providerRunId);
  }
  return sanitized;
}

function createSelectedProviderGate(providerId,capability){
  return Object.freeze({
    resolve(requestedCapability,constraints={}){
      if(requestedCapability!==capability)return null;
      const allowed=Array.isArray(constraints.allowedProviderIds)?constraints.allowedProviderIds:null;
      const denied=Array.isArray(constraints.deniedProviderIds)?constraints.deniedProviderIds:[];
      if(allowed&&!allowed.includes(providerId))return null;
      if(denied.includes(providerId))return null;
      return Object.freeze({providerId});
    },
  });
}

export function createProviderRuntime({
  controlPlane,
  adapters={},
  adapterFactories={},
  reconciliation=null,
  recordAudit=async()=>{},
  idFactory=defaultIdFactory,
  now=()=>new Date(),
}={}){
  if(!controlPlane||typeof controlPlane.resolve!=='function')throw fail('PROVIDER_RUNTIME_CONTROL_PLANE_REQUIRED');
  if(!adapters||typeof adapters!=='object'||Array.isArray(adapters))throw fail('PROVIDER_RUNTIME_ADAPTERS_INVALID');
  if(!adapterFactories||typeof adapterFactories!=='object'||Array.isArray(adapterFactories))throw fail('PROVIDER_RUNTIME_FACTORIES_INVALID');
  if(reconciliation!==null&&typeof reconciliation?.enqueue!=='function')throw fail('PROVIDER_RUNTIME_RECONCILIATION_INVALID');
  if(typeof recordAudit!=='function'||typeof idFactory!=='function'||typeof now!=='function')throw fail('PROVIDER_RUNTIME_CONFIG_INVALID');

  async function execute({
    capability,
    dataClassification,
    riskClass,
    executionJob,
    preferredProviderIds,
    allowedProviderIds,
    deniedProviderIds,
  }={}){
    capability=req({capability},'capability');
    dataClassification=req({dataClassification},'dataClassification');
    riskClass=req({riskClass},'riskClass');
    const executionJobId=req(executionJob,'id');
    const intentId=req(executionJob,'intentId');

    const provider=controlPlane.resolve(capability,{
      dataClassification,
      riskClass,
      preferredProviderIds,
      allowedProviderIds,
      deniedProviderIds,
    });
    if(!provider)throw fail('PROVIDER_RUNTIME_NOT_AVAILABLE');

    const providerId=req(provider,'providerId');
    const adapterKey=`${providerId}:${capability}`;
    const factory=adapterFactories[adapterKey] || adapterFactories[providerId];
    const adapter=factory
      ? factory({
          capabilityRegistry:createSelectedProviderGate(providerId,capability),
          providerId,
          capability,
        })
      : (adapters[adapterKey] || adapters[providerId]);
    if(!adapter||adapter.providerId!==providerId||adapter.capability!==capability||typeof adapter.execute!=='function'){
      throw fail('PROVIDER_RUNTIME_ADAPTER_MISMATCH');
    }

    await recordAudit({
      type:'PROVIDER.ROUTED',
      providerId,
      capability,
      dataClassification,
      riskClass,
      executionJobId,
      intentId,
      occurredAt:clock(now),
    });

    try{
      const result=await adapter.execute(executionJob);
      if(
        !result
        || result.providerId!==providerId
        || result.capability!==capability
        || result.verification?.verified!==true
      ){
        throw fail('PROVIDER_RUNTIME_VERIFICATION_FAILED');
      }
      return result;
    }catch(error){
      if(error?.outcomeUnknown===true&&reconciliation){
        const reconciliationId=idFactory();
        await reconciliation.enqueue({
          reconciliationId,
          providerId,
          capability,
          executionJobId,
          intentId,
          providerRunId:(typeof error?.providerRunId==='string'&&error.providerRunId.trim())||Number.isFinite(error?.providerRunId)
            ?String(error.providerRunId):null,
          evidenceRefs:safeRefs(error?.evidenceRefs),
          reasonCode:typeof error?.code==='string'&&error.code?error.code:'PROVIDER_OUTCOME_UNKNOWN',
        });
      }
      throw safeProviderError(error);
    }
  }

  return Object.freeze({execute});
}
