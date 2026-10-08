const PROVIDER_ID='node-red';
const CAPABILITY='event.edge';

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(providerRunId)e.providerRunId=String(providerRunId);
  return e;
}
function req(input,key,prefix='NODERED_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('NODERED_CONFIG_INVALID',{message:`NODERED_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('NODERED_CONFIG_INVALID',{message:`NODERED_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('NODERED_CONFIG_INVALID',{message:`NODERED_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw providerError('NODERED_CONFIG_INVALID',{message:`NODERED_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.flows||typeof c.flows!=='object'||Array.isArray(c.flows)||!Object.keys(c.flows).length)throw providerError('NODERED_CONFIG_INVALID',{message:'NODERED_CONFIG_INVALID:flows'});
  const flows={};
  for(const [key,f] of Object.entries(c.flows)){
    if(typeof key!=='string'||!key.trim()||!f||typeof f!=='object'||Array.isArray(f))throw providerError('NODERED_CONFIG_INVALID',{message:'NODERED_CONFIG_INVALID:flows'});
    const allowedDeviceIds=Array.isArray(f.allowedDeviceIds)&&f.allowedDeviceIds.length?f.allowedDeviceIds.map(v=>req({v},'v','NODERED_CONFIG_INVALID')):(()=>{throw providerError('NODERED_CONFIG_INVALID',{message:'NODERED_CONFIG_INVALID:allowedDeviceIds'})})();
    const allowedEventTypes=Array.isArray(f.allowedEventTypes)&&f.allowedEventTypes.length?f.allowedEventTypes.map(v=>req({v},'v','NODERED_CONFIG_INVALID')):(()=>{throw providerError('NODERED_CONFIG_INVALID',{message:'NODERED_CONFIG_INVALID:allowedEventTypes'})})();
    const effectClass=req(f,'effectClass','NODERED_CONFIG_INVALID').toLowerCase();
    if(!['observe','physical'].includes(effectClass))throw providerError('NODERED_CONFIG_INVALID',{message:'NODERED_CONFIG_INVALID:effectClass'});
    flows[key.trim()]=Object.freeze({
      flowId:req(f,'flowId','NODERED_CONFIG_INVALID'),
      eventBindingRef:req(f,'eventBindingRef','NODERED_CONFIG_INVALID'),
      adminBindingRef:req(f,'adminBindingRef','NODERED_CONFIG_INVALID'),
      allowedDeviceIds:Object.freeze([...new Set(allowedDeviceIds)]),
      allowedEventTypes:Object.freeze([...new Set(allowedEventTypes)]),
      effectClass,
    });
  }
  return Object.freeze({
    adminBaseUrl:absoluteHttpUrl(c.adminBaseUrl,'adminBaseUrl'),
    flows:Object.freeze(flows),
    dispatchTimeoutMs:bounded(c.dispatchTimeoutMs??10000,'dispatchTimeoutMs',1000,120000),
    receiptWaitMs:bounded(c.receiptWaitMs??30000,'receiptWaitMs',1000,300000),
    readTimeoutMs:bounded(c.readTimeoutMs??10000,'readTimeoutMs',1000,120000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,receiptPort,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('NODERED_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('NODERED_CREDENTIAL_BROKER_REQUIRED');
  if(!receiptPort||typeof receiptPort.issue!=='function'||typeof receiptPort.waitForReceipt!=='function')throw providerError('NODERED_RECEIPT_PORT_REQUIRED');
  for(const name of ['readRuntimeState','readFlow','postEvent'])if(typeof transport?.[name]!=='function')throw providerError('NODERED_TRANSPORT_REQUIRED');
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('NODERED_PROVIDER_NOT_QUALIFIED')}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('NODERED_JOB_INVALID',{message:'NODERED_JOB_INVALID:payload'});
  const flowKey=req(job.payload,'flowKey');
  const flow=cfg.flows[flowKey];
  if(!flow)throw providerError('NODERED_FLOW_NOT_ALLOWED');
  const deviceId=req(job.payload,'deviceId');
  if(!flow.allowedDeviceIds.includes(deviceId))throw providerError('NODERED_DEVICE_NOT_ALLOWED');
  const eventType=req(job.payload,'eventType');
  if(!flow.allowedEventTypes.includes(eventType))throw providerError('NODERED_EVENT_NOT_ALLOWED');
  if(flow.effectClass==='physical'&&(typeof job.payload.safetyAuthorityRef!=='string'||!job.payload.safetyAuthorityRef.trim()))throw providerError('NODERED_SAFETY_AUTHORITY_REQUIRED');
  const data=job.payload.data&&typeof job.payload.data==='object'&&!Array.isArray(job.payload.data)?clone(job.payload.data):{};
  return Object.freeze({
    id,intentId,actionType,flowKey,flow,deviceId,eventType,data,
    safetyAuthorityRef:flow.effectClass==='physical'?job.payload.safetyAuthorityRef.trim():null,
  });
}
function credReq(bindingRef,job){return{bindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
async function adminRead(credentialBroker,cfg,job,fn){
  return credentialBroker.withCredential(credReq(job.flow.adminBindingRef,job),async credential=>{
    if(credential?.kind!=='bearer')throw providerError('NODERED_ADMIN_CREDENTIAL_INVALID');
    return fn(credential.value);
  });
}
async function verifyReady(credentialBroker,transport,cfg,job){
  const state=await adminRead(credentialBroker,cfg,job,token=>transport.readRuntimeState({
    url:`${cfg.adminBaseUrl}/flows/state`,method:'GET',timeoutMs:cfg.readTimeoutMs,
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
  }));
  if(!state||String(state.state||'').toLowerCase()!=='start')throw providerError('NODERED_RUNTIME_NOT_READY');
  const flow=await adminRead(credentialBroker,cfg,job,token=>transport.readFlow({
    url:`${cfg.adminBaseUrl}/flow/${encodeURIComponent(job.flow.flowId)}`,method:'GET',timeoutMs:cfg.readTimeoutMs,
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
  }));
  if(!flow||flow.id!==job.flow.flowId)throw providerError('NODERED_FLOW_VERIFICATION_FAILED');
}
function validateReceipt(receipt,callback,job){
  if(!receipt||typeof receipt!=='object'||receipt.receiptRef!==callback.receiptRef||receipt.providerId!==PROVIDER_ID||receipt.executionJobId!==job.id||receipt.intentId!==job.intentId||receipt.actionKey!==job.flowKey)throw providerError('NODERED_VERIFICATION_FAILED');
  if(receipt.status==='failed')throw providerError('NODERED_EDGE_FAILED',{providerRunId:receipt.evidence?.edgeEventId});
  if(receipt.status!=='succeeded')throw providerError('NODERED_VERIFICATION_FAILED');
  const edgeEventId=typeof receipt.evidence?.edgeEventId==='string'&&receipt.evidence.edgeEventId.trim()?receipt.evidence.edgeEventId.trim():'';
  if(!edgeEventId)throw providerError('NODERED_VERIFICATION_FAILED');
  return edgeEventId;
}
export function createNodeRedEdgeAdapter({capabilityRegistry,credentialBroker,receiptPort,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,receiptPort,transport});
  const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);
    assertQualified(capabilityRegistry);
    await verifyReady(credentialBroker,transport,cfg,job);

    let callback;
    try{
      callback=await receiptPort.issue({providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId,actionKey:job.flowKey});
      if(!callback||typeof callback.receiptRef!=='string'||!callback.receiptRef||typeof callback.callbackUrl!=='string'||!callback.callbackUrl)throw providerError('NODERED_RECEIPT_ISSUE_FAILED');
    }catch(error){
      if(error?.code==='NODERED_RECEIPT_ISSUE_FAILED')throw error;
      throw providerError('NODERED_RECEIPT_ISSUE_FAILED',{retryable:true});
    }

    let started=false;
    try{
      await credentialBroker.withCredential(credReq(job.flow.eventBindingRef,job),async credential=>{
        if(credential?.kind!=='url')throw providerError('NODERED_EVENT_CREDENTIAL_INVALID');
        started=true;
        const response=await transport.postEvent({
          url:credential.value,method:'POST',timeoutMs:cfg.dispatchTimeoutMs,
          headers:{'Content-Type':'application/json',Accept:'application/json','X-VAOS-EXECUTION-JOB-ID':job.id,'X-VAOS-INTENT-ID':job.intentId},
          body:{
            schemaVersion:'vaos.node-red.edge.v1',
            executionJobId:job.id,intentId:job.intentId,
            flowKey:job.flowKey,flowId:job.flow.flowId,deviceId:job.deviceId,eventType:job.eventType,
            effectClass:job.flow.effectClass,safetyAuthorityRef:job.safetyAuthorityRef,
            data:clone(job.data),callbackUrl:callback.callbackUrl,
          },
        });
        const status=Number(response?.status);
        if(status===429)throw providerError('NODERED_RATE_LIMITED',{retryable:true});
        if(status<200||status>=300)throw providerError(status>=500?'NODERED_OUTCOME_UNKNOWN':'NODERED_DISPATCH_REJECTED',{outcomeUnknown:status>=500});
      });
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||['NODERED_EVENT_CREDENTIAL_INVALID','NODERED_RATE_LIMITED','NODERED_DISPATCH_REJECTED'].includes(error?.code))throw error;
      if(!started||error?.requestSent===false)throw providerError('NODERED_DISPATCH_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
      throw providerError('NODERED_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
    }

    let receipt;
    try{
      receipt=await receiptPort.waitForReceipt({receiptRef:callback.receiptRef,providerId:PROVIDER_ID,executionJobId:job.id,intentId:job.intentId,actionKey:job.flowKey,timeoutMs:cfg.receiptWaitMs});
    }catch{
      throw providerError('NODERED_RECEIPT_PENDING',{retryable:false,outcomeUnknown:true});
    }
    const edgeEventId=validateReceipt(receipt,callback,job);
    await verifyReady(credentialBroker,transport,cfg,job);

    return Object.freeze({
      adapterId:'node-red.edge.v1',providerId:PROVIDER_ID,capability:CAPABILITY,
      effect:Object.freeze({
        effectType:'EDGE.EVENT_PROCESSED',resourceType:'NODE_RED_EDGE_EVENT',resourceId:edgeEventId,
        state:'SUCCEEDED',flowKey:job.flowKey,deviceId:job.deviceId,effectClass:job.flow.effectClass,canonicalStateUpdated:false,
      }),
      verification:Object.freeze({
        verified:true,resourceType:'NODE_RED_EDGE_EVENT',resourceId:edgeEventId,flowId:job.flow.flowId,
        deviceId:job.deviceId,eventType:job.eventType,evidenceSource:'node-red.callback+flow-readback',
        executionJobId:job.id,intentId:job.intentId,
      }),
    });
  }
  return Object.freeze({id:'node-red.edge.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
