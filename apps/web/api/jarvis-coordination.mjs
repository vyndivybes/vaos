import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getDurableControlService} from '../lib/durable-control-provider.mjs';
import {planJarvisCoordination} from '../../../intelligence/jarvis-coordination.mjs';

export function createJarvisCoordinationHandler({getControlService=getDurableControlService,now=()=>Date.now()}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!=='shyamsundhar1982@gmail.com')return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only coordination evidence'));
  if(new URL(req.url,'https://vaos.invalid').search)return res.status(422).json(apiError('VALIDATION_ERROR','No client evidence or dispatch parameters accepted'));
  try {
   const snapshot=await getControlService(req.env).snapshot();
   return res.status(200).json({data:planJarvisCoordination(snapshot,{now:now()})});
  } catch {
   return res.status(503).json(apiError('COORDINATION_EVIDENCE_HOLD','Authoritative workforce evidence unavailable'));
  }
 };
}
export default createJarvisCoordinationHandler();
