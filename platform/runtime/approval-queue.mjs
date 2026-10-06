import crypto from 'node:crypto';
import { stableHash } from './idempotency.mjs';

function defaultNow() {
  return new Date().toISOString();
}

function defaultIdFactory() {
  return crypto.randomUUID();
}

function clone(record) {
  return record ? { ...record, payload: record.payload && { ...record.payload } } : null;
}

export function createApprovalQueue({
  now = defaultNow,
  idFactory = defaultIdFactory,
} = {}) {
  const records = new Map();
  const byIdempotencyKey = new Map();

  function request(input) {
    if (!input?.idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    if (!input?.agentId || !input?.actionType) throw new Error('INVALID_APPROVAL_REQUEST');

    const requestHash = stableHash(input);
    const existingId = byIdempotencyKey.get(input.idempotencyKey);

    if (existingId) {
      const existing = records.get(existingId);
      if (existing.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
      return clone(existing);
    }

    const record = {
      id: idFactory(),
      status: 'PENDING',
      requestedAt: now(),
      decidedAt: null,
      decidedBy: null,
      decision: null,
      requestHash,
      ...input,
      payload: input.payload ? { ...input.payload } : {},
    };

    records.set(record.id, record);
    byIdempotencyKey.set(input.idempotencyKey, record.id);
    return clone(record);
  }

  function decide(id, { decision, decidedBy } = {}) {
    const normalized = String(decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(normalized)) throw new Error('INVALID_APPROVAL_DECISION');
    if (!decidedBy) throw new Error('DECIDED_BY_REQUIRED');

    const record = records.get(id);
    if (!record) throw new Error('APPROVAL_NOT_FOUND');

    if (record.status !== 'PENDING') {
      if (record.status === normalized && record.decidedBy === decidedBy) return clone(record);
      throw new Error('APPROVAL_ALREADY_DECIDED');
    }

    record.status = normalized;
    record.decision = normalized;
    record.decidedBy = decidedBy;
    record.decidedAt = now();
    return clone(record);
  }

  function pending() {
    return [...records.values()].filter((record) => record.status === 'PENDING').map(clone);
  }

  function all() {
    return [...records.values()].map(clone);
  }

  function get(id) {
    return clone(records.get(id));
  }

  return Object.freeze({ request, decide, pending, all, get });
}
