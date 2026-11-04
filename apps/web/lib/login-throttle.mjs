// Sliding-window login throttle.
//
// Limits are checked BEFORE any password hashing, so a flood of attempts cannot
// be used to burn CPU on PBKDF2 either.
//
// Scope note: state lives in this isolate's memory. On Cloudflare Workers each
// isolate keeps its own counters, so this is defence-in-depth, not a global
// limit. Add a Cloudflare Rate Limiting rule on POST /api/login as the
// authoritative control (see docs/security/login-hardening.md).
//
// The per-email ceiling is deliberately higher than the per-IP ceiling: with a
// tiny, known account list an attacker could otherwise lock the founders out by
// failing logins on purpose.
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_IP_LIMIT = 5;
const DEFAULT_EMAIL_LIMIT = 20;
const DEFAULT_MAX_KEYS = 5000;

export function createLoginThrottle({
  windowMs = DEFAULT_WINDOW_MS,
  ipLimit = DEFAULT_IP_LIMIT,
  emailLimit = DEFAULT_EMAIL_LIMIT,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
} = {}) {
  const failures = new Map(); // key -> ascending array of failure timestamps (ms)

  function live(key, t) {
    const list = failures.get(key);
    if (!list) return [];
    const fresh = list.filter((ts) => ts > t - windowMs);
    if (fresh.length === 0) failures.delete(key);
    else if (fresh.length !== list.length) failures.set(key, fresh);
    return fresh;
  }

  function retryAfterSeconds(key, limit, t) {
    const list = live(key, t);
    if (list.length < limit) return 0;
    return Math.max(1, Math.ceil((list[list.length - limit] + windowMs - t) / 1000));
  }

  function push(key, t) {
    const list = live(key, t);
    list.push(t);
    failures.set(key, list);
    while (failures.size > maxKeys) failures.delete(failures.keys().next().value);
  }

  return Object.freeze({
    check({ ip, email }) {
      const t = now();
      const wait = Math.max(
        retryAfterSeconds(`ip:${ip}`, ipLimit, t),
        retryAfterSeconds(`email:${email}`, emailLimit, t),
      );
      return wait > 0 ? { allowed: false, retryAfterSeconds: wait } : { allowed: true };
    },
    recordFailure({ ip, email }) {
      const t = now();
      push(`ip:${ip}`, t);
      push(`email:${email}`, t);
    },
    recordSuccess({ ip, email }) {
      failures.delete(`ip:${ip}`);
      failures.delete(`email:${email}`);
    },
    size: () => failures.size,
  });
}

export function loginIdentity(req, email) {
  const headers = req?.headers || {};
  const ip = String(headers["cf-connecting-ip"] || headers["CF-Connecting-IP"] || "unknown").slice(0, 64);
  const normalized = typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
  return { ip, email: normalized };
}

export const loginThrottle = createLoginThrottle();
