import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=relative=>readFile(new URL(relative,import.meta.url),'utf8');

test('repo introduction reflects the actual operating and release model',async()=>{
 const readme=await read('../../README.md');
 assert.match(readme,/## Start here/);
 assert.match(readme,/## What works today/);
 assert.match(readme,/## What still needs evidence/);
 assert.match(readme,/## Release and deployment/);
 assert.match(readme,/jarvis-controlled-release\.yml/);
 assert.match(readme,/npm run test:market/);
 assert.doesNotMatch(readme,/Bootstrap\s*\/\s*architecture phase/i);
 assert.doesNotMatch(readme,/Cloudflare Workers Builds as its deployment authority/i);
});

test('market cockpit uses everyday explanations without losing evidence warnings',async()=>{
 const html=await read('./market-intelligence.html');
 assert.match(html,/A research workspace, not a verified sales forecast/);
 assert.match(html,/Historical patterns, not sales predictions/);
 assert.match(html,/News mentions are leads, not confirmed price changes/);
 assert.match(html,/Public data has limits/);
 assert.match(html,/No financial or procurement actions are taken here/);
 for(const id of ['scan-form','market-public-load','market-public-refresh','case-form',
 'archive-list','market-competitor-articles','market-indicator-backtests']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
});

test('operator guidance retains audit and approval language in plain English',async()=>{
 const [guide,contributing]=await Promise.all([
  read('../../docs/WRITING_FOR_PEOPLE.md'),read('../../CONTRIBUTING.md')
 ]);
 assert.match(guide,/HOLD/);
 assert.match(guide,/not verified/);
 assert.match(guide,/human approval/);
 assert.match(contributing,/WRITING_FOR_PEOPLE\.md/);
});

test('existing API reason codes and safe DOM rendering remain visible to support staff',async()=>{
 const [js,publicJS]=await Promise.all([
  read('./market-intelligence.mjs'),read('./market-public-intelligence.mjs')
 ]);
 assert.match(publicJS,/MARKET_SOURCE_UNAVAILABLE/);
 assert.match(js,/CASE HOLD/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(publicJS,/\.innerHTML\s*=/);
});
