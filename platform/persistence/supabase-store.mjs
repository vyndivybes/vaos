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
    async snapshot() {
      const [snapshot, digitalThreadLinks] = await Promise.all([
        invoke('snapshot'),
        invoke('traceLinks'),
      ]);
      return { ...snapshot, digitalThreadLinks: Array.isArray(digitalThreadLinks) ? digitalThreadLinks : [] };
    },
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
    openCapa(job, input) {
      return invoke('openCapa', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        capaId: input.capaId,
      });
    },
    getCapa(job, capaId) {
      return invoke('getCapa', {
        jobId: job.id,
        capaId,
      });
    },
    recordBaselineChange(job, input) {
      return invoke('recordBaselineChange', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        baseline: input.baseline,
      });
    },
    getBaselineChange(job, baseline) {
      return invoke('getBaselineChange', {
        jobId: job.id,
        baseline,
      });
    },
    escalateRisk(job, input) {
      return invoke('escalateRisk', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        riskId: input.riskId,
      });
    },
    getRiskEscalation(job, riskId) {
      return invoke('getRiskEscalation', {
        jobId: job.id,
        riskId,
      });
    },
    linkDomainRecords(input) {
      return invoke('linkDomainRecords', {
        sourceDomain: input.sourceDomain,
        sourceRecordId: input.sourceRecordId,
        relationType: input.relationType,
        targetDomain: input.targetDomain,
        targetRecordId: input.targetRecordId,
        createdBy: input.createdBy,
        context: input.context || {},
      });
    },
  });
}
