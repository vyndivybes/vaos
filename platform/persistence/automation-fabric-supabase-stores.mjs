function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function required(value,name){if(typeof value!=='string'||!value.trim())throw fail('AUTOMATION_FABRIC_STORE_CONFIG_INVALID',`AUTOMATION_FABRIC_STORE_CONFIG_INVALID:${name}`);return value.trim()}

export function createAutomationFabricSupabaseStores({
  url,
  serverSecret,
  fetchImpl=globalThis.fetch,
}={}){
  const baseUrl=required(url,'url').replace(/\/$/,'');
  const secret=required(serverSecret,'serverSecret');
  if(typeof fetchImpl!=='function')throw fail('AUTOMATION_FABRIC_STORE_CONFIG_INVALID','AUTOMATION_FABRIC_STORE_CONFIG_INVALID:fetch');

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
      throw fail('AUTOMATION_FABRIC_STORE_FAILED');
    }
    if(!response?.ok)throw fail('AUTOMATION_FABRIC_STORE_FAILED');
    try{return await response.json()}catch{throw fail('AUTOMATION_FABRIC_STORE_FAILED')}
  }

  const providerState=Object.freeze({
    async load(providerId){
      return invoke('providerStateGet',{providerId});
    },
    async save(state){
      const result=await invoke('providerStatePut',{state});
      if(result?.outcome!=='SAVED'||!result.state)throw fail('PROVIDER_STATE_SAVE_FAILED');
      return result.state;
    },
  });

  const callbacks=Object.freeze({
    async create(record){
      const result=await invoke('callbackCreate',{record});
      if(result?.outcome==='DUPLICATE')throw fail('CALLBACK_RECEIPT_DUPLICATE');
      if(result?.outcome!=='CREATED'||!result.record)throw fail('CALLBACK_RECEIPT_CREATE_FAILED');
      return result.record;
    },
    async get(receiptRef){
      return invoke('callbackGet',{receiptRef});
    },
    async consumeOnce(receiptRef,input){
      const result=await invoke('callbackConsumeOnce',{receiptRef,...input});
      const outcome=result?.outcome;
      if(outcome==='CONSUMED'&&result.record)return result.record;
      if(outcome==='NOT_FOUND')throw fail('CALLBACK_RECEIPT_NOT_FOUND');
      if(outcome==='REPLAY')throw fail('CALLBACK_RECEIPT_REPLAY');
      if(outcome==='EXPIRED')throw fail('CALLBACK_RECEIPT_EXPIRED');
      if(outcome==='TOKEN_INVALID')throw fail('CALLBACK_TOKEN_INVALID');
      if(outcome==='CORRELATION_MISMATCH')throw fail('CALLBACK_CORRELATION_MISMATCH');
      throw fail('CALLBACK_RECEIPT_CONSUME_FAILED');
    },
  });

  const reconciliation=Object.freeze({
    async enqueue(record){
      const result=await invoke('reconciliationEnqueue',{record});
      if(result?.outcome==='CONFLICT')throw fail('RECONCILIATION_IDEMPOTENCY_CONFLICT');
      if(!['CREATED','REPLAY'].includes(result?.outcome)||!result.record)throw fail('RECONCILIATION_ENQUEUE_FAILED');
      return {outcome:result.outcome,record:result.record};
    },
    async claim(input){
      return invoke('reconciliationClaim',input||{});
    },
    async save(reconciliationId,patch,{leaseToken}={}){
      const result=await invoke('reconciliationSave',{reconciliationId,patch,leaseToken:leaseToken||null});
      if(result?.outcome==='LEASE_MISMATCH')throw fail('RECONCILIATION_LEASE_MISMATCH');
      if(result?.outcome==='NOT_FOUND')throw fail('RECONCILIATION_NOT_FOUND');
      if(result?.outcome==='INVALID')throw fail('RECONCILIATION_INVALID');
      if(result?.outcome!=='SAVED'||!result.record)throw fail('RECONCILIATION_SAVE_FAILED');
      return result.record;
    },
    async get(reconciliationId){
      return invoke('reconciliationGet',{reconciliationId});
    },
    async list(){
      const result=await invoke('reconciliationList',{});
      if(!Array.isArray(result))throw fail('RECONCILIATION_LIST_FAILED');
      return result;
    },
  });

  return Object.freeze({providerState,callbacks,reconciliation});
}
