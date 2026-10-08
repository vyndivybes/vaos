import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProviderControlPlane} from '../execution/provider-control-plane.mjs';

const migration=()=>readFileSync(new URL('../../supabase/migrations/20261009030000_infisical_independent_guard.sql',import.meta.url),'utf8');
const workflow=()=>readFileSync(new URL('../../.github/workflows/infisical-scoped-commissioning.yml',import.meta.url),'utf8');

function manifest(id='infisical',cap='secret.broker'){
 return {schemaVersion:'vaos.provider.v2',providerId:id,displayName:id,
 adapterVersion:'1.0.0',capabilities:[cap],deploymentModes:['cloud'],enabled:true,
 qualification:{state:'qualified',qualifiedCapabilities:[cap],evidenceRefs:['qualification:pass'],validUntil:'2026-11-07T00:00:00.000Z'},
 routing:{dataClassifications:['internal'],riskClasses:['low'],licensingAllowed:true},
 security:{},execution:{healthProbe:'required',rollbackMethod:'disable-provider'},
 operations:{retentionClass:'default',dataResidency:[],costControl:'bounded'}};
}
const request={dataClassification:'internal',riskClass:'low'};

test('Infisical uses a bounded 20-minute freshness window for 15-minute cadence, then fails closed',async()=>{
 let moment='2026-10-09T00:00:00.000Z';
 const cp=createProviderControlPlane({providers:[manifest()],now:()=>new Date(moment)});
 await cp.recordHealth({providerId:'infisical',status:'healthy',checkedAt:moment,evidenceRef:'canary'});
 moment='2026-10-09T00:19:59.000Z';
 assert.equal(cp.resolve('secret.broker',request)?.providerId,'infisical');
 moment='2026-10-09T00:20:01.000Z';
 assert.equal(cp.resolve('secret.broker',request),null);
});
test('Non-Infisical provider keeps existing 5-minute limit',async()=>{
 let moment='2026-10-09T00:00:00.000Z';
 const cp=createProviderControlPlane({providers:[manifest('windmill','workflow.orchestrate')],now:()=>new Date(moment)});
 await cp.recordHealth({providerId:'windmill',status:'healthy',checkedAt:moment,evidenceRef:'canary'});
 moment='2026-10-09T00:05:01.000Z';
 assert.equal(cp.resolve('workflow.orchestrate',request),null);
});
test('Explicit per-provider TTL override can shorten not globally expand the freshness limit',async()=>{
 let moment='2026-10-09T00:00:00.000Z';
 const cp=createProviderControlPlane({providers:[manifest()],now:()=>new Date(moment),healthTtlOverridesMs:{infisical:60_000}});
 await cp.recordHealth({providerId:'infisical',status:'healthy',checkedAt:moment,evidenceRef:'canary'});
 moment='2026-10-09T00:01:01.000Z';
 assert.equal(cp.resolve('secret.broker',request),null);
});
test('Independent database watchdog schedules every five minutes, without credentials or auto-enabling',()=>{
 const sql=migration();
 assert.match(sql,/CREATE EXTENSION IF NOT EXISTS pg_cron/i);
 assert.match(sql,/cron\.schedule\(/);
 assert.match(sql,/'\*\/5 \* \* \* \*'/);
 assert.match(sql,/FOR UPDATE/i);
 assert.match(sql,/30 minutes/i);
 assert.match(sql,/\{enabled\}/);
 assert.match(sql,/\{capabilityEnabled,secret\.broker\}/);
 assert.match(sql,/false/i);
 assert.doesNotMatch(sql,/\{enabled\}[^;]*true.*\)/s);
 assert.doesNotMatch(sql,/p_server_key|github-infisical-production-watchdog|key_hash/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION vaos_private\.audit_infisical_watchdog/);
});
test('Scheduled workflow has narrow bootstrap trigger and preserves schedule, disable-only failure route',()=>{
 const y=workflow();
 assert.match(y,/cron: '7,22,37,52 \* \* \* \*'/);
 assert.match(y,/push:\s*\n\s*branches:.*\n\s*- main/m);
 assert.match(y,/infisical-watchdog-bootstrap\.trigger/);
 assert.match(y,/REQUESTED_ACTION:/);
 assert.match(y,/steps\.live\.outcome == 'failure'/);
 assert.match(y,/INFISICAL_COMMISSION_ACTION: disable/);
 assert.doesNotMatch(y,/action: activate/);
});
