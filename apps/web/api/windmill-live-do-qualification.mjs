import {verifyWindmillCancellationOidc} from '../../../platform/security/windmill-cancellation-oidc.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {verifyWindmillGithubOidc} from '../../../platform/security/windmill-github-oidc.mjs';

/** Signed GitHub Actions-only drill. Isolated DO ID: no production Windmill
 * dispatch, no provider token, and no access to the real admission slot.
 */
export function createWindmillLiveDoQualificationHandler({
  verifyIdentity=verifyWindmillGithubOidc,verifyCancellationIdentity=verifyWindmillCancellationOidc,
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
    const cancellation=typeof req.body?.phase==='string'&&req.body.phase.startsWith('cancellation-');
    let principal;
    try{principal=await (cancellation?verifyCancellationIdentity:verifyIdentity)(auth.slice(7));}
    catch{return res.status(401).json(apiError('UNAUTHENTICATED','Valid GitHub workflow identity required'))}
    if(cancellation){
      const phase=req.body.phase.slice('cancellation-'.length);
      const expected=['bind','cancel'].includes(phase)?['phase','providerJobId']:phase==='finish'?['phase','providerJobId','canceled','success']:['phase'];
      if(!['capabilities','start','bind','cancel','finish','snapshot'].includes(phase)||
        Object.keys(req.body).length!==expected.length||expected.some(k=>!Object.hasOwn(req.body,k))||
        (expected.includes('providerJobId')&&!/^[A-Za-z0-9-]{8,90}$/.test(req.body.providerJobId||''))||
        (phase==='finish'&&(req.body.canceled!==true||req.body.success!==false)))
        return res.status(422).json(apiError('VALIDATION_ERROR','Valid cancellation phase required'));
      try{
        const stub=req.env.WINDMILL_ADMISSION.getByName('vaos-windmill-cancellation-qualification-v1');
        const value=await stub.cancellationQualification({...req.body,phase,runId:principal.runId,runAttempt:principal.runAttempt});
        if(value?.productionActivation!==false||value.windmillCalls!==0)throw new Error('UNSAFE_DRILL');
        return res.status(200).json({data:value});
      }catch{return res.status(503).json(apiError('WINDMILL_CANCELLATION_DRILL_UNAVAILABLE','Isolated cancellation could not be verified'))}
    }
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).length!==1||!['capabilities','start','status','restart','restart-status','finish'].includes(req.body.phase)){
      return res.status(422).json(apiError('VALIDATION_ERROR','Valid qualification phase required'));
    }
    try{
      const namespace=req.env?.WINDMILL_ADMISSION;
      if(typeof namespace?.getByName!=='function')throw new Error('NO_BINDING');
      const stub=namespace.getByName('vaos-windmill-selftest-'+principal.runId+'-'+principal.runAttempt);
      const value=req.body.phase==='capabilities'
        ?await stub.restartCapability()
        :req.body.phase==='start'
        ?await stub.startQualification(principal.runId)
        :req.body.phase==='status'
          ?await stub.alarmStatus(principal.runId)
          :req.body.phase==='restart'
            ?await stub.beginRestartQualification(principal.runId)
            :req.body.phase==='restart-status'
              ?await stub.restartQualificationStatus(principal.runId)
              :await stub.finishQualification(principal.runId);
      if(value?.productionActivation!==false||
        (req.body.phase==='start'&&value.status!=='STARTED')||
        (req.body.phase==='finish'&&value.status!=='PASS')||
        (req.body.phase==='status'&&!['WAITING','ALARM_OBSERVED'].includes(value.status))||
        (req.body.phase==='restart-status'&&!['WAITING','RESTART_VERIFIED'].includes(value.status))||
        (req.body.phase==='capabilities'&&(
          value.status!=='RESTART_DRILL_READY'||value.schemaVersion!=='vaos.windmill.restart-qualification.v1'))){
        throw new Error('QUALIFICATION_FAILED');
      }
      return res.status(200).json({data:value});
    }catch{
      return res.status(503).json(apiError('WINDMILL_LIVE_DRILL_UNAVAILABLE','Isolated qualification could not be verified'));
    }
  };
}
export default createWindmillLiveDoQualificationHandler();
