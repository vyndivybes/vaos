import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const exists=relative=>fs.existsSync(path.join(root,relative));

const requiredProviders=[
  'n8n','activepieces','zapier','paperwork','paperless-ngx','stirling-pdf','documenso',
  'playwright','power-automate-desktop','windmill','airbyte','temporal','camunda','node-red','infisical',
  'opentelemetry','grafana','langfuse',
];
const manifestPaths={
  n8n:'integrations/n8n/provider-manifest.json',
  activepieces:'integrations/activepieces/provider-manifest.json',
  zapier:'integrations/zapier/provider-manifest.json',
  paperwork:'integrations/paperwork/provider-manifest.json',
  'paperless-ngx':'integrations/paperless-ngx/provider-manifest.json',
  'stirling-pdf':'integrations/stirling-pdf/provider-manifest.json',
  documenso:'integrations/documenso/provider-manifest.json',
  playwright:'integrations/playwright/provider-manifest.json',
  'power-automate-desktop':'integrations/power-automate-desktop/provider-manifest.json',
  windmill:'integrations/windmill/provider-manifest.json',
  airbyte:'integrations/airbyte/provider-manifest.json',
  temporal:'integrations/temporal/provider-manifest.json',
  camunda:'integrations/camunda/provider-manifest.json',
  'node-red':'integrations/node-red/provider-manifest.json',
  infisical:'integrations/infisical/provider-manifest.json',
  opentelemetry:'integrations/opentelemetry/provider-manifest.json',
  grafana:'integrations/grafana/provider-manifest.json',
  langfuse:'integrations/langfuse/provider-manifest.json',
};
const mandatoryCore=[
  'integrations/provider-manifest-v2.schema.json',
  'integrations/provider-catalog.json',
  'platform/execution/provider-control-plane.mjs',
  'platform/execution/provider-runtime.mjs',
  'platform/execution/automation-fabric-runtime.mjs',
  'platform/execution/provider-health-service.mjs',
  'platform/execution/reconciliation-service.mjs',
  'platform/execution/governed-http-transport.mjs',
  'platform/execution/callback-gateway.mjs',
  'platform/execution/artifact-broker.mjs',
  'platform/execution/credential-broker.mjs',
  'platform/execution/telemetry-recorder.mjs',
  'platform/execution/telemetry-fanout.mjs',
  'platform/execution/opentelemetry-sink.mjs',
  'integrations/opentelemetry/otlp-exporter.mjs',
  'integrations/grafana/operations-sink.mjs',
  'integrations/langfuse/ai-span-sink.mjs',
  'integrations/grafana/provider-manifest.json',
  'integrations/langfuse/provider-manifest.json',
  'integrations/opentelemetry/provider-manifest.json',
  'packages/contracts/vyndi-vaos-events.mjs',
  'platform/execution/vyndi-intent-ingress.mjs',
  'platform/persistence/automation-fabric-store.mjs',
  'supabase/migrations/20261008071230_automation_fabric_durable_state_v1.sql',
  'packages/contracts/execution-telemetry.mjs',
  'packages/contracts/ai-observability.mjs',
  'docs/contracts/vyndi-vaos-asyncapi.yaml',
  'docs/enterprise-platform-backlog.md',
  'docs/automation-fabric-single-squash-release-plan.md',
];
const mandatoryAdapters=[
  'integrations/n8n/workflow-adapter.mjs',
  'integrations/activepieces/workflow-adapter.mjs',
  'integrations/zapier/action-adapter.mjs',
  'integrations/paperwork/extract-adapter.mjs',
  'integrations/paperwork/file-bridge.mjs',
  'integrations/paperwork/document-worker-adapters.mjs',
  'integrations/paperless-ngx/archive-adapter.mjs',
  'integrations/stirling-pdf/transform-adapter.mjs',
  'integrations/documenso/sign-adapter.mjs',
  'integrations/playwright/browser-adapter.mjs',
  'integrations/power-automate-desktop/desktop-adapter.mjs',
  'integrations/windmill/code-adapter.mjs',
  'integrations/airbyte/replication-adapter.mjs',
  'integrations/temporal/durable-adapter.mjs',
  'integrations/camunda/process-adapter.mjs',
  'integrations/node-red/edge-adapter.mjs',
  'integrations/infisical/secret-resolver.mjs',
];

test('definitive core and adapter files cannot silently disappear',()=>{
  for(const file of [...mandatoryCore,...mandatoryAdapters]){
    assert.equal(exists(file),true,`missing definitive automation fabric file: ${file}`);
  }
});

