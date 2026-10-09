import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {createDifyExactRunVerifier} from '../../../integrations/dify/exact-run-verifier.mjs';
const respond=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createDifyExactVerificationHandler({createVerifier=createDifyExactRunVerifier}={}){
 return async function(req){
   if(req.method!=='GET')return respond(405,{error:{code:'METHOD_NOT_ALLOWED'}});
   const principal=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]||'');
   if(!principal||principal.email!=='shyamsundhar1982@gmail.com')
     return respond(403,{error:{code:'MAKER_REQUIRED'}});
   if(req.headers?.origin!==new URL(req.url).origin)
     return respond(403,{error:{code:'ORIGIN_INVALID'}});
   const result=await createVerifier({env:req.env}).verifyExistingRun();
   return respond(200,result);
 };
}
export default createDifyExactVerificationHandler();
