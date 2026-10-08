import { ingestProviderLiveEvidence, validateProviderLiveEvidence } from './provider-live-evidence.mjs';

const CONTRACT_CHECKS=['manifest-v2','secret-resolver-suite','least-privilege-binding','secret-nondisclosure'];

function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(value,name){if(typeof value!=='string'||!value.trim())throw fail('INFISICAL_WAVE2_INGESTION_INVALID','INFISICAL_WAVE2_INGESTION_INVALID:'+name);return value.trim()}

function assertWave2(bundle){
  const validated=validateProviderLiveEvidence(bundle);
  if(validated.waveId!=='provider-wave-2'||validated.providerId!=='infisical'||validated.capability!=='secret.broker'){
    throw fail('INFISICAL_WAVE2_EVIDENCE_INVALID');
  }
  return validated;
}

export async function ingestInfisicalWave2Evidence({
  engine,
  liveBundle,
  productionBundle=null,
  ownerApprovalRef=null,
}={}){
  if(!engine||typeof engine.recordEvidence!=='function'||typeof engine.assess!=='function')throw fail('INFISICAL_WAVE2_ENGINE_REQUIRED');
  const live=assertWave2(liveBundle);
  const authorityRef='github-actions:'+live.source.runId;

  for(const checkId of CONTRACT_CHECKS){
    await engine.recordEvidence({
      providerId:'infisical',
      capability:'secret.broker',
      checkId,
      outcome:'pass',
      evidenceClass:'automated',
      evidenceRefs:[
        'github-actions:'+live.source.runId+':infisical:contract-'+checkId,
        live.source.runUrl,
      ],
      authorityRef,
    });
  }

  await ingestProviderLiveEvidence({engine,bundle:live,authorityRef});

  if(productionBundle){
    const production=assertWave2(productionBundle);
    await ingestProviderLiveEvidence({
      engine,
      bundle:production,
      authorityRef:'github-actions:'+production.source.runId,
    });
  }

  if(ownerApprovalRef){
    const approval=req(ownerApprovalRef,'ownerApprovalRef');
    await engine.recordEvidence({
      providerId:'infisical',
      capability:'secret.broker',
      checkId:'owner-approval',
      outcome:'pass',
      evidenceClass:'manual',
      evidenceRefs:[approval],
      authorityRef:approval,
    });
  }

  return Object.freeze({assessment:engine.assess('infisical','secret.broker')});
}

export async function qualifyInfisicalIfReady({engine,authorityRef,reason}={}){
  if(!engine||typeof engine.assess!=='function'||typeof engine.qualify!=='function')throw fail('INFISICAL_WAVE2_ENGINE_REQUIRED');
  authorityRef=req(authorityRef,'authorityRef');
  reason=req(reason,'reason');
  const assessment=engine.assess('infisical','secret.broker');
  if(!assessment?.readyForQualification)throw fail('INFISICAL_WAVE2_QUALIFICATION_INCOMPLETE');
  return engine.qualify({
    providerId:'infisical',
    capability:'secret.broker',
    authorityRef,
    reason,
  });
}
