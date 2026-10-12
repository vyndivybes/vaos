import test from 'node:test';import assert from 'node:assert/strict';
import {isAdvisoryQuestion,chooseAdviceSources,buildAdvisoryReport,extractScenario,externalTopic,checkTranslation,ADVISORY_LANGUAGES} from './business-advice.mjs';
test('planning/forecasting/agentic recommendations route before generic counts',()=>{
 for(const q of ['How can we improve our procurement planning?','Forecast bicycle demand in six months','Compare our production bottlenecks with market practice','Recommend a better approach for inventory','What if our confirmed demand grows 25%?'])
  assert.equal(isAdvisoryQuestion(q),true,q);
 assert.equal(isAdvisoryQuestion('How many job cards are recorded?'),false);
 assert.equal(isAdvisoryQuestion('Approve a purchase order and pay it'),false);
});
test('bounded signed domains and public research topic do not disclose arbitrary questions to the web',()=>{
 assert.deepEqual(chooseAdviceSources('How can we improve procurement?').map(x=>x.domain),['procurement','inventory','production']);
 assert.deepEqual(chooseAdviceSources('Forecast sales volume').map(x=>x.domain),['commercial','production','inventory']);
 assert.equal(externalTopic('Compare our secret customer pricing with web'), 'India bicycle manufacturing market');
});
test('forecast uses explicit what-if assumptions only, never fabricates six-month actuals',()=>{
 assert.equal(extractScenario('What if bicycle demand grows 25%?').increasePct,25);
 assert.equal(extractScenario('Forecast the next six months').increasePct,null);
 assert.equal(extractScenario('What if it grows 9999%?').increasePct,null);
 const report=buildAdvisoryReport({question:'Forecast the next six months',sources:[
  {domain:'commercial',status:'OBSERVED',observation:{recordsObserved:3,confirmedUnits:4,summary:'3 recent sales orders; 4 confirmed units'}},
  {domain:'production',status:'OBSERVED',observation:{recordsObserved:2,summary:'2 job cards'}}
 ]});
 assert.equal(report.forecastQualified,false);
 assert.match(report.answer,/cannot verify a six-month forecast/i);
 assert.doesNotMatch(report.answer,/expected revenue.*₹/i);
});
test('what-if analysis is clearly labelled scenario not production forecast or purchase approval',()=>{
 const out=buildAdvisoryReport({question:'What if demand grows 25% and how should I plan?',sources:[
  {domain:'commercial',status:'OBSERVED',observation:{recordsObserved:2,confirmedUnits:4,summary:'Two sales orders, 4 confirmed units'}},
  {domain:'procurement',status:'HOLD'}
 ]});
 assert.match(out.answer,/5 units.*illustrative/i);
 assert.match(out.answer,/scenario, not an approved forecast/i);
 assert.match(out.answer,/unavailable|HOLD/i);
 assert.equal(out.actionAuthorized,false);
});
test('external headlines are presented as unverified context with a URL and not as hard market facts',()=>{
 const out=buildAdvisoryReport({question:'Compare bicycle sourcing against the market and recommend',sources:[],
  web:[{title:'Example supplier bulletin',url:'https://news.google.com/rss/articles/aaa',published:'2026-10-12'}]});
 assert.match(out.answer,/headline-level context/i);
 assert.match(out.answer,/independently verify/i);
 assert.equal(out.webSources.length,1);
 assert.equal(out.status,'HOLD');
});
test('vernacular languages are strictly enumerated and translations must not corrupt measured numbers',()=>{
 assert.equal(ADVISORY_LANGUAGES.ta.ai,'tam_Taml');
 assert.equal(ADVISORY_LANGUAGES.ml.ai,'mal_Mlym');
 assert.equal(ADVISORY_LANGUAGES.hi.ai,'hin_Deva');
 assert.equal(checkTranslation('4 confirmed units and 2 jobs','4 पुष्टि की गई और 2 कार्य'),true);
 assert.equal(checkTranslation('4 confirmed units and 2 jobs','5 पुष्टि की गई और 2 कार्य'),false);
 assert.equal(checkTranslation('4 confirmed units','4 approved and paid units'),false);
});

test('group-wide analysis examines finance, sales, procurement and production rather than only shortages',()=>{
 assert.deepEqual(chooseAdviceSources('Show group business analysis and how we can improve it').map(x=>x.domain),
  ['finance','commercial','procurement','production']);
});

test('read-only operational diagnostics accept cross-domain question without plan keyword',()=>{
 assert.equal(isAdvisoryQuestion('Why are our prototype delivery dates slipping because of suppliers, build readiness and cash flow?'),true);
 assert.equal(isAdvisoryQuestion('Approve our supplier purchase'),false);
});
