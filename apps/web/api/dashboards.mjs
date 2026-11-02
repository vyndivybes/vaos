import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {validateDefinition} from '../bi-model.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createDashboardsHandler({sessionVerifier=verifySessionToken,getStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env))}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const fail=(s,message)=>res.status(s).json({error:{message}});
  if(!['GET','POST'].includes(req.method))return fail(405,'GET or POST required');
  let session;try{session=sessionVerifier(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);}catch{return fail(401,'Sign in required');}
  if(!session)return fail(401,'Sign in required');
  // Matches existing enterprise BI and workforce endpoints. No checker escalation.
  if(session.email!==FOUNDER)return fail(403,'Founder reporting permission required');
  let payload;
  try{
   const url=new URL(req.url);
   if(req.method==='GET'){
    if([...url.searchParams.keys()].some(k=>k!=='id')||url.searchParams.getAll('id').length>1)throw Error('Invalid query');
    const id=url.searchParams.get('id');if(id&&!UUID.test(id))throw Error('Invalid dashboard ID');payload={actorEmail:session.email,action:id?'open':'list',id};
   }else{
    if(req.headers?.origin!==url.origin)return fail(403,'Same-origin request required');
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return fail(415,'JSON required');
    const b=req.body;if(!b||JSON.stringify(b).length>8192||Object.keys(b).some(k=>!['id','revision','visibility','definition'].includes(k))||b.id!==null&&!UUID.test(b.id)||!Number.isSafeInteger(b.revision)||b.revision<0||!['private','authorized'].includes(b.visibility))throw Error('Invalid definition metadata');
    payload={actorEmail:session.email,action:'save',id:b.id??crypto.randomUUID(),revision:b.revision,visibility:b.visibility,definition:validateDefinition(b.definition)};
   }
  }catch(e){return fail(422,e.message);}
  try{return res.status(200).json({data:await getStore(req.env).dashboards(payload)});}catch{return fail(503,'Dashboard storage unavailable, access denied or revision conflict. Reopen before retrying.');}
 };
}
export default createDashboardsHandler();
