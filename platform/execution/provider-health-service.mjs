function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function clock(now){const d=now();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('PROVIDER_HEALTH_CLOCK_INVALID');return d.toISOString()}
const VALID=new Set(['healthy','degraded','unhealthy','unknown']);

export function createProviderHealthService({
  controlPlane,
  probes={},
  now=()=>new Date(),
}={}){
  if(!controlPlane||typeof controlPlane.recordHealth!=='function')throw fail('PROVIDER_HEALTH_CONTROL_PLANE_REQUIRED');
  if(!probes||typeof probes!=='object'||Array.isArray(probes))throw fail('PROVIDER_HEALTH_PROBES_INVALID');
  if(typeof now!=='function')throw fail('PROVIDER_HEALTH_CLOCK_INVALID');

  async function check(providerId){
    if(typeof providerId!=='string'||!providerId.trim())throw fail('PROVIDER_HEALTH_PROVIDER_INVALID');
    const id=providerId.trim();
    const probe=probes[id];
    if(typeof probe!=='function')throw fail('PROVIDER_HEALTH_PROBE_NOT_FOUND');
    const checkedAt=clock(now);
    let status='unhealthy',evidenceRef=null;
    try{
      const result=await probe();
      if(!result||!VALID.has(result.status))throw fail('PROVIDER_HEALTH_RESULT_INVALID');
      status=result.status;
      evidenceRef=typeof result.evidenceRef==='string'&&result.evidenceRef.trim()?result.evidenceRef.trim():null;
    }catch{
      status='unhealthy';
      evidenceRef=null;
    }
    await controlPlane.recordHealth({providerId:id,status,checkedAt,evidenceRef});
    return Object.freeze({providerId:id,status,checkedAt,evidenceRef});
  }

  async function checkAll(){
    const results=[];
    for(const providerId of Object.keys(probes).sort())results.push(await check(providerId));
    return results;
  }

  return Object.freeze({check,checkAll});
}
