function required(value,name){
  if(typeof value!=='string'||!value.trim()){
    const error=new Error(`AUTOMATION_FABRIC_STORE_CONFIG_MISSING:${name}`);
    error.code='AUTOMATION_FABRIC_STORE_CONFIG_MISSING';
    throw error;
  }
  return value.trim();
}
function fail(code,message=code){
  const error=new Error(message);
  error.code=code;
  error.retryable=false;
  return error;
}
function clone(value){return value===undefined?undefined:structuredClone(value)}

export function createSupabaseAutomationFabricStore({
  url,
  serverSecret,
  fetchImpl=globalThis.fetch,
}={}){
  const baseUrl=required(url,'url').replace(/\/$/,'');
  const secret=required(serverSecret,'serverSecret');
  if(typeof fetchImpl!=='function')throw fail('AUTOMATION_FABRIC_STORE_CONFIG_MISSING','AUTOMATION_FABRIC_STORE_CONFIG_MISSING:fetch');

  async function invoke(operation,payload={}){
    let response;
    try{
      response=await fetchImpl(`${baseUrl}/functions/v1/vaos-control`,{
        method:'POST',
        headers:{
          'x-vaos-server-key':secret,
          'Content-Type':'application/json',
          'Cache-Control':'no-store',
        },
        body:JSON.stringify({operation,payload}),
      });
    }catch{
      throw fail('AUTOMATION_FABRIC_STORE_EDGE_UNAVAILABLE');
    }
    if(!response?.ok){
      const error=fail('AUTOMATION_FABRIC_STORE_EDGE_FAILED');
      error.status=Number(response?.status)||0;
      throw error;
    }
    try{return await response.json()}
    catch{throw fail('AUTOMATION_FABRIC_STORE_EDGE_INVALID_RESPONSE')}
  }

  function callbackOutcome(body){
    const outcome=body?.outcome;
    if(outcome==='CONSUMED'||outcome==='CREATED'||outcome==='SAVED')return body;
    if(outcome==='REPLAY')throw fail('CALLBACK_RECEIPT_REPLAY');
    if(outcome==='TOKEN_INVALID')throw fail('CALLBACK_TOKEN_INVALID');
    if(outcome==='CORRELATION_MISMATCH')throw fail('CALLBACK_CORRELATION_MISMATCH');
    if(outcome==='EXPIRED')throw fail('CALLBACK_RECEIPT_EXPIRED');
    if(outcome==='NOT_FOUND')throw fail('CALLBACK_RECEIPT_NOT_FOUND');
    if(outcome==='DUPLICATE')throw fail('CALLBACK_RECEIPT_DUPLICATE');
    throw fail('CALLBACK_STORE_FAILURE');
  }

  function reconciliationOutcome(body){
    const outcome=body?.outcome;
    if(outcome==='CREATED'||outcome==='REPLAY'||outcome==='SAVED')return body;
    if(outcome==='CONFLICT')throw fail('RECONCILIATION_IDEMPOTENCY_CONFLICT');
    if(outcome==='LEASE_MISMATCH')throw fail('RECONCILIATION_LEASE_MISMATCH');
    if(outcome==='NOT_FOUND')throw fail('RECONCILIATION_NOT_FOUND');
    throw fail('RECONCILIATION_STORE_FAILURE');
  }

  const providerState=Object.freeze({
    async load(providerId){
      const body=await invoke('providerStateGet',{providerId});
      if(body===null||body?.outcome==='NOT_FOUND')return null;
      return clone(body?.state??body);
    },
    async save(state){
      const body=await invoke('providerStatePut',{state:clone(state)});
      if(body?.outcome!=='SAVED')throw fail('PROVIDER_STATE_STORE_FAILURE');
      return clone(body?.state??state);
    },
  });

  const callbackReceipts=Object.freeze({
    async create(record){
      const body=callbackOutcome(await invoke('callbackCreate',{record:clone(record)}));
      return clone(body.record??record);
    },
    async get(receiptRef){
      const body=await invoke('callbackGet',{receiptRef});
      if(body===null||body?.outcome==='NOT_FOUND')return null;
      return clone(body?.record??body);
    },
    async consumeOnce(receiptRef,input={}){
      const body=callbackOutcome(await invoke('callbackConsumeOnce',{receiptRef,...clone(input)}));
      return clone(body.record);
    },
  });

  const reconciliation=Object.freeze({
    async enqueue(record){
      const body=reconciliationOutcome(await invoke('reconciliationEnqueue',{record:clone(record)}));
      return Object.freeze({outcome:body.outcome,record:clone(body.record??record)});
    },
    async claim(input={}){
      const body=await invoke('reconciliationClaim',clone(input));
      if(body===null||body?.outcome==='EMPTY')return null;
      return clone(body?.record??body);
    },
    async save(reconciliationId,patch,options={}){
      const body=reconciliationOutcome(await invoke('reconciliationSave',{
        reconciliationId,
        patch:clone(patch),
        leaseToken:options?.leaseToken??null,
      }));
      return clone(body.record);
    },
    async get(reconciliationId){
      const body=await invoke('reconciliationGet',{reconciliationId});
      if(body===null||body?.outcome==='NOT_FOUND')return null;
      return clone(body?.record??body);
    },
    async list(){
      const body=await invoke('reconciliationList',{});
      if(Array.isArray(body))return clone(body);
      if(Array.isArray(body?.records))return clone(body.records);
      throw fail('RECONCILIATION_STORE_FAILURE');
    },
  });

  return Object.freeze({providerState,callbackReceipts,reconciliation});
}
