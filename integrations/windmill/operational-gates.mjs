const deny = reason => Object.freeze({ decision:'DENY',reason });
const integer = value => Number.isInteger(value) && value >= 0;

/** Fail-closed admission for the *single* synthetic qualification path.
 * These predicates are not a substitute for an actual durable lease store.
 */
export function evaluateWindmillAdmission(state = {}) {
  if (state.approvedScript !== 'f/vaos/qualification_ping') return deny('SCRIPT_NOT_APPROVED');
  if (state.productionEnabled !== false || state.killSwitchEnabled !== false ||
      state.approvedAction !== true || state.leaseIsDurable !== true) return deny('AUTHORITY_OR_LEASE_UNSAFE');
  if (!integer(state.activeRuns) || !integer(state.queuedRuns) ||
      state.maxActiveRuns !== 1 || state.maxQueuedRuns !== 0 ||
      state.activeRuns !== 0 || state.queuedRuns !== 0) return deny('QUEUE_OR_CONCURRENCY_LIMIT');
  if (!integer(state.maxRuntimeSeconds) || state.maxRuntimeSeconds > 60 ||
      state.maxRuntimeSeconds < 1 || !integer(state.requestedRuntimeSeconds) ||
      state.requestedRuntimeSeconds < 1 ||
      state.requestedRuntimeSeconds > state.maxRuntimeSeconds) return deny('RUNTIME_BUDGET_EXCEEDED');
  if (!integer(state.snapshotAgeSeconds) || state.snapshotAgeSeconds > 30) return deny('STALE_OPERATIONS_SNAPSHOT');
  return Object.freeze({decision:'ALLOW', maxRuntimeSeconds:60,maxConcurrentRuns:1,maxQueuedRuns:0});
}

/** Evidence classifier only; does not cancel a live job. */
export function qualifyWindmillCancellationEvidence(input = {}) {
  if (typeof input.requestedJobId !== 'string' || !/^[a-zA-Z0-9-]{8,90}$/.test(input.requestedJobId) ||
      input.requestedJobId !== input.observedJobId || input.cancellationRequested !== true ||
      input.independentReadback !== true || input.observedCanceled !== true ||
      input.observedRunning !== false) {
    const error = new Error('WINDMILL_CANCELLATION_UNVERIFIED');
    error.code = 'WINDMILL_CANCELLATION_UNVERIFIED';
    throw error;
  }
  return Object.freeze({
    status:'PASS',
    observedState:'CANCELED',
    independentReadback:true,
    activationAuthorized:false,
  });
}
