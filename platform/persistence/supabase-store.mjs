function required(value, name) {
  if (!value) throw new Error(`SUPABASE_CONFIG_MISSING:${name}`);
  return value;
}

export function createSupabaseControlStore({
  url,
  serverSecret,
  fetchImpl = globalThis.fetch,
} = {}) {
  const baseUrl = required(url, 'url').replace(/\/$/, '');
  const secret = required(serverSecret, 'serverSecret');
  if (typeof fetchImpl !== 'function') throw new Error('SUPABASE_CONFIG_MISSING:fetch');

  async function invoke(operation, payload = {}) {
    const response = await fetchImpl(`${baseUrl}/functions/v1/vaos-control`, {
      method: 'POST',
      headers: {
        'x-vaos-server-key': secret,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ operation, payload }),
    });

    if (!response.ok) throw new Error(`SUPABASE_EDGE_FAILED:${response.status}`);
    return response.json();
  }

  return Object.freeze({
    snapshot() { return invoke('snapshot'); },
    submitIntent(input) { return invoke('submitIntent', input); },
    decideApproval(approvalId, input) { return invoke('decideApproval', { approvalId, ...input }); },
    claimExecution(input) { return invoke('claimExecution', input); },
    completeExecution(job, result) {
      return invoke('completeExecution', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        adapterId: result.adapterId,
        effect: result.effect,
        verification: result.verification,
      });
    },
    failExecution(job, error) {
      return invoke('failExecution', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        error,
      });
    },
  });
}
