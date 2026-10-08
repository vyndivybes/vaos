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
    assert.equal(manifest.enabled,false,`${id}: enabled must stay false at merge`);
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

test('Cloudflare deployment workflows remain present and obsolete Vercel runtime config stays absent',()=>{
  assert.equal(exists('.github/workflows/cloudflare-deploy.yml'),true);
  assert.equal(exists('.github/workflows/cloudflare-smoke.yml'),true);
  assert.equal(exists('apps/web/vercel.json'),false);
});
