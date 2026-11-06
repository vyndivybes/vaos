import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('NVIDIA readiness is a connected, read-only part of the existing BI workspace',()=>{
 const entry=read('./bi-entry.mjs');
 const ui=read('./bi-ontology-readiness-ui.mjs');
 const css=read('./bi-studio.css');
 const worker=read('./cloudflare-worker.mjs');
 assert.match(entry,/mountOntologyReadiness/);
 assert.match(entry,/\/api\/nvidia\/ontology\/readiness/);
 assert.match(worker,/nvidiaOntologyReadiness/);
 assert.match(worker,/\/api\/nvidia\/ontology\/readiness/);
 assert.match(ui,/Check NVIDIA ontology readiness/);
 assert.match(ui,/HOLD/);
 assert.match(ui,/modelAnswersVerified!==false/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
 assert.doesNotMatch(ui,/method\s*:\s*['"]POST/);
 assert.match(css,/\.bi-ontology-commission/);
 assert.match(css,/var\(--vaos-gold/);
});

test('NVIDIA setup agent can guide server provisioning without shipping server binaries',()=>{
 const setup=read('../../.agents/skills/nvidia-ontology-setup/SKILL.md');
 const contract=read('../../.agents/skills/nvidia-ontology-setup/assets/runtime-contract.yaml');
 const instructions=read('../../docs/NVIDIA_AUTO_ONTOLOGY_COMMISSIONING.md');
 assert.match(setup,/nvidia-ontology-setup/);
 assert.match(setup,/Docker Compose/);
 assert.match(contract,/setup|readiness/i);
 assert.match(instructions,/NVIDIA_AUTO_ONTOLOGY_URL/);
 assert.match(instructions,/NVIDIA_AUTO_ONTOLOGY_API_TOKEN/);
 assert.match(instructions,/read-only/i);
});
