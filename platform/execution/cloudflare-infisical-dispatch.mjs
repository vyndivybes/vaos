// Cloudflare Cron Trigger -> existing qualified GitHub Actions health workflow.
// This dispatcher cannot read Infisical secrets, write provider state, or reactivate routing.
// A dedicated GitHub Actions:write token must be provisioned as a Cloudflare Worker secret.
export async function dispatchInfisicalWatchdog({token,fetchImpl=fetch}={}) {
  if (typeof token !== 'string' || !token.trim()) return {status:'unconfigured'};
  const normalizedToken=token.trim();
  const url='https://api.github.com/repos/vyndivybes/vaos/actions/workflows/infisical-scoped-commissioning.yml/dispatches';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort('VAOS_GITHUB_DISPATCH_TIMEOUT'),12_000);
  let response;
  try {
    response=await fetchImpl(url,{
      method:'POST',
      redirect:'error',
      headers:{
        Authorization:'Bearer '+normalizedToken,
        Accept:'application/vnd.github+json',
        'User-Agent':'vaos-infisical-watchdog',
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json',
      },
      body:JSON.stringify({ref:'main',inputs:{action:'record-health'}}),
      signal:controller.signal,
    });
  } catch (error) {
    // Emit only a fixed, non-sensitive network category. Never log exception bodies,
    // URLs, headers, token values or arbitrary nested cause messages.
    const causeCode = error?.cause?.code;
    const safeCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
    const detail = controller.signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'TIMEOUT'
      : safeCodes.has(causeCode) ? causeCode : 'UNKNOWN';
    throw new Error('VAOS_GITHUB_DISPATCH_NETWORK_FAILED_' + detail);
  } finally {
    clearTimeout(timeout);
  }
  if(response.status!==204) throw new Error('VAOS_GITHUB_DISPATCH_HTTP_'+response.status);
  // Dispatch acknowledgment is not a successful canary: verify GitHub run and Supabase separately.
  return {status:'accepted'};
}

export function infisicalDispatchFailureCode(error) {
  const message = error instanceof Error ? error.message : '';
  return /^(VAOS_GITHUB_DISPATCH_HTTP_[1-5][0-9]{2}|VAOS_GITHUB_DISPATCH_NETWORK_FAILED(?:_(?:TIMEOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNKNOWN))?)$/.test(message)
    ? message : 'VAOS_GITHUB_DISPATCH_UNKNOWN_FAILED';
}
