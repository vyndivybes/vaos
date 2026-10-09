const HOLD=(reason,extra={})=>Object.freeze({status:'HOLD',reason,...extra});
export function createGitHubEvidenceVerifier({fetchImpl=fetch,token,repository='vyndivybes/vaos'}={}){
  return Object.freeze({async verify(payload){
    if(!/^[0-9a-f]{40}$/i.test(payload?.commit_sha||'')||!/^[0-9]+$/.test(payload?.run_id||''))return HOLD('INVALID_GITHUB_EVIDENCE');
    if(payload.evidence_url!==`https://github.com/${repository}/actions/runs/${payload.run_id}`)return HOLD('EVIDENCE_URL_MISMATCH');
    if(!token)return HOLD('GITHUB_READ_TOKEN_MISSING');
    const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};
    async function get(path){
      const response=await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs/${payload.run_id}${path}`,{headers});
      if(!response.ok)throw Error('GITHUB_READ_FAILED');
      return response.json();
    }
    try{
      const run=await get('');
      if(String(run.id)!==payload.run_id||run.head_sha?.toLowerCase()!==payload.commit_sha.toLowerCase()||run.repository?.full_name!==repository)return HOLD('RUN_COMMIT_MISMATCH');
      if(run.status!=='completed')return HOLD('RUN_NOT_COMPLETE');
      if(run.conclusion!=='success')return HOLD('RUN_NOT_SUCCESS');
      const jobs=await get('/jobs?per_page=100');
      if(!Array.isArray(jobs.jobs)||!jobs.jobs.length||jobs.total_count>jobs.jobs.length)return HOLD('JOBS_INCOMPLETE');
      if(jobs.jobs.some(j=>j.status!=='completed'||j.conclusion!=='success'))return HOLD('JOB_NOT_SUCCESS');
      return Object.freeze({status:'PASS',reason:'GITHUB_RUN_AND_JOBS_VERIFIED',runId:payload.run_id,commitSha:payload.commit_sha,verifiedJobCount:jobs.jobs.length});
    }catch{return HOLD('GITHUB_VERIFICATION_UNAVAILABLE')}
  }});
}
