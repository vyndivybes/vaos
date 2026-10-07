function errorEnvelope(error, code = 'ADAPTER_EXECUTION_FAILED', retryable = true) {
  const resolvedCode = typeof error?.code === 'string' && error.code ? error.code : code;
  const resolvedRetryable = typeof error?.retryable === 'boolean' ? error.retryable : retryable;
  const envelope = {
    code: resolvedCode,
    retryable: resolvedRetryable,
  };
  if (typeof error?.outcomeUnknown === 'boolean') envelope.outcomeUnknown = error.outcomeUnknown;
  if (
    (typeof error?.providerRunId === 'string' && error.providerRunId.trim())
    || Number.isFinite(error?.providerRunId)
  ) {
    envelope.providerRunId = String(error.providerRunId);
  }
  return envelope;
}

export function createExecutionEngine({
  store,
  registry,
  workerId = 'vaos-execution-worker',
} = {}) {
  if (!store) throw new Error('EXECUTION_STORE_REQUIRED');
  if (!registry) throw new Error('EXECUTION_REGISTRY_REQUIRED');

  async function processOne() {
    const job = await store.claimExecution({ workerId });
    if (!job) return { status: 'EMPTY' };

    const adapter = registry.get(job.actionType);
    if (!adapter) {
      const failed = await store.failExecution(job, {
        code: 'EXECUTION_ADAPTER_NOT_FOUND',
        retryable: false,
      });
      return { status: failed?.outcome || 'DEAD_LETTER', jobId: job.id };
    }

    try {
      const result = await adapter.execute(job);
      if (result?.verification?.verified !== true) {
        const failed = await store.failExecution(job, {
          code: 'EXECUTION_VERIFICATION_FAILED',
          retryable: false,
        });
        return { status: failed?.outcome || 'DEAD_LETTER', jobId: job.id };
      }

      const completed = await store.completeExecution(job, result);
      return { status: completed?.outcome || 'SUCCEEDED', jobId: job.id, adapterId: result.adapterId };
    } catch (error) {
      const failed = await store.failExecution(job, errorEnvelope(error));
      return { status: failed?.outcome || 'RETRY_SCHEDULED', jobId: job.id };
    }
  }

  async function drain({ limit = 5 } = {}) {
    const bounded = Math.max(1, Math.min(10, Number(limit) || 5));
    const outcomes = [];
    for (let index = 0; index < bounded; index += 1) {
      const outcome = await processOne();
      if (outcome.status === 'EMPTY') break;
      outcomes.push(outcome);
    }
    return {
      processed: outcomes.length,
      succeeded: outcomes.filter((item) => ['SUCCEEDED', 'REPLAY'].includes(item.status)).length,
      retryScheduled: outcomes.filter((item) => item.status === 'RETRY_SCHEDULED').length,
      deadLettered: outcomes.filter((item) => item.status === 'DEAD_LETTER').length,
      remainingCapacity: bounded - outcomes.length,
      outcomes,
    };
  }

  return Object.freeze({ processOne, drain });
}
