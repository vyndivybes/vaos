import {apiError} from '../lib/api-contracts.mjs';
import {verifyWindmillGithubOidc} from '../../../platform/security/windmill-github-oidc.mjs';

/** Signed GitHub Actions-only drill. Isolated DO ID: no production Windmill
 * dispatch, no provider token, and no access to the real admission slot.
 */
export function createWindmillLiveDoQualificationHandler({
  verifyIdentity=verifyWindmillGithubOidc,
}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){
      res.setHeader('Allow','POST');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));
    }
    const auth=req.headers?.authorization;
    if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9._-]{100,16000}$/.test(auth)){
      return res.status(401).json(apiError('UNAUTHENTICATED','Valid GitHub workflow identity required'));
    }
    let principal;
    try{principal=await verifyIdentity(auth.slice(7));}
    catch{return res.status(401).json(apiError('UNAUTHENTICATED','Valid GitHub workflow identity required'))}
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).length!==1||!['start','finish'].includes(req.body.phase)){
      return res.status(422).json(apiError('VALIDATION_ERROR','Valid qualification phase required'));
    }
    try{
      const namespace=req.env?.WINDMILL_ADMISSION;
      if(typeof namespace?.getByName!=='function')throw new Error('NO_BINDING');
      const stub=namespace.getByName('vaos-windmill-selftest-'+principal.runId+'-'+principal.runAttempt);
      const value=req.body.phase==='start'
        ?await stub.startQualification(principal.runId)
        :await stub.finishQualification(principal.runId);
      if(value?.productionActivation!==false||
        (req.body.phase==='start'&&value.status!=='STARTED')||
        (req.body.phase==='finish'&&value.status!=='PASS')){
        throw new Error('QUALIFICATION_FAILED');
      }
      return res.status(200).json({data:value});
    }catch{
      return res.status(503).json(apiError('WINDMILL_LIVE_DRILL_UNAVAILABLE','Isolated qualification could not be verified'));
    }
  };
}
export default createWindmillLiveDoQualificationHandler();
