function requiredText(value, key) {
  const resolved = value?.[key];
  if (typeof resolved !== 'string' || !resolved.trim()) throw new Error(`ADAPTER_PAYLOAD_INVALID:${key}`);
  return resolved.trim();
}

export async function createRiskQualificationTrace({ port, job }) {
  const trace = job?.payload?.qualificationTrace;
  if (!trace) return null;

  if (
    job?.payload?.qualificationMode !== true
    || job?.payload?.qualificationRecoveryDrill !== true
    || Number(job?.attemptCount) < 2
  ) {
    const error = new Error('QUALIFICATION_TRACE_REQUIRES_RECOVERY');
    error.code = 'QUALIFICATION_TRACE_REQUIRES_RECOVERY';
    error.retryable = false;
    throw error;
  }

  if (typeof port?.linkQualificationTrace !== 'function') {
    const error = new Error('DOMAIN_PORT_REQUIRED:projectRiskQualificationTrace');
    error.code = 'DOMAIN_PORT_REQUIRED:projectRiskQualificationTrace';
    error.retryable = false;
    throw error;
  }

  const input = {
    targetDomain: requiredText(trace, 'targetDomain'),
    targetResourceId: requiredText(trace, 'targetResourceId'),
    relationType: requiredText(trace, 'relationType'),
  };
  const linked = await port.linkQualificationTrace(job, input);

  if (!linked || !['CREATED', 'REPLAY'].includes(linked.outcome) || !linked.link?.id) {
    const error = new Error(`PROJECT_RISK_QUALIFICATION_TRACE_FAILED:${linked?.outcome || 'UNKNOWN'}`);
    error.code = 'PROJECT_RISK_QUALIFICATION_TRACE_FAILED';
    error.retryable = false;
    throw error;
  }
  if (linked.link.executionJobId !== job.id || linked.link.intentId !== job.intentId) {
    const error = new Error('PROJECT_RISK_QUALIFICATION_TRACE_MISMATCH');
    error.code = 'PROJECT_RISK_QUALIFICATION_TRACE_MISMATCH';
    error.retryable = false;
    throw error;
  }

  return linked.link;
}
