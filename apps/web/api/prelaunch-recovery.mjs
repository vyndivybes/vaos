import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
export function createPrelaunchRecoveryHandler({getStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env))}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:{code:'METHOD_NOT_ALLOWED'}});
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json({error:{code:'UNAUTHENTICATED'}});
  if(session.email!=='shyamsundhar1982@gmail.com')return res.status(403).json({error:{code:'FOUNDER_ONLY'}});
  try{const data=await getStore(req.env).prelaunchRecovery(session.email);return res.status(200).json({data:{schemaVersion:'VAOS_PRELAUNCH_RECOVERY_V1',...data,
   restoreTarget:'FRESH_ISOLATED_ENVIRONMENT_ONLY',productionRestoreAuthorized:false,
   notice:'Inventory records the existing backup evidence and its scope. A backup timestamp is not a promise that the latest changes are included. Protected recovery keys remain outside this application.'}});}
  catch{return res.status(503).json({error:{code:'RECOVERY_INVENTORY_UNAVAILABLE'}});}
 };
}
export default createPrelaunchRecoveryHandler();
