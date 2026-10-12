import test from 'node:test';import assert from 'node:assert/strict';
import {buildAdvisoryReport,chooseAdviceSources,observeAdviceDomain} from './business-advice.mjs';
const source=(domain,recordsObserved,extras={})=>({domain,status:'OBSERVED',
 observation:{recordsObserved,...extras,summary:'Bounded provider data. Do not copy this disclaimer into the decision brief.'}});
test('group advice leads with actionable decision and four distinct concise domain signals, not repeated generic disclaimers',()=>{
 const report=buildAdvisoryReport({question:'Analyse group business performance and recommend a better way',
 sources:[source('finance',6),source('commercial',5,{confirmedUnits:4}),source('procurement',47),source('production',4)]});
 assert.match(report.answer,/Business review/);
 assert.match(report.answer,/GROUP DECISION/);
 assert.match(report.answer,/47 shortage lines/i);
 assert.match(report.answer,/4 production job cards/i);
 assert.match(report.answer,/4 confirmed ordered units/i);
 assert.match(report.answer,/reconcile|prioriti[sz]e/i);
 assert.equal(report.forecastQualified,false);
 assert.ok(report.answer.length<=1350,'long unfiltered ledger-style text should not be displayed');
 assert.ok(report.spokenAnswer.length<=340,'spoken answer should fit in a natural short response');
 assert.ok(report.keyEvidence.length<=4);
 assert.ok(report.keyEvidence.every(x=>typeof x==='string'&&x.length<120));
 assert.equal((report.answer.match(/completeness certificate/g)||[]).length,0);
});
test('procurement prioritizes critical shortages rather than repeating the warehouse ledger',()=>{
 const report=buildAdvisoryReport({question:'What should we improve first in procurement?',
 sources:[source('procurement',47),source('inventory',1),source('production',4)]});
 assert.match(report.answer,/47 shortage lines/i);
 assert.match(report.answer,/first/i);
 assert.match(report.answer,/job.card/i);
 assert.ok(report.spokenAnswer.toLowerCase().includes('shortage'));
 assert.ok(!report.answer.includes('source read covers up to 50'));
});
test('scenario distinguishes confirmed orders from demand forecast with explicit baseline and no fictitious inventory',()=>{
 const report=buildAdvisoryReport({question:'What if bicycle demand increases by 25%?',
 sources:[source('commercial',5,{confirmedUnits:4}),source('production',4),source('inventory',1)]});
 assert.match(report.answer,/4.*25%.*5 units/i);
 assert.match(report.answer,/scenario, not an approved forecast/i);
 assert.match(report.answer,/unverified/i);
 assert.equal(report.scenario.increasePct,25);
 assert.equal(report.forecastQualified,false);
 assert.ok(report.spokenAnswer.length<=340);
});
test('manufacturing with market comparison selects operations not generic commercial sales',()=>{
 assert.deepEqual(chooseAdviceSources('Compare our bicycle manufacturing approach with current industry trends').map(x=>x.domain),
 ['production','procurement','inventory']);
 const report=buildAdvisoryReport({question:'Compare our bicycle manufacturing approach with market',
 sources:[source('production',4),source('procurement',47)],web:[]});
 assert.match(report.answer,/No independently qualifying current public sources/);
 assert.ok(!/market leading|industry average/i.test(report.answer));
});
test('partial sources remain expressly unqualified instead of declaring all clear',()=>{
 const x=buildAdvisoryReport({question:'Plan better procurement',sources:[
 source('procurement',47),{domain:'inventory',status:'HOLD'},{domain:'production',status:'HOLD'}]});
 assert.match(x.answer,/HOLD/);
 assert.match(x.answer,/inventory.*production/i);
 assert.equal(x.actionAuthorized,false);
 assert.equal(x.status,'OBSERVED');
});
test('no signed evidence returns HOLD and an honest spoken response without a confident decision',()=>{
 const x=buildAdvisoryReport({question:'Improve finance',sources:[]});
 assert.equal(x.status,'HOLD');
 assert.match(x.answer,/No qualified live business observation/i);
 assert.match(x.spokenAnswer,/cannot verify/i);
 assert.equal(x.forecastQualified,false);
});
test('only compact, safe counts appear in summaries; never copy personal names, financial notes or ERP fields',()=>{
 const z=observeAdviceDomain('commercial',{records:[
 {status:'confirmed',units:4,customer_name:'PRIVATE NAME',customer_email:'private@example.org'},
 {status:'cancelled',units:1,internal_secret:'SECRET_MARKER'}]});
 assert.equal(z.confirmedUnits,4);
 assert.match(z.summary,/4 confirmed ordered units/i);
 assert.ok(!JSON.stringify(z).includes('PRIVATE NAME'));
 const p=buildAdvisoryReport({question:'Forecast demand 25%',sources:[{domain:'commercial',status:'OBSERVED',observation:z}]});
 assert.ok(!p.answer.includes('PRIVATE NAME'));
});
