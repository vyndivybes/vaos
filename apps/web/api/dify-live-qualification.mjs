import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {createDifyQualificationClient} from '../../../integrations/dify/qualification-client.mjs';
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createDifyLiveQualificationHandler({createClient=createDifyQualificationClient}={}){
  return async function difyLiveQualification(req){
    if(req.method!=='POST')return response(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    const token=parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]||'';
    const principal=verifySessionToken(token);
    if(!principal||principal.email!=='shyamsundhar1982@gmail.com')return response(403,{error:{code:'MAKER_REQUIRED'}});
    const origin=req.headers?.origin;
    if(origin!==new URL(req.url).origin)return response(403,{error:{code:'ORIGIN_INVALID'}});
    if(req.headers?.['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return response(415,{error:{code:'CONTENT_TYPE_INVALID'}});
    const input=req.body;
    if(!input||typeof input!=='object'||Object.keys(input).length!==1||input.confirm!=='run-synthetic-dify-once')return response(422,{error:{code:'CONFIRMATION_REQUIRED'}});
    const payload={provider:'activepieces',event_type:'synthetic_qualification',evidence_url:'https://github.com/vyndivybes/vaos/actions/runs/37928775640',commit_sha:'7ca10821419f7fd315f8bae4f1591e7605dd282b',run_id:'37928775640'};
    const result=await createClient({env:req.env}).qualify(payload);
    // Never return model output, credentials, or any independent PASS without GitHub readback.
    return response(200,{providerId:'dify',status:result.status,reason:result.reason,difyRunId:result.difyRunId||null,httpStatus:result.httpStatus||null,productionActivation:false});
  };
}
export default createDifyLiveQualificationHandler();
