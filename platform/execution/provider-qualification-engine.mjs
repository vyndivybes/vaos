const PROFILE_VERSION='vaos.provider-qualification-profile.v1';
const STAGE_ORDER=['contract','ephemeral-live','staging','production'];
const EVIDENCE_CLASSES=new Set(['automated','live','manual']);
const OUTCOMES=new Set(['pass','fail']);

function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(value,key,code='PROVIDER_QUALIFICATION_INPUT_INVALID'){
  const v=value?.[key];if(typeof v!=='string'||!v.trim())throw fail(code,`${code}:${key}`);return v.trim();
}
function clone(v){return structuredClone(v)}
function nowDate(now){const d=now();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('PROVIDER_QUALIFICATION_CLOCK_INVALID');return d}
function profileKey(providerId,capability){return `${providerId}::${capability}`}
function normalizeProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID');
  if(input.schemaVersion!==PROFILE_VERSION)throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:schemaVersion');
  const providerId=req(input,'providerId','PROVIDER_QUALIFICATION_PROFILE_INVALID');
  const capability=req(input,'capability','PROVIDER_QUALIFICATION_PROFILE_INVALID');
  const validForDays=Number(input.validForDays);
  if(!Number.isInteger(validForDays)||validForDays<1||validForDays>365)throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:validForDays');
  if(!Array.isArray(input.stages)||input.stages.length!==STAGE_ORDER.length)throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:stages');
  const stageMap=new Map();
  const checkIds=new Set();
  const stages=input.stages.map(stage=>{
    if(!stage||typeof stage!=='object'||!STAGE_ORDER.includes(stage.stage)||stageMap.has(stage.stage))throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:stages');
    if(!Array.isArray(stage.checks)||stage.checks.length===0)throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:checks');
    const checks=stage.checks.map(check=>{
      if(!check||typeof check!=='object')throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:checks');
      const id=req(check,'id','PROVIDER_QUALIFICATION_PROFILE_INVALID');
      if(checkIds.has(id))throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:duplicateCheck');
      checkIds.add(id);
      const requiredEvidenceClass=req(check,'requiredEvidenceClass','PROVIDER_QUALIFICATION_PROFILE_INVALID');
      if(!EVIDENCE_CLASSES.has(requiredEvidenceClass))throw fail('PROVIDER_QUALIFICATION_PROFILE_INVALID:evidenceClass');
      return Object.freeze({id,requiredEvidenceClass});
    });
    const normalized=Object.freeze({stage:stage.stage,checks:Object.freeze(checks)});
    stageMap.set(stage.stage,normalized);
    return normalized;
  }).sort((a,b)=>STAGE_ORDER.indexOf(a.stage)-STAGE_ORDER.indexOf(b.stage));
  return Object.freeze({schemaVersion:PROFILE_VERSION,providerId,capability,validForDays,stages:Object.freeze(stages)});
}

