import fs from 'node:fs';
const REPOSITORY = 'vyndivybes/vaos';
const WORKFLOW = 'infisical-scoped-commissioning';
const IDENTITY = 'github-infisical-production-watchdog';
export function evaluateWatchdog({ runs, production, now = new Date(), maxAgeMinutes = 35 }) {
  const reasons = [];
  const current = now.getTime();
  const candidates = (Array.isArray(runs) ? runs : []).filter(
    run => run.name === WORKFLOW && run.event === 'schedule'
  ).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const run = candidates[0] || null;
  if (!run) reasons.push('NO_SCHEDULED_EXECUTION');
  else {
    const created = Date.parse(run.created_at);
    if (!Number.isFinite(created) || created > current + 60_000 || current - created > maxAgeMinutes * 60_000)
      reasons.push('SCHEDULED_EXECUTION_STALE');
    if (run.status !== 'completed' || run.conclusion !== 'success') reasons.push('SCHEDULED_EXECUTION_UNSUCCESSFUL');
  }
  const record = production?.watchdog;
  if (!record || typeof record !== 'object') reasons.push('PRODUCTION_READBACK_MISSING');
  else {
    if (record.identityId !== IDENTITY) reasons.push('IDENTITY_MISMATCH');
    if (record.health?.status !== 'healthy') reasons.push('PRODUCTION_UNHEALTHY');
    const checked = Date.parse(record.health?.checkedAt);
    if (!Number.isFinite(checked) || checked > current + 60_000 || current - checked > maxAgeMinutes * 60_000)
      reasons.push('PRODUCTION_HEALTH_STALE');
    const auth = Date.parse(record.lastAuthenticatedAt);
    if (!Number.isFinite(auth) || auth > current + 60_000 || (run && auth < Date.parse(run.created_at)))
      reasons.push('AUTHENTICATION_NOT_CONFIRMED');
    if (run && record.health?.evidenceRef !== run.html_url) reasons.push('EVIDENCE_RUN_MISMATCH');
  }
  return {
    schemaVersion: 1, verifier: 'separate-read-only-github-actions',
    repository: REPOSITORY, checkedAt: now.toISOString(),
    outcome: reasons.length ? 'FAIL' : 'PASS', reasons,
    watchdogRunId: run?.id ?? null,
    watchdogRunUrl: run?.html_url ?? null,
    productionEvidenceRef: record?.health?.evidenceRef ?? null
  };
}
async function main() {
  const token = process.env.GITHUB_TOKEN;
  const readToken = process.env.VAOS_INDEPENDENT_READ_TOKEN;
  const readUrl = process.env.VAOS_INDEPENDENT_READ_URL;
  if (!token || !readToken || !readUrl) throw Error('INDEPENDENT_VERIFIER_CONFIGURATION_MISSING');
  const u = new URL(readUrl);
  if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname))
    throw Error('INDEPENDENT_READ_URL_NOT_APPROVED');
  const gh = await fetch('https://api.github.com/repos/' + REPOSITORY + '/actions/runs?event=schedule&per_page=30', {
    headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'}
  });
  if (!gh.ok) throw Error('GITHUB_RUNS_READ_FAILED_HTTP_' + gh.status);
  const response = await fetch(u, { headers: { Authorization: 'Bearer ' + readToken, 'Cache-Control':'no-store' }});
  if (!response.ok) throw Error('INDEPENDENT_PRODUCTION_READ_FAILED_HTTP_' + response.status);
  const result = evaluateWatchdog({ runs: (await gh.json()).workflow_runs, production: await response.json() });
  fs.mkdirSync('qualification-evidence/independent-watchdog', {recursive:true});
  fs.writeFileSync('qualification-evidence/independent-watchdog/latest.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (result.outcome !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(error => {
    const result = {schemaVersion:1, verifier:'separate-read-only-github-actions', checkedAt:new Date().toISOString(), outcome:'FAIL', reasons:[error.message]};
    fs.mkdirSync('qualification-evidence/independent-watchdog', {recursive:true});
    fs.writeFileSync('qualification-evidence/independent-watchdog/latest.json', JSON.stringify(result,null,2)+'\n');
    console.error(error.message);
    process.exitCode=1;
  });
}
