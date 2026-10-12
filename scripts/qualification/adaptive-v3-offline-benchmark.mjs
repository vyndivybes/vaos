/** Offline admission-quality fixture pack. Synthetic only; cannot prove live AI quality.
 * Runs with no API key, user session, model request, or production data.
 */
import assert from 'node:assert/strict';
import {fallbackAdaptivePlan} from '../../apps/web/lib/adaptive-intelligence.mjs';
import {assessUpgradeReadiness} from '../../apps/web/lib/adaptive-upgrade-readiness.mjs';

const samples=[
 ['What customer orders are confirmed?', ['COMMERCIAL']],
 ['Can we finance production of two frames?', ['FINANCE','PRODUCTION']],
 ['How much cash runway is available?', ['FINANCE']],
 ['What production job cards are pending?', ['PRODUCTION']],
 ['Which vendors have procurement shortages?', ['PROCUREMENT']],
 ['Is current stock available for prototype build?', ['INVENTORY','PRODUCTION']],
 ['What are the engineering release constraints?', ['ENGINEERING']],
 ['Is staff availability sufficient?', ['PEOPLE']],
 ['What is manufacturing capacity?', ['PRODUCTION']],
 ['How many customer pipeline orders?', ['COMMERCIAL']],
 ['Are material shortages delaying job cards?', ['PROCUREMENT','PRODUCTION']],
 ['What do VEDM and VIBPE say about FEA?', ['ENGINEERING']],
 ['What is the project budget exposure?', ['FINANCE']],
 ['Can a resin supplier change affect design validation?', ['PROCUREMENT','ENGINEERING']],
 ['What is our staff headcount?', ['PEOPLE']],
 ['Show the inventory stock position', ['INVENTORY']],
 ['Which production prototype requires engineering review?', ['PRODUCTION','ENGINEERING']],
 ['Are expense records sufficient for a profit view?', ['FINANCE']],
 ['How is supplier sourcing affecting assembly?', ['PROCUREMENT','PRODUCTION']],
 ['What confirmed orders are in our sales pipeline?', ['COMMERCIAL']],
 ['What is the weather forecast for Oslo?', []],
 ['Who won the latest football world cup?', []],
];
export function runOfflineBenchmark(){
 const results=samples.map(([question,required])=>{
  const actual=fallbackAdaptivePlan(question);
  const success=required.every(x=>actual.tools.includes(x))&&
   (required.length>0||actual.tools.length===0)&&actual.tools.length<=3;
  return {question,success,expectedDomains:required,actualDomains:actual.tools};
 });
 const passed=results.filter(x=>x.success).length;
 const readiness=assessUpgradeReadiness({verifiedDeployment:true,readOnlyControlsPassed:true,
  evaluatedQuestions:results.length,correctEvidenceResponses:null,unsupportedClaims:null,
  authenticatedLiveQuestions:0,sourceLinkedAnswers:0,latencyP95Ms:null,
  freeTierBudgetVerified:false,paidRoutingEnabled:false,voiceReadbackPassed:false});
 return {kind:'SYNTHETIC_ROUTING_ONLY',cases:results.length,passed,failed:results.length-passed,
  realWorldAnswerAccuracy:'NOT_MEASURED',modelInferenceQuality:'NOT_MEASURED',
  authenticatedLiveAcceptance:'NOT_RUN',upgradeState:readiness.state,
  upgradeHolds:readiness.holds,failures:results.filter(x=>!x.success)};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const report=runOfflineBenchmark();
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 assert.equal(report.failed,0,'Offline routing fixture regressions must be resolved');
 assert.equal(report.upgradeState,'HOLD','Synthetic results must not qualify production upgrade');
}
