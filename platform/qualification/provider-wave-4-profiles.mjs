const freeze=value=>Object.freeze(value);

export const PROVIDER_WAVE_4_PROFILES=freeze([
  freeze({providerId:'windmill',capability:'code.execute',adapterVersion:'1.0.0',implementation:'adapter-implemented',
    livePrerequisites:freeze(['base-url','bearer-credential','approved-script'])}),
  freeze({providerId:'documenso',capability:'document.sign',adapterVersion:'1.0.0',implementation:'adapter-implemented',
    freeMode:'hosted-free-tier',
    livePrerequisites:freeze(['base-url','api-key','synthetic-envelope-recipient','free-plan-confirmed'])}),
  freeze({providerId:'airbyte',capability:'data.replicate',adapterVersion:'1.0.0',implementation:'adapter-implemented',
    freeMode:'blocked-managed-cloud',
    livePrerequisites:freeze(['base-url','bearer-credential','synthetic-connection','free-runtime-confirmed'])}),
  freeze({providerId:'zapier',capability:'integration.saas',adapterVersion:'1.0.0',implementation:'adapter-implemented',
    livePrerequisites:freeze(['catch-hook-url','callback-receipt','task-budget'])}),
  freeze({providerId:'paperwork',capability:'document.extract',adapterVersion:'1.0.0',implementation:'partial-adapter',
    freeMode:'blocked-managed-saas',
    livePrerequisites:freeze(['base-url','bearer-credential','callback-public-key','free-runtime-confirmed'])}),
]);

export function getProviderWave4Profile(providerId){
  return PROVIDER_WAVE_4_PROFILES.find(profile=>profile.providerId===providerId)??null;
}
