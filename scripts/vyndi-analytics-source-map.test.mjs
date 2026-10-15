import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVyndiAnalyticsSourceMap} from '../intelligence/vyndi-analytics-source-map.mjs';
import {VYNDI_BRIDGE_ROUTES} from '../packages/contracts/vyndi-write-bridge.mjs';

test('sources are derived only from commissioned read routes',()=>{
 const result=buildVyndiAnalyticsSourceMap();
 const commissioned=VYNDI_BRIDGE_ROUTES.filter(r=>r.effectClass==='read');
 assert.equal(result.readOnly,true);
 assert.equal(result.routeCount,commissioned.length);
 assert.equal(result.sources.length,commissioned.length);
 assert.ok(result.sources.every(s=>s.recordCount===null&&s.observedAt===null&&s.freshness==='NOT_OBSERVED'));
 assert.ok(result.sources.every(s=>!s.actionType.includes('CREATE_')&&!s.actionType.includes('CHANGE_')));
});
test('rejects disabled or unapproved read evidence',()=>{
 assert.throws(()=>buildVyndiAnalyticsSourceMap([{effectClass:'read',actionType:'FINANCE.OBSERVE_LEDGER',state:'GAP',executionEnabled:false}]),/SOURCE_NOT_READ_READY/);
});
test('rejects duplicate metrics source actions',()=>{
 const r=VYNDI_BRIDGE_ROUTES.find(r=>r.effectClass==='read');
 assert.throws(()=>buildVyndiAnalyticsSourceMap([r,r]),/DUPLICATE_SOURCE_ACTION/);
});
