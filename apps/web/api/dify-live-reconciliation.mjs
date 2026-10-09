import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {createDifyRunHistoryClient} from '../../../integrations/dify/run-history.mjs';
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createDifyLiveReconciliationHandler({createReader=createDifyRunHistoryClient}={}){
  return async function(req){
    if(req.method!=='GET')return response(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    const principal=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]||'');
    if(!principal||principal.email!=='shyamsundhar1982@gmail.com')
      return response(403,{error:{code:'MAKER_REQUIRED'}});
    if(req.headers?.origin!==new URL(req.url).origin)
      return response(403,{error:{code:'ORIGIN_INVALID'}});
    const result=await createReader({env:req.env}).readIncident();
    return response(200,result);
  };
}
export default createDifyLiveReconciliationHandler();
