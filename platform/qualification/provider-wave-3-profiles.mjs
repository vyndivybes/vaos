const freeze = value => Object.freeze(value);

export const PROVIDER_WAVE_3_PROFILES = freeze([
  freeze({providerId:'n8n',capability:'workflow.orchestrate',runtimeVersion:'2.42.5',
    requiredChecks:freeze(['runtime-ready','pinned-runtime','kill-switch'])}),
  freeze({providerId:'activepieces',capability:'workflow.orchestrate',runtimeVersion:'0.92.2',
    requiredChecks:freeze(['runtime-ready','unauthenticated-api-denied','kill-switch'])}),
  freeze({providerId:'paperless-ngx',capability:'document.archive',runtimeVersion:'3.3.0',
    requiredChecks:freeze(['runtime-ready','authenticated-api','synthetic-document-ingest','kill-switch'])}),
  freeze({providerId:'stirling-pdf',capability:'document.transform',runtimeVersion:'3.1.0',
    requiredChecks:freeze(['runtime-ready','synthetic-pdf-transform','output-pdf-verified','kill-switch'])}),
]);

export function getProviderWave3Profile(providerId) {
  return PROVIDER_WAVE_3_PROFILES.find(profile=>profile.providerId===providerId) ?? null;
}