export function createProviderQualificationEngine({
  controlPlane,
  profiles=[],
  recordAudit=async()=>{},
  now=()=>new Date(),
  healthTtlMs=300_000,
  evidenceStore=null,
}={}){
  if(!controlPlane||typeof controlPlane.snapshot!=='function'||typeof controlPlane.transitionQualification!=='function'||typeof controlPlane.setProviderEnabled!=='function'||typeof controlPlane.setCapabilityEnabled!=='function')throw fail('PROVIDER_QUALIFICATION_CONTROL_PLANE_REQUIRED');
  if(!Array.isArray(profiles)||profiles.length===0)throw fail('PROVIDER_QUALIFICATION_PROFILES_REQUIRED');
  if(typeof recordAudit!=='function'||typeof now!=='function')throw fail('PROVIDER_QUALIFICATION_CONFIG_INVALID');
  if(!Number.isInteger(healthTtlMs)||healthTtlMs<1)throw fail('PROVIDER_QUALIFICATION_CONFIG_INVALID:healthTtlMs');
  if(evidenceStore!==null&&(typeof evidenceStore?.append!=='function'||typeof evidenceStore?.list!=='function'))throw fail('PROVIDER_QUALIFICATION_EVIDENCE_STORE_INVALID');

  const normalizedProfiles=new Map();
  const evidence=new Map();
  for(const raw of profiles){
    const p=normalizeProfile(raw);
    const key=profileKey(p.providerId,p.capability);
    if(normalizedProfiles.has(key))throw fail('PROVIDER_QUALIFICATION_PROFILE_DUPLICATE');
    normalizedProfiles.set(key,p);
    evidence.set(key,new Map());
  }

  function getProfile(providerId,capability){
    const key=profileKey(providerId,capability);
    const p=normalizedProfiles.get(key);
    if(!p)throw fail('PROVIDER_QUALIFICATION_PROFILE_NOT_FOUND');
    return {key,profile:p};
  }
  function getCheck(profile,checkId){
    for(const stage of profile.stages){
      const check=stage.checks.find(x=>x.id===checkId);
      if(check)return {stage:stage.stage,check};
    }
    throw fail('PROVIDER_QUALIFICATION_CHECK_NOT_FOUND');
  }

  function normalizeEvidenceRow(profile,row,code='PROVIDER_QUALIFICATION_PERSISTED_EVIDENCE_INVALID'){
    if(!row||typeof row!=='object'||Array.isArray(row))throw fail(code);
    const providerId=req(row,'providerId',code);
    const capability=req(row,'capability',code);
    if(providerId!==profile.providerId||capability!==profile.capability)throw fail(code);
    const checkId=req(row,'checkId',code);
    const {stage,check}=getCheck(profile,checkId);
    if(row.stage!==stage)throw fail(code);
    if(!OUTCOMES.has(row.outcome))throw fail(code);
    if(row.evidenceClass!==check.requiredEvidenceClass)throw fail(code);
    if(!Array.isArray(row.evidenceRefs)||row.evidenceRefs.length===0||row.evidenceRefs.some(v=>typeof v!=='string'||!v.trim()))throw fail(code);
    const authorityRef=req(row,'authorityRef',code);
    const recordedAt=req(row,'recordedAt',code);
    if(Number.isNaN(new Date(recordedAt).getTime()))throw fail(code);
    return Object.freeze({
      providerId,capability,stage,checkId,outcome:row.outcome,evidenceClass:row.evidenceClass,
      evidenceRefs:Object.freeze([...new Set(row.evidenceRefs.map(v=>v.trim()))]),
      authorityRef,recordedAt:new Date(recordedAt).toISOString(),
    });
  }

  async function restoreEvidence(){
    if(!evidenceStore)return [];
    const restored=[];
    for(const [key,profile] of normalizedProfiles.entries()){
      let rows;
      try{rows=await evidenceStore.list(profile.providerId,profile.capability)}
      catch{throw fail('PROVIDER_QUALIFICATION_EVIDENCE_RESTORE_FAILED')}
      if(!Array.isArray(rows))throw fail('PROVIDER_QUALIFICATION_PERSISTED_EVIDENCE_INVALID');
      const target=evidence.get(key);
      target.clear();
      const normalized=rows.map(row=>normalizeEvidenceRow(profile,row))
        .sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
      for(const row of normalized)target.set(row.checkId,row);
      restored.push(...normalized);
    }
    return restored;
  }

  async function recordEvidence({
    providerId,capability,checkId,outcome,evidenceClass,evidenceRefs,authorityRef,
  }={}){
    providerId=req({providerId},'providerId');
    capability=req({capability},'capability');
    checkId=req({checkId},'checkId');
    authorityRef=req({authorityRef},'authorityRef');
    if(!OUTCOMES.has(outcome))throw fail('PROVIDER_QUALIFICATION_OUTCOME_INVALID');
    if(!EVIDENCE_CLASSES.has(evidenceClass))throw fail('PROVIDER_QUALIFICATION_EVIDENCE_CLASS_INVALID');
    if(!Array.isArray(evidenceRefs)||evidenceRefs.length===0||evidenceRefs.some(v=>typeof v!=='string'||!v.trim()))throw fail('PROVIDER_QUALIFICATION_EVIDENCE_REQUIRED');
    const {key,profile}=getProfile(providerId,capability);
    const {stage,check}=getCheck(profile,checkId);
    if(check.requiredEvidenceClass!==evidenceClass)throw fail('PROVIDER_QUALIFICATION_EVIDENCE_CLASS_MISMATCH');
    const recordedAt=nowDate(now).toISOString();
    const row=Object.freeze({
      providerId,capability,stage,checkId,outcome,evidenceClass,
      evidenceRefs:Object.freeze([...new Set(evidenceRefs.map(v=>v.trim()))]),
      authorityRef,recordedAt,
    });
    if(evidenceStore){
      try{await evidenceStore.append(clone(row))}
      catch{throw fail('PROVIDER_QUALIFICATION_EVIDENCE_PERSIST_FAILED')}
    }
    evidence.get(key).set(checkId,row);
    await recordAudit({
      type:'PROVIDER.QUALIFICATION.EVIDENCE.RECORDED',
      providerId,capability,stage,checkId,outcome,evidenceClass,
      evidenceRefs:row.evidenceRefs.slice(),authorityRef,occurredAt:recordedAt,
    });
    return row;
  }

  function assess(providerId,capability){
    const {key,profile}=getProfile(providerId,capability);
    const recorded=evidence.get(key);
    const checks={};
    const stages={};
    let ready=true;
    for(const stage of profile.stages){
      let stageFailed=false,stagePending=false;
      for(const check of stage.checks){
        const row=recorded.get(check.id);
        const status=!row?'PENDING':row.outcome==='pass'?'PASSED':'FAILED';
        checks[check.id]=Object.freeze({
          stage:stage.stage,status,
          requiredEvidenceClass:check.requiredEvidenceClass,
          evidenceRefs:row?row.evidenceRefs.slice():[],
          recordedAt:row?.recordedAt||null,
        });
        if(status==='FAILED')stageFailed=true;
        if(status==='PENDING')stagePending=true;
      }
      const status=stageFailed?'FAILED':stagePending?'PENDING':'PASSED';
      stages[stage.stage]=status;
      if(status!=='PASSED')ready=false;
    }
    return Object.freeze({
      providerId,capability,
      stages:Object.freeze(stages),
      checks:Object.freeze(checks),
      readyForQualification:ready,
    });
  }

  async function qualify({providerId,capability,authorityRef,reason}={}){
    providerId=req({providerId},'providerId');
    capability=req({capability},'capability');
    authorityRef=req({authorityRef},'authorityRef');
    reason=req({reason},'reason');
    const {key,profile}=getProfile(providerId,capability);
    const assessment=assess(providerId,capability);
    if(!assessment.readyForQualification)throw fail('PROVIDER_QUALIFICATION_INCOMPLETE');
    const refs=[];
    for(const row of evidence.get(key).values())for(const ref of row.evidenceRefs)refs.push(ref);
    const validUntil=new Date(nowDate(now).getTime()+profile.validForDays*86_400_000).toISOString();
    const result=await controlPlane.transitionQualification({
      providerId,to:'qualified',capability,
      evidenceRefs:[...new Set(refs)],
      authorityRef,reason,validUntil,
    });
    await recordAudit({
      type:'PROVIDER.QUALIFICATION.COMPLETED',providerId,capability,
      evidenceRefs:[...new Set(refs)],authorityRef,reason,validUntil,
      occurredAt:nowDate(now).toISOString(),
    });
    return result;
  }

  async function activate({providerId,capability,authorityRef,reason}={}){
    providerId=req({providerId},'providerId');
    capability=req({capability},'capability');
    authorityRef=req({authorityRef},'authorityRef');
    reason=req({reason},'reason');
    getProfile(providerId,capability);
    const snap=controlPlane.snapshot(providerId);
    if(
      snap?.qualification?.state!=='qualified'
      || !Array.isArray(snap.qualification.qualifiedCapabilities)
      || !snap.qualification.qualifiedCapabilities.includes(capability)
    )throw fail('PROVIDER_ACTIVATION_NOT_QUALIFIED');
    if(snap.qualification.validUntil&&new Date(snap.qualification.validUntil).getTime()<=nowDate(now).getTime())throw fail('PROVIDER_ACTIVATION_QUALIFICATION_EXPIRED');
    const health=snap.health;
    const healthTime=health?.checkedAt?new Date(health.checkedAt).getTime():NaN;
    const age=nowDate(now).getTime()-healthTime;
    if(health?.status!=='healthy'||!Number.isFinite(age)||age<0||age>healthTtlMs)throw fail('PROVIDER_ACTIVATION_HEALTH_INVALID');
    await controlPlane.setCapabilityEnabled({providerId,capability,enabled:true,authorityRef,reason});
    await controlPlane.setProviderEnabled({providerId,enabled:true,authorityRef,reason});
    await recordAudit({
      type:'PROVIDER.ACTIVATED',providerId,capability,authorityRef,reason,
      occurredAt:nowDate(now).toISOString(),
    });
    return Object.freeze({providerId,capability,activated:true,snapshot:controlPlane.snapshot(providerId)});
  }

  return Object.freeze({recordEvidence,restoreEvidence,assess,qualify,activate});
}
