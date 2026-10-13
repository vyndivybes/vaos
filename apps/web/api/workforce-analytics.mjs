import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {buildWorkforceAnalytics} from '../../../intelligence/workforce-analytics.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const defaultStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env));
export function createWorkforceAnalyticsHandler({getStore=defaultStore}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
   res.setHeader('Allow','GET');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','Read-only GET required'));
  }
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  try{
   const url=new URL(req.url);
   if([...url.searchParams.keys()].length!==0)throw Error();
  }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Unexpected query parameters'));}
  try{
   const data=buildWorkforceAnalytics(await getStore(req.env).founderWorkforceOverview(session.email));
   return res.status(200).json({data});
  }catch{
   return res.status(503).json(apiError('WORKFORCE_ANALYTICS_UNAVAILABLE',
    'Verified workforce source or founder analytics migration unavailable'));
  }
 };
}
export default createWorkforceAnalyticsHandler();
