import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createAutomationFabricSupabaseStores} from '../../../platform/persistence/automation-fabric-supabase-stores.mjs';
import {createGovernedHttpTransport} from '../../../platform/execution/governed-http-transport.mjs';
import {createWindmillSyntheticHttpTransport} from '../../../integrations/windmill/synthetic-http-transport.mjs';
import {runScopedWindmillPing} from '../../../platform/execution/windmill-scoped-runtime.mjs';

const OWNER='shyamsundhar1982@gmail.com';
const EXACT_ORIGIN='https://vaos.vayushastr.workers.dev';
const allowOwner=(email,env)=>email===OWNER&&
 typeof env?.VAOS_WINDMILL_EXECUTE_OWNERS==='string'&&
 env.VAOS_WINDMILL_EXECUTE_OWNERS.split(',').map(s=>s.trim().toLowerCase()).includes(OWNER);

async function runProductionScopedPing({env}){
 if(env?.WINDMILL_SCOPED_ENABLED!=='owner-approved-20261010'
    ||env?.WINDMILL_KILL_SWITCH==='true'
    ||env?.WINDMILL_ADMISSION_ENABLED!=='true')
   throw new Error('WINDMILL_SCOPED_HOLD');
 const namespace=env?.WINDMILL_ADMISSION;
 if(typeof namespace?.getByName!=='function')throw new Error('WINDMILL_ADMISSION_MISSING');
 const conf=resolveDurableControlConfig(env);
 const store=createAutomationFabricSupabaseStores({
   url:conf.url,serverSecret:conf.serverSecret,
 });
 const provider=await store.providerState.load('windmill');
 const admission=namespace.getByName('vaos-windmill-global-v1');
 // This transport has exactly one allowed synthetic script and a fixed HTTPS
 // origin, and DOES NOT retry dispatch after an uncertain result.
 const transport=createWindmillSyntheticHttpTransport({
   httpTransport:createGovernedHttpTransport({
     allowedOrigins:['https://app.windmill.dev'],
     maxRequestBytes:1024,maxResponseBytes:8192,
   }),
   maxPolls:30,
 });
 return runScopedWindmillPing({env,provider,admission,transport});
}

/** One owner-only, same-origin, low-risk no-business-effects commissioning call.
 * No arbitrary path, script args, credentials or provider ID accepted from caller.
 */
export function createWindmillScopedRunHandler({run=runProductionScopedPing}={}){
 return async function handler(req,res){
   res.setHeader('Cache-Control','no-store');
   if(req.method!=='POST'){
     res.setHeader('Allow','POST');
     return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));
   }
   const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
   if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
   if(!allowOwner(session.email,req.env))
     return res.status(403).json(apiError('WINDMILL_OWNER_SCOPE_FORBIDDEN','Owner scope not configured'));
   let origin;
   try{origin=new URL(req.url).origin;}catch{origin=null}
   if(origin!==EXACT_ORIGIN||req.headers?.origin!==EXACT_ORIGIN
     ||req.headers?.['x-vaos-csrf-intent']!=='windmill-scoped-ping-v1'
     ||String(req.headers?.['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
     return res.status(403).json(apiError('WINDMILL_ORIGIN_DENIED','Same-origin scoped request required'));
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)
     ||Object.keys(body).length!==1||body.operation!=='RUN_ONE_QUALIFICATION_PING')
     return res.status(422).json(apiError('VALIDATION_ERROR','Only fixed read-only ping is allowed'));
   try{
     const result=await run({env:req.env});
     if(result?.status!=='PASS'||result?.businessWritesAllowed!==false
       ||result?.automaticRetry!==false||result?.maxConcurrentRuns!==1)
       throw new Error('WINDMILL_SCOPED_VERIFICATION_FAILED');
     return res.status(200).json({data:{
       status:'PASS',providerId:'windmill',scriptPath:'f/vaos/qualification_ping',
       providerJobId:result.providerJobId,
       independentProviderReadback:result.independentProviderReadback===true,
       maxConcurrentRuns:1,businessWritesAllowed:false,automaticRetry:false,
     }});
   }catch{
     return res.status(503).json(apiError(
       'WINDMILL_SCOPED_HOLD','Read-only commissioning failed closed; independently reconcile before retry',
     ));
   }
 };
}
export default createWindmillScopedRunHandler();
