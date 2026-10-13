import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {readSourceAudit} from '../lib/jarvis-source-audit.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
export function createJarvisSourceAuditHandler({read=readSourceAudit}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only graph qualification'));
  if(req.env?.VAOS_VOICE_CONTROL!=='founder-readonly-browser-v1')
   return res.status(409).json(apiError('GRAPH_NOT_COMMISSIONED','Founder read-only control not enabled'));
  if(!req.env?.SUPABASE_URL||!req.env?.VAOS_DB_RPC_SECRET)
   return res.status(503).json(apiError('GRAPH_SOURCE_HOLD','Authorized source audit unavailable'));
  try{
   const audit=await read({url:req.env.SUPABASE_URL,
    serverSecret:req.env.VAOS_DB_RPC_SECRET,fetchImpl:globalThis.fetch});
   return res.status(200).json({data:audit});
  }catch{
   return res.status(503).json(apiError('GRAPH_SOURCE_HOLD','Verified source audit unavailable'));
  }
 };
}
export default createJarvisSourceAuditHandler();
