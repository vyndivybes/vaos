/**
 * Ollama-compatible local loopback text adapter for independent inference trials.
 * Cloudflare Workers cannot reach a user's PC loopback: this is for local/self-hosted
 * Node runtimes with a separately installed and measured local model.
 */
const LOOPBACK = 'http://127.0.0.1:11434';
export function createLoopbackModelAdapter({baseUrl=LOOPBACK,model,
  fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  if (baseUrl !== LOOPBACK) throw new Error('INVALID_LOOPBACK_ENDPOINT');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]+(?::[a-zA-Z0-9._-]+)?$/.test(model))
    throw new Error('INVALID_LOCAL_MODEL');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs<100 || timeoutMs>30000)
    throw new Error('INVALID_ADAPTER_CONFIG');
  return Object.freeze({
    id:'local-ollama',kind:'local',costTier:'free',available:true,capabilities:Object.freeze(['text']),
    async invoke(task){
      if (!task || !['PUBLIC','SYNTHETIC','CONFIDENTIAL'].includes(task.classification) ||
          task.capability!=='text' || typeof task.input!=='string' || !task.input.trim() || task.input.length>8192)
        throw new Error('INVALID_LOCAL_TASK');
      try {
        const response=await fetchImpl(`${LOOPBACK}/api/generate`,{
          method:'POST',redirect:'error',headers:{'content-type':'application/json'},
          body:JSON.stringify({model,prompt:task.input,stream:false,options:{num_predict:512}}),
          signal:AbortSignal.timeout(timeoutMs),
        });
        if(!response?.ok)throw new Error('LOCAL_UPSTREAM_STATUS');
        const value=(await response.json())?.response;
        if(typeof value!=='string'||!value.trim()||value.length>12000)
          throw new Error('LOCAL_UPSTREAM_RESULT_INVALID');
        return Object.freeze({text:value,model,evidenceStatus:'MODEL_OUTPUT_UNVERIFIED'});
      } catch {
        throw new Error('LOCAL_PROVIDER_FAILED');
      }
    },
  });
}
