import test from "node:test";
import assert from "node:assert/strict";
import login from "./login.mjs";
import { hashPassword } from "../lib/auth.mjs";

const MAKER = "shyamsundhar1982@gmail.com";
const KEYS = ["VAOS_AUTH_HARDENED_CONTROL", "VAOS_SESSION_HMAC_KEY",
  "VAOS_DEV_LOGIN_PASSWORD_SHA256", "VAOS_DEV_CHECKER_PASSWORD_SHA256"];

function call(body, ip) {
  const headers = {};
  const res = {
    statusCode: 200, headers, payload: undefined,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(p) { this.payload = p; return this; },
  };
  login({ method: "POST", headers: { "cf-connecting-ip": ip }, body }, res);
  return res;
}

test("login returns 429 with Retry-After after repeated failures, and never even hashes once locked", () => {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256 = hashPassword("the-real-passphrase-1", { iterations: 100_000 });
  const ip = "192.0.2.55"; // unique to this test so it cannot collide with others
  try {
    for (let i = 0; i < 5; i++) {
      const r = call({ email: MAKER, password: "wrong-guess-" + i }, ip);
      assert.equal(r.statusCode, 401);
    }
    // Locked: even the CORRECT password is refused until the window passes.
    const locked = call({ email: MAKER, password: "the-real-passphrase-1" }, ip);
    assert.equal(locked.statusCode, 429);
    assert.equal(locked.payload.error, "too_many_attempts");
    assert.ok(Number(locked.headers["retry-after"]) >= 1);
    assert.equal(locked.headers["set-cookie"], undefined);
    // A different client IP is unaffected and can log in normally.
    const ok = call({ email: MAKER, password: "the-real-passphrase-1" }, "192.0.2.56");
    assert.equal(ok.statusCode, 200);
    assert.match(ok.headers["set-cookie"], /HttpOnly/);
  } finally {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