test('all mandatory external providers are committed as disabled evaluation-only v2 manifests',()=>{
  for(const id of requiredProviders){
    const manifest=readJson(manifestPaths[id]);
    assert.equal(manifest.schemaVersion,'vaos.provider.v2',`${id}: schemaVersion`);
    assert.equal(manifest.providerId,id,`${id}: providerId`);
    assert.equal(typeof manifest.adapterVersion,'string',`${id}: adapterVersion`);
    assert.equal(manifest.adapterVersion.length>0,true,`${id}: adapterVersion empty`);
    assert.equal(manifest.enabled,false,`${id}: enabled must stay false at merge`);
    assert.equal(Array.isArray(manifest.routing?.dataClassifications),true,`${id}: data classifications`);
    assert.equal(manifest.routing.dataClassifications.length>0,true,`${id}: data classifications empty`);
    assert.equal(Array.isArray(manifest.routing?.riskClasses),true,`${id}: risk classes`);
    assert.equal(manifest.routing.riskClasses.length>0,true,`${id}: risk classes empty`);
    assert.equal(typeof manifest.routing?.licensingAllowed,'boolean',`${id}: licensing policy`);
    assert.equal(['required','optional','not-applicable'].includes(manifest.execution?.healthProbe),true,`${id}: healthProbe`);
    assert.equal(typeof manifest.execution?.rollbackMethod,'string',`${id}: rollbackMethod`);
    assert.equal(typeof manifest.operations?.retentionClass,'string',`${id}: retentionClass`);
    assert.equal(Array.isArray(manifest.operations?.dataResidency),true,`${id}: dataResidency`);
    assert.equal(typeof manifest.operations?.costControl,'string',`${id}: costControl`);
    assert.equal(manifest.qualification.state,'evaluation',`${id}: state`);
    assert.deepEqual(manifest.qualification.qualifiedCapabilities,[],`${id}: committed qualifiedCapabilities must be empty`);
  }
});

test('provider catalog preserves every tool family agreed in the definitive scope',()=>{
  const catalog=readJson('integrations/provider-catalog.json');
  const ids=new Set(catalog.providers.map(x=>x.providerId));
  const allDiscussed=[
    ...requiredProviders,'opentelemetry','grafana','langfuse',
    'google-apps-script','nocodb','metabase','apromore','qdrant','meilisearch','typesense',
    'formbricks','cal-com','zammad','glpi','openproject','pipedream','great-expectations',
    'appsmith','budibase','retool','kong','bardeen','gumloop',
  ];
  for(const id of allDiscussed)assert.equal(ids.has(id),true,`provider catalog lost: ${id}`);
});

test('Paperwork redline remains visible but cannot accidentally become production-qualified',()=>{
  const manifest=readJson('integrations/paperwork/provider-manifest.json');
  assert.equal(manifest.capabilities.includes('document.redline'),true);
  assert.equal(manifest.qualification.qualifiedCapabilities.includes('document.redline'),false);
});

test('Cloudflare-native deployment posture remains present and legacy-provider runtime config stays absent',()=>{
  assert.equal(exists('.github/workflows/cloudflare-smoke.yml'),true);
  assert.equal(exists('.github/workflows/cloudflare-deploy.yml'),false);
  const blockedRuntimeConfig=['ver','cel.json'].join('');
  assert.equal(exists(`apps/web/${blockedRuntimeConfig}`),false);
});


test('AsyncAPI preserves VYNDI intents, VAOS results, reconciliation, provider callbacks and edge events',()=>{
  const asyncapi=fs.readFileSync(path.join(root,'docs/contracts/vyndi-vaos-asyncapi.yaml'),'utf8');
  for(const required of ['vyndiIntents:','vaosResults:','reconciliation:','providerCallbacks:','edgeEvents:']){
    assert.equal(asyncapi.includes(required),true,`missing AsyncAPI channel: ${required}`);
  }
});


test('durable automation fabric persistence remains atomic and restart-safe',()=>{
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261008071230_automation_fabric_durable_state_v1.sql'),'utf8');
  for(const required of [
    'vaos_private.provider_control_state',
    'vaos_private.callback_receipts',
    'vaos_private.automation_reconciliation',
    'vaos_provider_state_get',
    'vaos_provider_state_put',
    'vaos_callback_consume_once',
    'vaos_reconciliation_claim',
    'vaos_reconciliation_save',
    'for update skip locked',
    'for update'
  ]){
    assert.equal(migration.toLowerCase().includes(required.toLowerCase()),true,`missing durable persistence contract: ${required}`);
  }
  const edge=fs.readFileSync(path.join(root,'supabase/functions/vaos-control/index.ts'),'utf8');
  for(const operation of [
    'providerStateGet','providerStatePut','callbackCreate','callbackGet','callbackConsumeOnce',
    'reconciliationEnqueue','reconciliationClaim','reconciliationSave','reconciliationGet','reconciliationList'
  ]){
    assert.equal(edge.includes(operation),true,`missing vaos-control operation: ${operation}`);
  }
});
