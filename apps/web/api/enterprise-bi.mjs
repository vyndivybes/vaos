import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';

import {businessDay} from '../bi-model.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const storeOf=env=>createSupabaseControlStore(resolveDurableControlConfig(env));
const EMPLOYEES=new Set([
 'orchestrator','project','vibpe','risk','knowledge','release','qa','commercial',
 'procurement','inventory','production','maintenance','finance','people',
 'engineering-configuration','security',
]);
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;

/** Founder only; a signed, read-only VYNDI OS aggregate, not an AI-employee execution claim. */
export function createEnterpriseBiHandler({
 getStore=storeOf,sessionVerifier=verifySessionToken,
 bridgeFactory=createVyndiReadBridgeClient,
}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  const session=sessionVerifier(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  let from,to,employeeId,limit,offset,sourceTable;
  try{
   const query=new URL(req.url).searchParams;
   if([...query.keys()].some(k=>!['from','to','employee','limit','offset','source','primary','crm'].includes(k))||
     [...query.keys()].some(k=>query.getAll(k).length!==1))throw Error();
   from=query.get('from');to=query.get('to');employeeId=query.get('employee')||'all';
   sourceTable=query.get('source');
   if(sourceTable&&(employeeId==='all'||!/^[_a-z][_a-z0-9]{0,95}$/.test(sourceTable)))throw Error();
   const rawLimit=query.get('limit')||'30',rawOffset=query.get('offset')||'0';
   if(!/^\d+$/.test(rawLimit)||!/^\d+$/.test(rawOffset))throw Error();
   limit=Number(rawLimit);offset=Number(rawOffset);
   if(!validDay(from)||!validDay(to)||from>to||
     to>businessDay()||
     Date.parse(to)-Date.parse(from)>366*86400000||
     (employeeId!=='all'&&!EMPLOYEES.has(employeeId))||
     !Number.isSafeInteger(limit)||limit<1||limit>100||
     !Number.isSafeInteger(offset)||offset<0||offset>5000)throw Error();
  }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Valid employee, from, to and bounded pagination required'));}
  if(!req.env?.VYNDI||typeof req.env.VYNDI.fetch!=='function')
   return res.status(503).json(apiError('VYNDI_SOURCE_UNAVAILABLE','Signed VYNDI service binding unavailable'));
  try{
   const client=bridgeFactory({signer:getStore(req.env),serviceBinding:req.env.VYNDI});
   const evidence=await client.execute({id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI',
    payload:{missionId:'founder:enterprise-bi',from,to,employeeId,limit,offset,
     ...(sourceTable?{sourceTable}:{}),...(new URL(req.url).searchParams.get('primary')==='1'?{primaryOnly:true}:{}),...(new URL(req.url).searchParams.get('crm')==='1'?{crm:true}:{})}});
   const data=evidence?.data;
   if(data?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||data.readOnly!==true||
      data.period?.from!==from||data.period?.to!==to||data.scope!==employeeId||
      !Array.isArray(data.departments))throw Error('INVALID_ENTERPRISE_SOURCE');
   return res.status(200).json({data});
  }catch{
   return res.status(503).json(apiError('ENTERPRISE_BI_HOLD',
    'Signed authoritative departmental records are unavailable. No synthetic counts or forecasts produced.'));
  }
 };
}
export default createEnterpriseBiHandler();
