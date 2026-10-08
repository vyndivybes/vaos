const PROVIDER = 'infisical';
const CAPABILITY = 'secret.broker';
const OWNER_APPROVAL_REF = 'https://github.com/vyndivybes/vaos/pull/46#issuecomment-6062907623';

const items = value => Array.isArray(value) ? value : [];
const time = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;

export function assessInfisicalCommissioning({snapshot, evidence=[], profile, now=new Date(), maxHealthAgeMs=300_000}={}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('INFISICAL_READINESS_CLOCK_INVALID');
  if (!Number.isInteger(maxHealthAgeMs) || maxHealthAgeMs < 1) throw Error('INFISICAL_READINESS_TTL_INVALID');
  const expected = items(profile?.stages).flatMap(stage =>
    items(stage.checks).map(check => ({checkId:check.id, stage:stage.stage, evidenceClass:check.requiredEvidenceClass}))
  );
  const latest = new Map();
  for (const row of items(evidence)) {
    if (row?.providerId !== PROVIDER || row?.capability !== CAPABILITY || typeof row.checkId !== 'string') continue;
    const previous=latest.get(row.checkId);
    const recorded=time(row.recordedAt);
    if (!previous || (Number.isFinite(recorded) && recorded > time(previous.recordedAt))) latest.set(row.checkId,row);
  }
  const missingChecks=[],failedChecks=[];
  let passedChecks=0;
  for (const check of expected) {
    const row=latest.get(check.checkId);
    if (!row) { missingChecks.push(check.checkId); continue; }
    const approvalValid=check.checkId!=='owner-approval' ||
      (row.authorityRef===OWNER_APPROVAL_REF && items(row.evidenceRefs).includes(OWNER_APPROVAL_REF));
    if (row.stage!==check.stage || row.evidenceClass!==check.evidenceClass || row.outcome!=='pass' ||
        typeof row.authorityRef!=='string' || !row.authorityRef.trim() ||
        !Number.isFinite(time(row.recordedAt)) || !approvalValid) {
      failedChecks.push(check.checkId); continue;
    }
    passedChecks++;
  }
  const enabled=snapshot?.enabled===true;
  const expires=time(snapshot?.qualification?.validUntil);
  const qualified=snapshot?.providerId===PROVIDER && snapshot.enabled===false &&
    snapshot.qualification?.state==='qualified' &&
    items(snapshot.qualification.qualifiedCapabilities).includes(CAPABILITY) &&
    Number.isFinite(expires) && expires>now.getTime();
  const health=snapshot?.health;
  const age=now.getTime()-time(health?.checkedAt);
  const healthFresh=health?.status==='healthy' && Number.isFinite(age) &&
    age>=0 && age<=maxHealthAgeMs && typeof health?.evidenceRef==='string' && !!health.evidenceRef.trim();
  const evidenceComplete=profile?.providerId===PROVIDER && profile.capability===CAPABILITY &&
    expected.length===15 && passedChecks===expected.length && !missingChecks.length && !failedChecks.length;
  const reasons=[];
  if (enabled) reasons.push('UNEXPECTED_PROVIDER_ENABLED');
  if (!qualified) reasons.push('QUALIFICATION_NOT_VALID');
  if (!evidenceComplete) reasons.push('QUALIFICATION_EVIDENCE_INCOMPLETE');
  if (!healthFresh) reasons.push('FRESH_PERSISTED_HEALTH_REQUIRED');
  reasons.push('INDEPENDENT_STATE_WRITE_IDENTITY_REQUIRED','EXPLICIT_ACTIVATION_APPROVAL_REQUIRED');
  return Object.freeze({
    providerId:PROVIDER,capability:CAPABILITY,
    status:enabled?'ALERT':!qualified||!evidenceComplete?'BLOCKED':'SAFE_HOLD',
    qualified:Boolean(qualified),enabled,
    expectedChecks:expected.length,passedChecks,evidenceComplete,
    missingChecks:Object.freeze(missingChecks),failedChecks:Object.freeze(failedChecks),
    healthFresh:Boolean(healthFresh),
    qualificationValidUntil:Number.isFinite(expires)?new Date(expires).toISOString():null,
    activationAuthorized:false,canActivate:false,
    blockingGates:Object.freeze([...new Set(reasons)])
  });
}
