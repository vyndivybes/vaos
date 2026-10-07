function normalizeRecoveryError(error) {
  return {
    code: typeof error?.code === 'string' && error.code ? error.code : 'ADAPTER_EXECUTION_FAILED',
    retryable: typeof error?.retryable === 'boolean' ? error.retryable : true,
    message: typeof error?.message === 'string' ? error.message.slice(0, 240) : 'ADAPTER_EXECUTION_FAILED',
  };
}

export async function executeQualificationRecovery({ store, registry, workerId, failedJob }) {
  if (typeof store?.claimQualificationRecovery !== 'function') return null;

  const recoveryJob = await store.claimQualificationRecovery(failedJob, { workerId });
  if (!recoveryJob) return null;

  const adapter = registry.get(recoveryJob.actionType);
  if (!adapter) return null;

  try {
    const result = await adapter.execute(recoveryJob);
    if (result?.verification?.verified !== true) {
      const failed = await store.failExecution(recoveryJob, {
        code: 'EXECUTION_VERIFICATION_FAILED',
        retryable: false,
        message: 'Execution adapter did not produce verified evidence',
      });
      return { status: failed?.outcome || 'DEAD_LETTER', jobId: recoveryJob.id };
    }
    const completed = await store.completeExecution(recoveryJob, result);
    return {
      status: completed?.outcome || 'SUCCEEDED',
      jobId: recoveryJob.id,
      adapterId: result.adapterId,
      recovered: true,
    };
  } catch (error) {
    const failed = await store.failExecution(recoveryJob, normalizeRecoveryError(error));
    return { status: failed?.outcome || 'RETRY_SCHEDULED', jobId: recoveryJob.id };
  }
}
