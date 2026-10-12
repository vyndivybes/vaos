import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOperatingDecisionSupport,shouldIncludeEngineering} from './operating-decision-support.mjs';

const observed=(domain,count,additional={})=>({
 domain,status:'OBSERVED',observation:{recordsObserved:count,summary:count+' '+domain+' recent/selected records',...additional}
});
test('strategic founder question receives ranked risks, actionable plan and all six months of qualitative scenarios',()=>{
 const report=buildOperatingDecisionSupport({question:'performance identify the main risk recommend a better operating plan and provide a 6 month forecast',
  observations:[observed('finance',6),observed('commercial',5,{confirmedUnits:4}),observed('procurement',47),observed('production',4)],
  engineering:{status:'HOLD',sources:[]}});
 assert.equal(report.forecastCertification,'HOLD');
 assert.equal(report.risks[0].code,'MATERIAL_READINESS');
 assert.equal(report.risks[0].severity,'PRIORITY_REVIEW');
 assert.equal(report.scenarios.length,3);
 assert.deepEqual(report.scenarios.map(s=>s.label),['CONSERVATIVE','BASELINE','OPTIMISTIC']);
 assert.ok(report.scenarios.every(s=>s.periods.length===3));
 assert.match(report.answer,/RISK RANKING/);
 assert.match(report.answer,/30\/60\/90-DAY PLAN/);
 assert.match(report.answer,/SIX-MONTH OPERATING OUTLOOK/);
 assert.match(report.answer,/no certified numeric financial or unit forecast/i);
 assert.doesNotMatch(report.answer,/47 (?:distinct|confirmed) (?:blockers|stoppages)/i);
 assert.ok(report.spokenAnswer.length<450);
 assert.equal(report.actionAuthorized,false);
});
test('missing operational sources are not treated as zero risk or healthy performance',()=>{
 const report=buildOperatingDecisionSupport({question:'Plan our business performance',
  observations:[{domain:'procurement',status:'HOLD'},{domain:'production',status:'HOLD'}],
  engineering:{status:'HOLD',sources:[]}});
 assert.equal(report.evidenceState,'INCOMPLETE');
 assert.match(report.answer,/unavailable/i);
 assert.equal(report.forecastCertification,'HOLD');
 assert.equal(report.actionAuthorized,false);
});
test('controlled engineering evidence must be explicitly labeled and commit pinned; malicious URLs excluded',()=>{
 const sha='a'.repeat(40);
 const good='https://github.com/vayu-shastr/veloxis-engineering-design-manual/blob/'+sha+'/CURRENT_CONFIGURATION_STATUS.md';
 const report=buildOperatingDecisionSupport({question:'Improve frame production plan',observations:[observed('production',4)],
  engineering:{status:'OBSERVED',authorityScope:'VEDM_CURRENT_CONFIGURATION',kpModules:['KP-13','KP-14'],
   sources:[{repository:'vayu-shastr/veloxis-engineering-design-manual',path:'CURRENT_CONFIGURATION_STATUS.md',url:good},
    {repository:'evil/repo',path:'risk.md',url:'https://evil.example/phishing'}]}});
 assert.equal(report.engineeringState,'OBSERVED');
 assert.equal(report.technicalSources.length,1);
 assert.equal(report.technicalSources[0].url,good);
 assert.match(report.answer,/VEDM/i);
 assert.match(report.answer,/VIBPE/i);
 assert.doesNotMatch(report.answer,/evil.example/);
});
test('performance and forecast requests trigger controlled engineering read; pure finance question does not',()=>{
 assert.equal(shouldIncludeEngineering('performance identify main risk forecast six months'),true);
 assert.equal(shouldIncludeEngineering('Recommend better production and material plan'),true);
 assert.equal(shouldIncludeEngineering('Forecast engineering release risks'),true);
 assert.equal(shouldIncludeEngineering('Recommend better cash reconciliation'),false);
});
