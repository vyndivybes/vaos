// Cloudflare Cron Trigger -> existing qualified GitHub Actions health workflow.
// This dispatcher cannot read Infisical secrets, write provider state, or reactivate routing.
// A dedicated GitHub Actions:write token must be provisioned as a Cloudflare Worker secret.
export async function dispatchInfisicalWatchdog({token,fetchImpl=fetch}={}) {
  if (typeof token !== 'string' || !token.trim()) return {status:'unconfigured'};
  const url='https://api.github.com/repos/vyndivybes/vaos/actions/workflows/infisical-scoped-commissioning.yml/dispatches';
  let response;
  try {
    response=await fetchImpl(url,{
      method:'POST',
      redirect:'error',
      headers:{
        Authorization:'Bearer '+token,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json',
      },
      body:JSON.stringify({ref:'main',inputs:{action:'record-health'}}),
      signal:AbortSignal.timeout(12_000),
    });
  } catch {
    // No retry on ambiguous POST outcomes; response/error data can contain credentials.
    throw new Error('VAOS_GITHUB_DISPATCH_NETWORK_FAILED');
  }
  if(response.status!==204) throw new Error('VAOS_GITHUB_DISPATCH_HTTP_'+response.status);
  // Dispatch acknowledgment is not a successful canary: verify GitHub run and Supabase separately.
  return {status:'accepted'};
}
