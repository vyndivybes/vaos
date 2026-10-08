import { createProviderControlPlane } from '../../platform/execution/provider-control-plane.mjs';

function manifest(providerId,capability){
  return {
    schemaVersion:'vaos.provider.v2',
    providerId,
    displayName:providerId,
    adapterVersion:'qualification',
    capabilities:[capability],
    deploymentModes:['self-hosted','edge'],
    enabled:true,
    qualification:{
      state:'qualified',
      qualifiedCapabilities:[capability],
      evidenceRefs:['qualification:wave1-staging'],
      validUntil:null,
    },
    routing:{
      dataClassifications:['public','internal'],
      riskClasses:['low','medium'],
      licensingAllowed:true,
    },
    security:{
      secretBinding:'not-applicable',
      dataEgress:'none',
      authModes:['local'],
      callbackVerification:'none',
    },
    execution:{
      idempotency:'not-supported',
      retrySemantics:'conditional',
      verificationStrategy:'provider-readback',
      healthProbe:'optional',
      rollbackMethod:'disable-provider',
    },
    operations:{
      retentionClass:'qualification-only',
      dataResidency:['IN'],
      costControl:'ephemeral-ci',
    },
  };
}

for(const [providerId,capability] of [['playwright','browser.automate'],['node-red','event.edge']]){
  const cp=createProviderControlPlane({providers:[manifest(providerId,capability)]});
  const constraints={dataClassification:'internal',riskClass:'low'};
  if(cp.resolve(capability,constraints)?.providerId!==providerId)throw new Error(`${providerId}: pre-kill routing failed`);
  await cp.setCapabilityEnabled({
    providerId,capability,enabled:false,
    authorityRef:'qualification:wave1-staging',
    reason:'kill-switch drill',
  });
  if(cp.resolve(capability,constraints)!==null)throw new Error(`${providerId}: kill switch failed closed`);
  await cp.setCapabilityEnabled({
    providerId,capability,enabled:true,
    authorityRef:'qualification:wave1-staging',
    reason:'restore after drill',
  });
  if(cp.resolve(capability,constraints)?.providerId!==providerId)throw new Error(`${providerId}: restore failed`);
}
console.log('provider kill-switch drills passed');
