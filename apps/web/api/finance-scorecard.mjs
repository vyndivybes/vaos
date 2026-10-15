import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';
import {projectFinanceActuals} from '../../../intelligence/financial-scorecard.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const storeOf=env=>createSupabaseControlStore(resolveDurableControlConfig(env));
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function createFinanceScorecardHandler({getStore=storeOf}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','Read-only GET required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  let from,to;
  try{
   const query=new URL(req.url).searchParams;
   if(query.size!==2||[...query.keys()].some(x=>!['from','to'].includes(x)))throw Error();
   from=query.get('from');to=query.get('to');
   if(!validDay(from)||!validDay(to)||from>to||to>new Date().toISOString().slice(0,10)||
      Date.parse(to)-Date.parse(from)>366*86400000)throw Error();
  }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Bounded from/to required'));}
  if(!req.env?.VYNDI||typeof req.env.VYNDI.fetch!=='function'){
   return res.status(503).json(apiError('VYNDI_SOURCE_UNAVAILABLE','Signed VYNDI service binding unavailable'));
  }
  try{
   const client=createVyndiReadBridgeClient({signer:getStore(req.env),serviceBinding:req.env.VYNDI});
   const job={id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:'FINANCE.OBSERVE_STATEMENTS',payload:{missionId:'finance:founder-scorecard',fromDate:from,toDate:to}};
   const evidence=await client.execute(job);
   return res.status(200).json({data:projectFinanceActuals(evidence,{from,to})});
  }catch{
   return res.status(503).json(apiError('FINANCE_SCORECARD_HOLD',
     'Posted financial statement source unavailable, unqualified or not reconciled.'));
  }
 };
}
export default createFinanceScorecardHandler();
