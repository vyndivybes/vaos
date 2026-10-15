import test from 'node:test';
import assert from 'node:assert/strict';
import {cockpitSources,employeeHref,workforceChart,COCKPIT_DOMAINS,erpDestination} from './lib/founder-cockpit.mjs';
import {buildGroupPortfolio,READ_DOMAINS} from './lib/group-portfolio.mjs';

test('missing or untrusted sources stay in setup; signed read authority is required',()=>{
 assert.ok(cockpitSources(null).every(x=>!x.observed));
 const data={...buildGroupPortfolio(READ_DOMAINS.map(x=>({id:x.id,status:'OBSERVED',authority:x.authority}))),readOnly:true,actionAuthorized:false};
 assert.equal(cockpitSources(data).filter(x=>x.observed).length,8);
 data.sources[0].sourceAuthority='unrelated';
 assert.equal(cockpitSources(data).filter(x=>x.observed).length,7);
 data.actionAuthorized=true;
 assert.ok(cockpitSources(data).every(x=>!x.observed));
});
test('workforce chart counts recorded lifecycle states and keeps unknown explicit',()=>{
 assert.deepEqual(workforceChart([]),[]);
 assert.deepEqual(workforceChart([{lifecycle:'PROPOSED'},{lifecycleStatus:'PROPOSED'},{}]),[{label:'PROPOSED',value:2},{label:'Unverified',value:1}]);
});
test('employee drill-down cannot inject URL parameters or a different destination',()=>{
 const url=new URL(employeeHref('qa&employee=security#x'),'https://vaos.example');
 assert.equal(url.pathname,'/workforce-analytics.html');
 assert.equal(url.searchParams.get('employee'),'qa&employee=security#x');
 assert.equal([...url.searchParams.keys()].length,1);
 for(const domain of COCKPIT_DOMAINS)assert.equal(new URL(erpDestination(domain)).origin,'https://vyndios.vayushastr.workers.dev');
});
