import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';

const hasScope=(email,allowlist)=>
  typeof allowlist==='string'&&allowlist.split(',').some(v=>v.trim().toLowerCase()===email?.toLowerCase());

/** Read-only Cloudflare binding probe. Never grants dispatch or exposes tokens. */
export function createWindmillRuntimeStatusHandler(){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
    }
    const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
    if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Authentication required'));
    if(!hasScope(session.email,req.env?.VAOS_WINDMILL_STATUS_READERS)){
      return res.status(403).json(apiError('WINDMILL_STATUS_FORBIDDEN','Read access not assigned'));
    }
    try{
      const namespace=req.env?.WINDMILL_ADMISSION;
      if(typeof namespace?.getByName!=='function')throw new Error('binding unavailable');
      const stub=namespace.getByName('vaos-windmill-global-v1');
      const status=await stub.status();
      if(status?.schemaVersion!=='vaos.windmill.durable-admission.v1'||
        status.productionActivation!==false)throw new Error('invalid admission status');
      return res.status(200).json({data:{
        bindingReady:true,
        routingEnabled:false,
        operatorAdmissionEnabled:req.env?.WINDMILL_ADMISSION_ENABLED==='true',
        maxConcurrentRuns:status.maxConcurrentRuns,
        queuedRuns:status.queuedRuns,
        activeJobState:status.active?.state||null,
        auditCount:status.auditCount,
      }});
    }catch{
      return res.status(503).json(apiError('WINDMILL_ADMISSION_UNAVAILABLE','Windmill admission coordinator unavailable'));
    }
  };
}
export default createWindmillRuntimeStatusHandler();
