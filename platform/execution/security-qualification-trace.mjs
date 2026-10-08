function requiredText(value, key) {
  const resolved = value?.[key];
  if (typeof resolved !== 'string' || !resolved.trim()) throw new Error(`ADAPTER_PAYLOAD_INVALID:${key}`);
  return resolved.trim();
}

function terminalError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

export async function createSecurityQualificationTrace({ port, job }) {
  const trace = job?.payload?.qualificationTrace;
  if (!trace) return null;

  if (
    job?.payload?.qualificationMode !== true
    || job?.payload?.qualificationRecoveryDrill !== true
    || Number(job?.attemptCount) < 2
  ) {
    throw terminalError('QUALIFICATION_TRACE_REQUIRES_RECOVERY');
  }

  if (typeof port?.linkQualificationTrace !== 'function') {
    throw terminalError('DOMAIN_PORT_REQUIRED:securityQualificationTrace');
  }

  const input = {
    sourceRiskId: requiredText(trace, 'sourceRiskId'),
    targetBaseline: requiredText(trace, 'targetBaseline'),
    relationType: requiredText(trace, 'relationType'),
  };

  const linked = await port.linkQualificationTrace(job, input);
  if (!linked || !['CREATED', 'REPLAY'].includes(linked.outcome) || !linked.link?.id) {
    throw terminalError(`SECURITY_QUALIFICATION_TRACE_FAILED:${linked?.outcome || 'UNKNOWN'}`);
  }
  if (linked.link.executionJobId !== job.id || linked.link.intentId !== job.intentId) {
    throw terminalError('SECURITY_QUALIFICATION_TRACE_MISMATCH');
  }
  return linked.link;
}
