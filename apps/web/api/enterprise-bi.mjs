import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const STAFF=new Set(['orchestrator','project','vibpe','risk','knowledge','release','qa','commercial','procurement',
 'inventory','production','maintenance','finance','people','engineering-configuration','security']);
const createStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env));
export function createEnterpriseBiHandler({getStore=createStore}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  let from,to,employee,offset,limit;
  try{
   const q=new URL(req.url).searchParams;
   if([...q.keys()].some(x=>!['from','to','employee','offset','limit'].includes(x))||!q.has('from')||!q.has('to'))throw Error();
   from=q.get('from');to=q.get('to');employee=q.get('employee')||'all';
   offset=Number(q.get('offset')||'0');limit=Number(q.get('limit')||'50');
   if(!/^\d{4}-\d\d-\d\d$/.test(from)||!/^\d{4}-\d\d-\d\d$/.test(to)||
     !Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||from>to||
     to>new Date().toISOString().slice(0,10)||Date.parse(to)-Date.parse(from)>366*86400000||
     !Number.isSafeInteger(offset)||offset<0||offset>5000||
     !Number.isSafeInteger(limit)||limit<1||limit>100||
     (employee!=='all'&&!STAFF.has(employee)))throw Error();
  }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Choose a valid employee and dates, no more than 366 days apart'));}
  if(!req.env?.VYNDI||typeof req.env.VYNDI.fetch!=='function')return res.status(503).json(apiError(
   'VYNDI_SERVICE_UNAVAILABLE','VYNDI signed service binding unavailable'));
  try{
   const client=createVyndiReadBridgeClient({signer:getStore(req.env),serviceBinding:req.env.VYNDI});
   const result=await client.execute({
    id:crypto.randomUUID(),intentId:crypto.randomUUID(),actionType:'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI',
    payload:{missionId:'founder:enterprise-bi',employeeId:employee,from,to,offset,limit}
   });
   const data=result.data;
   if(data?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||data?.readOnly!==true||!Array.isArray(data.departments))
    throw Error('SOURCE_CONTRACT');
   return res.status(200).json({data});
  }catch{return res.status(503).json(apiError('ENTERPRISE_BI_SOURCE_HOLD',
   'Signed VYNDI intelligence source unavailable or not commissioned. No performance metrics inferred.'));}
 };
}
export default createEnterpriseBiHandler();
