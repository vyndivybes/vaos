import {parseCookies,SESSION_COOKIE,verifySessionToken,sha256} from '../lib/auth.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {executePreparedRole,sourceHash} from '../../../agents/workforce/prepare-executor.mjs';
import {exerciseSource,exerciseManifest,EXERCISE_ORDER} from '../../../platform/qualification/workforce-exercise-cases.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const defaultStore=env=>createSupabaseControlStore({url:env?.SUPABASE_URL,serverSecret:env?.VAOS_DB_RPC_SECRET});
export function createWorkforceExerciseHandler({getStore=defaultStore,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>res.status(status).json(data);
  if(!['GET','POST'].includes(req.method))return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
  let session;try{session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);}catch{}
  if(!session)return reply(401,{error:{code:'UNAUTHENTICATED'}});
  if(session.email!==FOUNDER)return reply(403,{error:{code:'FOUNDER_ONLY'}});
  if(req.method==='GET')return reply(200,{data:{schemaVersion:'VAOS_WORKFORCE_EXERCISE_CATALOG_V1',order:EXERCISE_ORDER,cases:exerciseManifest(),modelInvoked:false,qualificationGranted:false}});
  let origin;try{origin=new URL(req.url).origin;}catch{}
  if(!origin||req.headers?.origin!==origin)return reply(403,{error:{code:'ORIGIN_DENIED'}});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return reply(415,{error:{code:'JSON_REQUIRED'}});
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==3
   ||!['requestId','employeeId','variant'].every(k=>Object.hasOwn(b,k))||!UUID.test(b.requestId||'')
   ||!EXERCISE_ORDER.includes(b.employeeId)||!['challenge','corrected'].includes(b.variant))return reply(422,{error:{code:'EXERCISE_REQUEST_INVALID'}});
  const output=executePreparedRole({employeeId:b.employeeId,source:exerciseSource(b.employeeId,b.variant)});
  const requestHash=sha256(JSON.stringify([b.employeeId,b.variant,'role-cases-v1']));
  const run={schemaVersion:'VAOS_PRELAUNCH_RUN_V1',requestId:b.requestId,preparedAt:now().toISOString(),operation:'RUN_ROLE_EXERCISE',variant:b.variant,outputs:[output],businessEffectsExecuted:false};
  try{
   const store=getStore(req.env);
   const write={actorEmail:session.email,requestId:b.requestId,requestHash,output:run};
   const saved=await store.prelaunchOutput(write);
   const persisted=saved?.data;
   if(persisted?.requestId!==b.requestId||persisted.operation!==run.operation||persisted.variant!==b.variant
    ||persisted.businessEffectsExecuted!==false||sourceHash(persisted.outputs)!==sourceHash(run.outputs))throw Error();
   // The existing RPC SELECTs the immutable row after INSERT ON CONFLICT DO
   // NOTHING. A second idempotent round trip reads the exact ID, including
   // older runs outside the startup screen's ten-item history window. No new
   // business effect or output row is created by this replay.
   const readback=await store.prelaunchOutput(write);
   const found=readback?.data;
   if(!found||sourceHash(found)!==sourceHash(persisted))throw Error();
   return reply(200,{data:{...persisted,persistenceVerified:true,qualificationGranted:false}});
  }catch{return reply(503,{error:{code:'EXERCISE_PERSISTENCE_UNVERIFIED',retryWithSameRequestId:true}});}
 };
}
export default createWorkforceExerciseHandler();
