import {verifyGitHubQualificationOidc} from '../../../platform/execution/github-oidc-verify.mjs';
import {runStirlingLiveQualification,getStirlingLiveQualificationEvidence} from '../../../platform/execution/stirling-live-qualification.mjs';

const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
}});
export function createStirlingQualificationHandler({
  verify=verifyGitHubQualificationOidc,
  execute=runStirlingLiveQualification,
  getEvidence=getStirlingLiveQualificationEvidence,
}={}){
  return async function handler(req){
    const path=new URL(req.url).pathname;
    if(path==='/api/stirling-qualification/status'){
      if(req.method!=='GET')return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
      try{return reply(200,await getEvidence({env:req.env}))}
      catch{return reply(503,{providerId:'stirling-pdf',status:'HOLD',
        reason:'STIRLING_AUDIT_UNAVAILABLE',productionActivation:false})}
    }
    if(path!=='/api/stirling-qualification/run')return reply(404,{error:{code:'NOT_FOUND'}});
    if(req.method!=='POST')return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    const auth=req.headers?.authorization||'';
    if(!auth.startsWith('Bearer ')||auth.length>13000)return reply(403,{error:{code:'OIDC_REQUIRED'}});
    let identity;
    try{identity=await verify(auth.slice(7))}
    catch{return reply(403,{error:{code:'OIDC_VERIFICATION_FAILED'}})}
    if(req.headers?.['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
      return reply(415,{error:{code:'CONTENT_TYPE_INVALID'}});
    const b=req.body;
    if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==1||
      b.confirm!=='run-synthetic-stirling-cloud-once')
      return reply(422,{error:{code:'CONFIRMATION_REQUIRED'}});
    try{
      const evidence=await execute({env:req.env,githubRunId:identity.runId});
      return reply(evidence.status==='PASS'?200:409,evidence);
    }catch{return reply(503,{providerId:'stirling-pdf',status:'HOLD',
      reason:'STIRLING_LIVE_UNAVAILABLE',productionActivation:false})}
  };
}
export default createStirlingQualificationHandler();
