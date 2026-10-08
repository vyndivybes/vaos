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
    claimQualificationRecovery(job, input) {
      return invoke('claimQualificationRecovery', {
        jobId: job.id,
        workerId: input.workerId,
      });
    },
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
    linkRiskQualificationTrace(job, input) {
      return invoke('linkRiskQualificationTrace', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        targetDomain: input.targetDomain,
        targetResourceId: input.targetResourceId,
        relationType: input.relationType,
      });
    },
    observeIdentity(job, input) {
      return invoke('observeIdentity', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        observationId: input.observationId,
      });
    },
    getIdentityObservation(job, observationId) {
      return invoke('getIdentityObservation', {
        jobId: job.id,
        observationId,
      });
    },
    linkSecurityQualificationTrace(job, input) {
      return invoke('linkSecurityQualificationTrace', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        sourceRiskId: input.sourceRiskId,
        targetBaseline: input.targetBaseline,
        relationType: input.relationType,
      });
    },
    linkDomainRecords(job, input) {
      return invoke('linkDomainRecords', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        sourceDomain: input.sourceDomain,
        sourceRecordId: input.sourceRecordId,
        relationType: input.relationType,
        targetDomain: input.targetDomain,
        targetRecordId: input.targetRecordId,
        proposedBy: input.createdBy,
        context: input.context || {},
      });
    },
    getDomainLink(job, input) {
      return invoke('getDomainLink', {
        jobId: job.id,
        sourceDomain: input.sourceDomain,
        sourceRecordId: input.sourceRecordId,
        relationType: input.relationType,
        targetDomain: input.targetDomain,
        targetRecordId: input.targetRecordId,
      });
    },
    getDigitalEmployee(employeeId) {
      return invoke('getDigitalEmployee', { employeeId });
    },
    transitionDigitalEmployee(job, input) {
      return invoke('transitionDigitalEmployee', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        employeeId: input.employeeId,
        actionType: job.actionType,
        qualificationLevel: input.qualificationLevel ?? null,
        evidenceRefs: input.evidenceRefs || [],
      });
    },
    assessDigitalEmployeeQualification(job, input) {
      return invoke('assessDigitalEmployeeQualification', {
        jobId: job.id,
        leaseToken: job.leaseToken,
        employeeId: input.employeeId,
        targetLevel: input.targetLevel,
        profileId: input.profileId,
      });
    },
    getQualificationAssessment(job, employeeId) {
      return invoke('getQualificationAssessment', {
        jobId: job.id,
        employeeId,
      });
    },
  });
}
