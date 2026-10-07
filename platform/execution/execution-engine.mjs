import { executeQualificationRecovery } from './qualification-recovery.mjs';

function errorEnvelope(error, code = 'ADAPTER_EXECUTION_FAILED', retryable = true) {
  const resolvedCode = typeof error?.code === 'string' && error.code ? error.code : code;
  const resolvedRetryable = typeof error?.retryable === 'boolean' ? error.retryable : retryable;
  return {
    code: resolvedCode,
    retryable: resolvedRetryable,
    message: typeof error?.message === 'string' ? error.message.slice(0, 240) : resolvedCode,
  };
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
        message: `No execution adapter registered for ${job.actionType}`,
      });
      return { status: failed?.outcome || 'DEAD_LETTER', jobId: job.id };
    }

    try {
      const result = await adapter.execute(job);
      if (result?.verification?.verified !== true) {
        const failed = await store.failExecution(job, {
          code: 'EXECUTION_VERIFICATION_FAILED',
          retryable: false,
          message: 'Execution adapter did not produce verified evidence',
        });
        return { status: failed?.outcome || 'DEAD_LETTER', jobId: job.id };
      }

      const completed = await store.completeExecution(job, result);
      return { status: completed?.outcome || 'SUCCEEDED', jobId: job.id, adapterId: result.adapterId };
    } catch (error) {
      const envelope = errorEnvelope(error);
      const failed = await store.failExecution(job, envelope);
      if (
        envelope.code === 'QUALIFICATION_RECOVERY_DRILL_RETRY'
        && failed?.outcome === 'RETRY_SCHEDULED'
        && Number(job.attemptCount) === 1
      ) {
        const recovered = await executeQualificationRecovery({ store, registry, workerId, failedJob: job });
        if (recovered) return recovered;
      }
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
