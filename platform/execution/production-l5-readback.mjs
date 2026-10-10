/** Independent second signed source read for the narrow Production WIP capability.
 * This is an independent source readback, not a separate human approval.
 */
const fail = (code) => { const error=new Error(code); error.code=code; error.retryable=false; throw error; };
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyProductionWipReadback({ bridge, job, observed } = {}) {
  if(job?.actionType!=='PRODUCTION.OBSERVE_WIP'||!Array.isArray(observed?.data?.records)
     ||observed.sourceAuthority!=='getProductionJobCards'||!observed?.nonce) fail('PRODUCTION_READBACK_SOURCE_INVALID');
  if(typeof bridge?.execute!=='function') fail('PRODUCTION_READBACK_BRIDGE_MISSING');
  const independent = await bridge.execute({...job}); // client generates a fresh signed nonce
  if(independent?.nonce===observed.nonce||independent?.actionType!==job.actionType
      ||independent?.sourceAuthority!==observed.sourceAuthority
      ||!Array.isArray(independent?.data?.records)) fail('PRODUCTION_READBACK_INDEPENDENCE_INVALID');
  const sourceContentSha256 = await digest(observed.data);
  const independentContentSha256 = await digest(independent.data);
  if(sourceContentSha256!==independentContentSha256) fail('PRODUCTION_READBACK_CONTENT_MISMATCH');
  return Object.freeze({ sourceContentSha256, observedRows:observed.data.records.length,
    method:'TWO_SIGNED_SOURCE_READS',verified:true });
}
