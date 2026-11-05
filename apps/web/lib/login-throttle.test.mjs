import test from "node:test";
import assert from "node:assert/strict";
import { createLoginThrottle, loginIdentity } from "./login-throttle.mjs";

const who = { ip: "203.0.113.7", email: "shyamsundhar1982@gmail.com" };

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test("allows attempts under the per-IP limit and blocks the next one", () => {
  const c = clock();
  const throttle = createLoginThrottle({ now: c.now, ipLimit: 5, emailLimit: 20 });
  for (let i = 0; i < 5; i++) {
    assert.equal(throttle.check(who).allowed, true);
    throttle.recordFailure(who);
  }
  const blocked = throttle.check(who);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 900);
});

test("the lock lifts once the oldest failure leaves the window", () => {
  const c = clock();
  const throttle = createLoginThrottle({ now: c.now, windowMs: 60_000, ipLimit: 3 });
  for (let i = 0; i < 3; i++) throttle.recordFailure(who);
  assert.equal(throttle.check(who).allowed, false);
  c.advance(59_000);
  assert.equal(throttle.check(who).allowed, false);
  c.advance(2_000);
  assert.equal(throttle.check(who).allowed, true);
});

test("rotating IPs is still bounded by the per-email ceiling", () => {
  const c = clock();
  const throttle = createLoginThrottle({ now: c.now, ipLimit: 5, emailLimit: 20 });
  for (let i = 0; i < 20; i++) {
    const attacker = { ip: `198.51.100.${i}`, email: who.email };
    assert.equal(throttle.check(attacker).allowed, true, `attempt ${i + 1} should be allowed`);
    throttle.recordFailure(attacker);
  }
  assert.equal(throttle.check({ ip: "198.51.100.250", email: who.email }).allowed, false);
});

test("a flood from one IP does not lock a different IP out of a different account", () => {
  const throttle = createLoginThrottle({ ipLimit: 3 });
  for (let i = 0; i < 3; i++) throttle.recordFailure({ ip: "198.51.100.1", email: "kaaviyam1519@gmail.com" });
  assert.equal(throttle.check({ ip: "198.51.100.1", email: "x@example.com" }).allowed, false);
  assert.equal(throttle.check({ ip: "203.0.113.9", email: who.email }).allowed, true);
});

test("a successful login clears the counters", () => {
  const throttle = createLoginThrottle({ ipLimit: 3 });
  throttle.recordFailure(who); throttle.recordFailure(who);
  throttle.recordSuccess(who);
  throttle.recordFailure(who); throttle.recordFailure(who);
  assert.equal(throttle.check(who).allowed, true);
});

test("memory is bounded under a key-flood", () => {
  const throttle = createLoginThrottle({ maxKeys: 100 });
  for (let i = 0; i < 5_000; i++) throttle.recordFailure({ ip: `10.0.${i >> 8}.${i & 255}`, email: `u${i}@example.com` });
  assert.ok(throttle.size() <= 100);
});

test("identity extraction is defensive", () => {
  assert.deepEqual(loginIdentity({ headers: { "cf-connecting-ip": "203.0.113.7" } }, "  A@B.com "),
    { ip: "203.0.113.7", email: "a@b.com" });
  assert.deepEqual(loginIdentity({}, { not: "a string" }), { ip: "unknown", email: "" });
  assert.equal(loginIdentity({ headers: { "cf-connecting-ip": "x".repeat(500) } }, "a").ip.length, 64);
});
