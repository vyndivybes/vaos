import {parseCookies, SESSION_COOKIE, verifySessionToken} from '../lib/auth.mjs';

// Qualification only: no business action and no production-provider activation.
const PROVIDER_ID='zapier';
const CONFIRM='run-synthetic-zapier-once';
const TIMEOUT_MS=8000;

function reply(status,payload){
  return new Response(JSON.stringify(payload),{status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
  }});
}
function maker(req){
  const token=parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]||'';
  return verifySessionToken(token)?.email==='shyamsundhar1982@gmail.com';
}
function validatedHook(raw){
  if(typeof raw!=='string'||raw.length>2048)return null;
  try {
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.hostname!=='hooks.zapier.com'||u.port||
       u.username||u.password||u.search||u.hash||
       !/^\/hooks\/catch\/[0-9]+\/[A-Za-z0-9_-]+\/$/.test(u.pathname)){
      return null;
    }
    return u.toString();
  }catch{return null;}
}
function auditDocument({id,status,providerStatus=null}){
  return {
    schemaVersion:'vaos.zapier.synthetic-evidence.v1',
    providerId:PROVIDER_ID,eventId:id,status,providerStatus,
    callbackVerified:false,independentReadbackVerified:false,
    productionActivation:false,recordedAt:new Date().toISOString(),
  };
}
export function createZapierWebhookHandler({
  isMaker=maker,send=fetch,id=()=>crypto.randomUUID(),
}={}){
  return async function zapierWebhook(req){
    if(!['GET','POST'].includes(req.method)){
      return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    }
    if(!isMaker(req))return reply(403,{error:{code:'MAKER_REQUIRED'}});
    const hook=validatedHook(req.env?.ZAPIER_CATCH_HOOK_URL);
    if(req.method==='GET'){
      return reply(200,{
        providerId:PROVIDER_ID,status:'HOLD',hookConfigured:Boolean(hook),
        reason:hook?'READY_FOR_SYNTHETIC_PROBE':'ZAPIER_CATCH_HOOK_MISSING',
        productionActivation:false,
      });
    }
    if(req.headers?.origin!==new URL(req.url).origin){
      return reply(403,{error:{code:'ORIGIN_INVALID'}});
    }
    if(req.headers?.['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/json'){
      return reply(415,{error:{code:'CONTENT_TYPE_INVALID'}});
    }
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length!==1||req.body.confirm!==CONFIRM){
      return reply(422,{error:{code:'CONFIRMATION_REQUIRED'}});
    }
    if(!hook)return reply(503,{
      providerId:PROVIDER_ID,status:'HOLD',reason:'ZAPIER_CATCH_HOOK_MISSING',
      productionActivation:false,
    });
    const artifacts=req.env?.VAOS_ARTIFACTS;
    if(typeof artifacts?.put!=='function'){
      return reply(503,{providerId:PROVIDER_ID,status:'HOLD',
        reason:'AUDIT_STORE_MISSING',productionActivation:false});
    }

    const eventId=id();
    const key='qualification/zapier/'+eventId+'.json';
    try{
      await artifacts.put(key,JSON.stringify(auditDocument({id:eventId,status:'DISPATCH_STARTED'})),
        {httpMetadata:{contentType:'application/json'}});
    }catch{
      return reply(503,{providerId:PROVIDER_ID,status:'HOLD',
        reason:'AUDIT_ADMISSION_FAILED',productionActivation:false});
    }

    // A unique synthetic event only; no sensitive payload or arbitrary user input.
    // Zapier Catch Hooks do not guarantee idempotency. Never automatically retry.
    const payload={
      schemaVersion:'vaos.zapier.synthetic.v1',eventId,
      idempotencyKey:eventId,source:'vaos',eventType:'synthetic_qualification',
      message:'VAOS Zapier webhook handshake test; no business action authorized.',
      productionActivation:false,
    };
    let providerStatus=null;
    let status='OUTCOME_UNKNOWN';
    try{
      const response=await send(hook,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',Accept:'application/json',
          'X-VAOS-Event-ID':eventId,
        },
        body:JSON.stringify(payload),
        redirect:'error',
        signal:AbortSignal.timeout(TIMEOUT_MS),
      });
      providerStatus=response.status;
      status=response.ok?'ACKNOWLEDGED_UNVERIFIED':'PROVIDER_REJECTED';
    }catch{
      status='OUTCOME_UNKNOWN';
    }
    let auditRecorded=false;
    try{
      await artifacts.put(key,JSON.stringify(auditDocument({
        id:eventId,status,providerStatus,
      })),{httpMetadata:{contentType:'application/json'}});
      auditRecorded=true;
    }catch{
      // The admission evidence still exists; never resend after an ambiguous outcome.
    }
    const accepted=status==='ACKNOWLEDGED_UNVERIFIED';
    return reply(accepted&&auditRecorded?200:503,{
      providerId:PROVIDER_ID,status:'HOLD',eventId,providerStatus,
      acknowledgmentVerified:accepted,independentReadbackVerified:false,
      auditRecorded,
      reason:!auditRecorded?'AUDIT_FINALIZATION_FAILED':
        accepted?'INDEPENDENT_ZAPIER_READBACK_REQUIRED':
        status==='PROVIDER_REJECTED'?'ZAPIER_PROVIDER_REJECTED':'ZAPIER_OUTCOME_UNKNOWN',
      productionActivation:false,
    });
  };
}
export default createZapierWebhookHandler();
