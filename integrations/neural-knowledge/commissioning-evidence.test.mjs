import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NEUTRAL_GRAPH_SOURCES} from './neutral-schema.mjs';

test('commissioned reference source pins match reviewed R2 manifest without consuming a Worker variable',()=>{
 const manifest=JSON.parse(readFileSync(new URL('./commissioning-evidence-20261106.json',import.meta.url),'utf8'));
 const wrangler=JSON.parse(readFileSync(new URL('../../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(Object.hasOwn(wrangler.vars,'VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES'),false);
 const flags=JSON.parse(wrangler.vars.VAOS_FEATURE_FLAGS);
 const hashes=JSON.parse(flags.VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES);
 assert.equal(flags.VAOS_NEURAL_KNOWLEDGE_CONTROL,'founder-readonly-v1');
 assert.deepEqual(Object.keys(hashes).sort(),['brain-atlas','graphify','llm-wiki']);
 for(const source of manifest.sources){
  assert.ok(NEUTRAL_GRAPH_SOURCES.includes(source.id));
  assert.equal(hashes[source.id],source.sha256);
  assert.match(source.sha256,/^[a-f0-9]{64}$/);
  assert.equal(source.live,false);
  assert.equal(source.status,'R2_SNAPSHOT_HASH_VERIFIED');
  assert.ok(source.nodes>0);
 }
 assert.equal(manifest.approvalsTransferred,false);
 assert.equal(manifest.independentVerification,false);
 for(const id of ['vyndi-vedm','graphiti','obsidian','dify']){
  assert.ok(manifest.holds.some(hold=>hold.id===id));
 }
});
