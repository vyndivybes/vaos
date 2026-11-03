import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const providerIds=['metabase','qdrant','meilisearch','typesense','apromore','great-expectations'];
const cap={metabase:'analytics.bi',qdrant:'search.semantic',meilisearch:'search.fulltext',typesense:'search.fulltext',apromore:'process.mine','great-expectations':'data.quality'};
const load=async(path)=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
test('all six insight-provider manifests conform to disabled candidate-only v2 safety profile',async()=>{
 for(const id of providerIds){
  const m=await load('../'+id+'/provider-manifest.json');
  assert.equal(m.schemaVersion,'vaos.provider.v2',id);
  assert.equal(m.providerId,id,id);
  assert.equal(m.enabled,false,id);
  assert.equal(m.qualification.state,'candidate',id);
  assert.deepEqual(m.qualification.qualifiedCapabilities,[],id);
  assert.deepEqual(m.qualification.evidenceRefs,[],id);
  assert.deepEqual(m.capabilities,[cap[id]],id);
  assert.equal(m.operations.costControl,'zero-cost-only-no-auto-provisioning',id);
  assert.equal(m.security.dataEgress,['apromore','great-expectations'].includes(id)?'none':'controlled',id);
 }
});
test('catalog never advertises six candidate providers as production enabled',async()=>{
 const catalog=await load('../provider-catalog.json');
 for(const id of providerIds){
  const rows=catalog.providers.filter(p=>p.providerId===id);
  assert.equal(rows.length,1,id);
  assert.equal(rows[0].productionRouting,'disabled-pending-independent-qualification',id);
  assert.ok(['adapter-implemented','offline-evidence-bridge'].includes(rows[0].implementation),id);
  assert.equal(rows[0].capabilities.length,1,id);
  assert.equal(rows[0].capabilities[0],cap[id],id);
 }
});
