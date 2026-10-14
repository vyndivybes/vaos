/**
 * Volatile G5 request-to-display diagnostics only.
 * Counts no raw questions, transcripts, source contents or device speech.
 * Does not certify independent unseen-question acceptance or voice latency.
 */
const OUTCOMES=new Set(['OBSERVED','HOLD','ERROR']);
const MAX_SAMPLES=20;
export function createG5ResponseTiming(){
 const values=[];
 return Object.freeze({
  record(elapsedMs,outcome){
   if(typeof elapsedMs!=='number'||!Number.isFinite(elapsedMs)
      ||elapsedMs<0||elapsedMs>300000||!OUTCOMES.has(outcome))throw Error('G5_TIMING_INPUT_INVALID');
   values.push({elapsedMs:Math.round(elapsedMs),outcome});
   if(values.length>MAX_SAMPLES)values.shift();
   return this.summary();
  },
  summary(){
   const success=values.filter(x=>x.outcome==='OBSERVED').map(x=>x.elapsedMs).sort((a,b)=>a-b);
   const p95=success.length?success[Math.ceil(0.95*success.length)-1]:null;
   return Object.freeze({
    schemaVersion:'VAOS_G5_LOCAL_RESPONSE_LATENCY_V1',
    sampleCount:values.length,
    successCount:success.length,
    holdCount:values.filter(x=>x.outcome==='HOLD').length,
    errorCount:values.filter(x=>x.outcome==='ERROR').length,
    displayP95Ms:p95,
    latencyScope:'BROWSER_REQUEST_TO_RENDER_ONLY',
    unseenQuestionIndependenceVerified:false,
    voiceDeviceLatencyMeasured:false,
    g5Accepted:false,
    persist:false,
   });
  },
 });
}

export function formatG5ResponseTiming(summary){
 if(summary?.schemaVersion!=='VAOS_G5_LOCAL_RESPONSE_LATENCY_V1'
   ||summary.latencyScope!=='BROWSER_REQUEST_TO_RENDER_ONLY'
   ||summary.g5Accepted!==false||summary.persist!==false
   ||!Number.isInteger(summary.sampleCount)||summary.sampleCount<0||summary.sampleCount>MAX_SAMPLES
   ||!Number.isInteger(summary.successCount)||summary.successCount<0||summary.successCount>summary.sampleCount
   ||!Number.isInteger(summary.holdCount)||summary.holdCount<0||summary.holdCount>summary.sampleCount
   ||!Number.isInteger(summary.errorCount)||summary.errorCount<0||summary.errorCount>summary.sampleCount
   ||summary.successCount+summary.holdCount+summary.errorCount!==summary.sampleCount
   ||(summary.displayP95Ms!==null&&(!Number.isSafeInteger(summary.displayP95Ms)||summary.displayP95Ms<0||summary.displayP95Ms>300000))){
  throw Error('G5_TIMING_SUMMARY_INVALID');
 }
 const p95=summary.displayP95Ms===null?'unavailable':(summary.displayP95Ms/1000).toFixed(2)+'s';
 return 'Local answer p95 '+p95+' ('+summary.successCount+' observations; '+
  summary.holdCount+' holds; '+summary.errorCount+
  ' errors). Request-to-display only; not voice/device p95 or independently adjudicated G5 acceptance.';
}
