import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareEvidenceTopology} from './bi-evidence-topology.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('source evidence map distinguishes measured, empty, and unobserved instead of inventing zeros',()=>{
 const map=prepareEvidenceTopology([
  {agent:'finance',label:'finance',value:7,state:'REAL',source:'signed_finance_ledger'},
  {agent:'production',label:'production',value:0,state:'EMPTY',source:'signed_mfg_ledger'},
  {agent:'crm',label:'crm',value:null,state:'UNAVAILABLE',source:'vyndi_crm_activities',reason:'Source not observed'},
  {agent:'hr',label:'hr',value:42,state:'UNAVAILABLE',source:'unverified',reason:'Held'},
 ]);
 assert.deepEqual([map.observed,map.empty,map.unavailable,map.total],[1,1,2,4]);
 assert.equal(map.nodes[0].value,7);
 assert.equal(map.nodes[1].value,0);
 assert.equal(map.nodes[2].value,null);
 assert.equal(map.nodes[3].value,null,'HOLD cannot expose an unverified number');
 assert.equal(map.nodes[0].source,'signed_finance_ledger');
 assert.equal(map.nodes[2].reason,'Source not observed');
 assert.ok(map.nodes[0].intensity>0);
 assert.equal(map.nodes[2].intensity,0);
});

test('topology does not sum overlapping departmental records or hide unsupported states',()=>{
 const map=prepareEvidenceTopology([
  {agent:'finance',label:'finance / pending',value:3,state:'REAL',source:'ledger'},
  {agent:'finance',label:'finance / cleared',value:4,state:'REAL',source:'ledger'},
  {agent:'people',label:'people',value:0,state:'REAL',source:'hr'},
  {agent:'qa',label:'qa',value:5,state:'EMPTY',source:'invalid source'},
  {agent:'maintenance',label:'maintenance',value:1.1,state:'REAL',source:'invalid numeric type'},
 ]);
 assert.equal(map.total,5);
 assert.equal(map.observed,2);
 assert.equal(map.empty,1);
 assert.equal(map.unavailable,2);
 assert.equal(map.nodes[3].value,null);
 assert.equal(map.nodes[4].value,null);
 assert.equal(map.nodes[0].agent,'finance');
 assert.equal(map.nodes[1].agent,'finance');
 assert.equal(map.maxObserved,4);
 assert.equal(prepareEvidenceTopology(null).total,0);
});

test('topology is capped for visual performance but reports full evidence-row coverage',()=>{
 const rows=Array.from({length:90},(_,i)=>({agent:'finance',label:'status '+i,value:i,state:'REAL',source:'ledger'}));
 const map=prepareEvidenceTopology(rows);
 assert.equal(map.total,90);
 assert.equal(map.visible,64);
 assert.equal(map.omitted,26);
 assert.equal(map.observed,89);
 assert.equal(map.empty,1);
 assert.equal(map.maxObserved,89);
});

test('BI Studio renders the visual as a local view, preserving the persisted dashboard contract and shared theme',()=>{
 const studio=read('./bi-studio.mjs');
 const css=read('./bi-studio.css');
 const model=read('./bi-model.mjs');
 assert.match(studio,/renderEvidenceTopology/);
 assert.match(studio,/Evidence topology/);
 assert.match(studio,/Evidence bars/);
 assert.match(studio,/presentation\.addEventListener\('change'/);
 assert.match(css,/\.bi-topology-grid/);
 assert.match(css,/var\(--vaos-accent/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(model,/\['bar','table'\]/,'VYNDI shared saved-definition chart contract must remain unchanged');
 assert.doesNotMatch(studio,/innerHTML\s*=/);
});
