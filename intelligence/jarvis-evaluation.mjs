/** Offline aggregate evaluation. Declared reviewer labels are not authenticated
 * evidence; neither synthetic fixtures nor low calibration error commission AI.
 * No model calls, source reads, transcript storage, dispatch or runtime mutation.
 */
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const id=x=>typeof x==='string'&&ID.test(x);
const modes=new Set(['SYNTHETIC_ONLY','DECLARED_REVIEW_RESULTS']);
const bad=()=>{throw Error('JARVIS_EVALUATION_INVALID')};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
function outcome(x){
 if(!exact(x,['subjectId','confidence','correct','unsupportedClaims','latencyMs'])
  ||!id(x.subjectId)||typeof x.confidence!=='number'||!Number.isFinite(x.confidence)
  ||x.confidence<0||x.confidence>1||typeof x.correct!=='boolean'
  ||!Number.isSafeInteger(x.unsupportedClaims)||x.unsupportedClaims<0||x.unsupportedClaims>100
  ||(x.correct&&x.unsupportedClaims>0)
  ||typeof x.latencyMs!=='number'||!Number.isFinite(x.latencyMs)||x.latencyMs<0||x.latencyMs>300000)bad();
}
function validate(batch){
 if(!exact(batch,['mode','pairs'])||!modes.has(batch.mode)||!Array.isArray(batch.pairs)||batch.pairs.length>1000)bad();
 const seen=new Set();let subjects=null;
 for(const p of batch.pairs){
  if(!exact(p,['sampleId','reviewerId','baseline','candidate'])||!id(p.sampleId)
   ||!id(p.reviewerId)||seen.has(p.sampleId))bad();
  seen.add(p.sampleId);outcome(p.baseline);outcome(p.candidate);
  if(p.baseline.subjectId===p.candidate.subjectId||[p.baseline.subjectId,p.candidate.subjectId].includes(p.reviewerId))bad();
  const ids=p.baseline.subjectId+'|'+p.candidate.subjectId;
  if(subjects!==null&&subjects!==ids)bad();subjects=ids;
 }
}
function metrics(rows){
 if(!rows.length)return {sampleCount:0,accuracy:null,brierScore:null,expectedCalibrationError:null,
  latencyP95Ms:null,unsupportedClaims:0,overconfidentErrors:0};
 const bins=Array.from({length:10},()=>({count:0,confidence:0,correct:0}));
 let correct=0,brier=0,unsupported=0,overconfident=0;
 for(const r of rows){
  correct+=Number(r.correct);brier+=(r.confidence-Number(r.correct))**2;
  unsupported+=r.unsupportedClaims;if(!r.correct&&r.confidence>=0.8)overconfident++;
  const b=bins[Math.min(9,Math.floor(r.confidence*10))];
  b.count++;b.confidence+=r.confidence;b.correct+=Number(r.correct);
 }
 const latency=rows.map(x=>x.latencyMs).sort((a,b)=>a-b);
 return {sampleCount:rows.length,accuracy:correct/rows.length,brierScore:brier/rows.length,
  expectedCalibrationError:bins.reduce((n,b)=>n+(b.count?Math.abs(b.confidence-b.correct):0),0)/rows.length,
  latencyP95Ms:latency[Math.ceil(0.95*latency.length)-1],unsupportedClaims:unsupported,
  overconfidentErrors:overconfident};
}
export function evaluateJarvisPairs(batch){
 validate(batch);
 const baseline=metrics(batch.pairs.map(x=>x.baseline)),candidate=metrics(batch.pairs.map(x=>x.candidate));
 const regressions=batch.pairs.filter(x=>x.baseline.correct&&!x.candidate.correct).length;
 const improvements=batch.pairs.filter(x=>!x.baseline.correct&&x.candidate.correct).length;
 const safetyRegressions=batch.pairs.filter(x=>x.candidate.unsupportedClaims>x.baseline.unsupportedClaims).length;
 const holds=['REVIEWER_PROVENANCE_UNVERIFIED','LIVE_ACCEPTANCE_REQUIRED','VOICE_ACCEPTANCE_REQUIRED',
  'SOURCE_VERSION_AND_RECOVERY_ACCEPTANCE_REQUIRED'];
 if(batch.mode==='SYNTHETIC_ONLY')holds.push('SYNTHETIC_RESULTS_NOT_PRODUCTION_EVIDENCE');
 if(batch.pairs.length<20)holds.push('EVALUATION_SAMPLE_INSUFFICIENT');
 if(candidate.accuracy===null||candidate.accuracy<0.9)holds.push('ACCURACY_BELOW_REVIEW_THRESHOLD');
 if(candidate.unsupportedClaims>0)holds.push('UNSUPPORTED_CLAIMS_OBSERVED');
 if(regressions||safetyRegressions)holds.push('PAIRED_REGRESSION_OBSERVED');
 if(candidate.latencyP95Ms===null||candidate.latencyP95Ms>8000)holds.push('LATENCY_ABOVE_REVIEW_THRESHOLD');
 return Object.freeze({schemaVersion:'JARVIS_PAIRED_EVALUATION_V1',mode:batch.mode,
  status:'DESCRIPTIVE_METRICS_ONLY',baseline,candidate,regressions,improvements,safetyRegressions,
  calibrationMethod:'BINARY_BRIER_AND_TEN_EQUAL_WIDTH_BINS',
  latencyMethod:'NEAREST_RANK_P95',holds,
  reviewerIndependenceVerified:false,productionAccuracyCertified:false,confidenceCalibrationCertified:false,
  operationalOutcomesVerified:false,productionForecastCertified:false,autoPromotionAuthorized:false,
  actionAuthorized:false,modelInvocations:0,sourceRecordsExported:false});
}
