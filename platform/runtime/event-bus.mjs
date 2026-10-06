import crypto from 'node:crypto';

function defaultNow() {
  return new Date().toISOString();
}

function defaultIdFactory() {
  return crypto.randomUUID();
}

function matches(pattern, type) {
  if (pattern === type) return true;
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
  return false;
}

function freezePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return Object.freeze(Array.isArray(payload) ? [...payload] : { ...payload });
}

export function createEventBus({
  now = defaultNow,
  idFactory = defaultIdFactory,
  maxHistory = 500,
} = {}) {
  const events = [];
  const subscriptions = new Map();
  let sequence = 0;
  let subscriptionSequence = 0;

  function publish(input) {
    if (!input || typeof input !== 'object') throw new Error('EVENT_REQUIRED');
    if (typeof input.type !== 'string' || !input.type.includes('.')) throw new Error('INVALID_EVENT_TYPE');
    if (typeof input.source !== 'string' || !input.source.trim()) throw new Error('INVALID_EVENT_SOURCE');

    const event = Object.freeze({
      id: idFactory(),
      sequence: ++sequence,
      type: input.type,
      source: input.source,
      payload: freezePayload(input.payload ?? {}),
      occurredAt: now(),
    });

    events.push(event);
    if (events.length > maxHistory) events.splice(0, events.length - maxHistory);

    for (const { pattern, handler } of subscriptions.values()) {
      if (matches(pattern, event.type)) handler(event);
    }

    return event;
  }

  function subscribe(pattern, handler) {
    if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('INVALID_EVENT_PATTERN');
    if (typeof handler !== 'function') throw new Error('INVALID_EVENT_HANDLER');

    const id = ++subscriptionSequence;
    subscriptions.set(id, { pattern, handler });
    return () => subscriptions.delete(id);
  }

  function history({ type } = {}) {
    return events.filter((event) => !type || matches(type, event.type)).slice();
  }

  return Object.freeze({ publish, subscribe, history });
}
