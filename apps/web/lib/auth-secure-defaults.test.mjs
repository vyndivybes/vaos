import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  parseCookies,
  sha256,
  verifyDevelopmentCredential,
  verifyPasswordAgainstHash,
  verifySessionToken,
} from "./auth.mjs";

const MAKER = "shyamsundhar1982@gmail.com";
const CHECKER = "kaaviyam1519@gmail.com";
// The digest that used to be a built-in default. It must never authenticate anyone.
const OLD_DEFAULT_DIGEST = "11c5ab3591e9d8c06eeac2afa5d6639021b569e46ae1efbb74f8dc4b81bf08d1";
const KEYS = [
  "VAOS_AUTH_HARDENED_CONTROL", "VAOS_SESSION_HMAC_KEY",
  "VAOS_DEV_LOGIN_PASSWORD_SHA256", "VAOS_DEV_CHECKER_PASSWORD_SHA256",
];

function withEnv(vars, fn) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try { return fn(); } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

// Fast PBKDF2 hashes for tests (minimum allowed iteration count).
const fast = (pw) => hashPassword(pw, { iterations: 100_000 });

test("no credential works when nothing is configured (no built-in default login)", () => {
  withEnv({}, () => {
    for (const email of [MAKER, CHECKER]) {
      for (const pw of ["", "password", "admin", "vaos", "changeme"]) {
        assert.equal(verifyDevelopmentCredential(email, pw), false);
      }
    }
  });
});

test("the old built-in digest is refused even if someone configures it", () => {
  withEnv({ VAOS_DEV_LOGIN_PASSWORD_SHA256: OLD_DEFAULT_DIGEST }, () => {
    // Whatever the password was, the denied digest can never be matched.
    assert.equal(verifyDevelopmentCredential(MAKER, "anything"), false);
  });
});

test("REGRESSION: a cookie forged with the old source-derived key is rejected", () => {
  // Old non-hardened behaviour: key = sha256("vaos-development-session-v1:" + <default digest>),
  // computable by anyone holding the source. That forged cookie must no longer verify.
  const oldKey = crypto.createHash("sha256")
    .update(`vaos-development-session-v1:${OLD_DEFAULT_DIGEST}`).digest("hex");
  const payload = Buffer.from(JSON.stringify({
    email: MAKER, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", oldKey).update(payload).digest("base64url");
  const forged = `${payload}.${sig}`;

  withEnv({}, () => assert.equal(verifySessionToken(forged), null));
  withEnv({ VAOS_DEV_LOGIN_PASSWORD_SHA256: sha256("some-configured-secret-1") },
    () => assert.equal(verifySessionToken(forged), null));
});

test("REGRESSION: a cookie signed with a key derived from the configured hash is rejected", () => {
  const digest = sha256("some-configured-secret-2");
  const derived = crypto.createHash("sha256")
    .update(`vaos-development-session-v1:${digest}`).digest("hex");
  const payload = Buffer.from(JSON.stringify({
    email: MAKER, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const forged = `${payload}.${crypto.createHmac("sha256", derived).update(payload).digest("base64url")}`;
  withEnv({ VAOS_DEV_LOGIN_PASSWORD_SHA256: digest }, () => {
    assert.equal(verifySessionToken(forged), null);
  });
});

test("non-hardened tokens still round-trip with an ephemeral per-process key", () => {
  withEnv({}, () => {
    const token = createSessionToken(MAKER, 60);
    assert.equal(verifySessionToken(token)?.email, MAKER);
  });
});

test("PBKDF2 hashes are salted, verifiable and tamper-evident", () => {
  const a = fast("a-long-enough-passphrase");
  const b = fast("a-long-enough-passphrase");
  assert.notEqual(a, b, "same password must produce different hashes (random salt)");
  assert.match(a, /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyPasswordAgainstHash("a-long-enough-passphrase", a), true);
  assert.equal(verifyPasswordAgainstHash("a-long-enough-passphrasX", a), false);
  const tampered = a.slice(0, -1) + (a.endsWith("A") ? "B" : "A");
  assert.equal(verifyPasswordAgainstHash("a-long-enough-passphrase", tampered), false);
});

test("PBKDF2 refuses alternate non-canonical text for exactly the same decoded bytes", () => {
  const password = "another-long-enough-test-passphrase";
  const saved = fast(password);
  const sections = saved.split("$");
  const canonical = sections[3];
  // A 32-byte digest has 4 padding bits in its final base64url sextet.
  // Toggle one of those unused bits without changing the decoded digest.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const finalIndex = alphabet.indexOf(canonical.at(-1));
  assert.ok(finalIndex >= 0);
  const alternative = canonical.slice(0, -1) + alphabet[finalIndex ^ 1];
  assert.notEqual(alternative, canonical);
  assert.deepEqual(Buffer.from(alternative, "base64url"), Buffer.from(canonical, "base64url"));
  const tampered = [sections[0], sections[1], sections[2], alternative].join("$");
  assert.equal(verifyPasswordAgainstHash(password, saved), true);
  assert.equal(verifyPasswordAgainstHash(password, tampered), false);
});

test("PBKDF2 parameters are bounded (no weak or CPU-bomb hashes)", () => {
  assert.throws(() => hashPassword("x".repeat(20), { iterations: 1_000 }), /ITERATIONS_INVALID/);
  assert.throws(() => hashPassword("x".repeat(20), { iterations: 50_000_000 }), /ITERATIONS_INVALID/);
  assert.throws(() => hashPassword("x".repeat(20), { salt: Buffer.alloc(4) }), /SALT_INVALID/);
  // A hand-written low-iteration hash in config is not accepted as a credential.
  const weak = `pbkdf2-sha256$1000$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(32, 2).toString("base64url")}`;
  withEnv({ VAOS_DEV_LOGIN_PASSWORD_SHA256: weak }, () => {
    assert.equal(verifyDevelopmentCredential(MAKER, "anything-at-all"), false);
  });
});

test("login works with PBKDF2 hashes and keeps maker and checker distinct", () => {
  withEnv({
    VAOS_DEV_LOGIN_PASSWORD_SHA256: fast("maker-passphrase-123"),
    VAOS_DEV_CHECKER_PASSWORD_SHA256: fast("checker-passphrase-456"),
  }, () => {
    assert.equal(verifyDevelopmentCredential(MAKER, "maker-passphrase-123"), true);
    assert.equal(verifyDevelopmentCredential(CHECKER, "checker-passphrase-456"), true);
    assert.equal(verifyDevelopmentCredential(MAKER, "checker-passphrase-456"), false);
    assert.equal(verifyDevelopmentCredential(CHECKER, "maker-passphrase-123"), false);
  });
});

test("hardened mode works end to end with PBKDF2 credentials", () => {
  withEnv({
    VAOS_AUTH_HARDENED_CONTROL: "dedicated-hmac-v1",
    VAOS_SESSION_HMAC_KEY: "ef".repeat(32),
    VAOS_DEV_LOGIN_PASSWORD_SHA256: fast("maker-passphrase-123"),
    VAOS_DEV_CHECKER_PASSWORD_SHA256: fast("checker-passphrase-456"),
  }, () => {
    assert.equal(verifyDevelopmentCredential(MAKER, "maker-passphrase-123"), true);
    const token = createSessionToken(MAKER);
    const session = verifySessionToken(token);
    assert.equal(session.email, MAKER);
    assert.equal(session.v, 2);
  });
});

test("hardened mode still refuses to run without configured credentials", () => {
  withEnv({ VAOS_AUTH_HARDENED_CONTROL: "dedicated-hmac-v1", VAOS_SESSION_HMAC_KEY: "ef".repeat(32) }, () => {
    assert.equal(verifyDevelopmentCredential(MAKER, "anything"), false);
    assert.throws(() => createSessionToken(MAKER), /HARDENED_AUTH_CONFIG_INVALID/);
  });
});

test("a malformed cookie header never throws", () => {
  assert.doesNotThrow(() => parseCookies("a=%E0%A4%A; b=ok"));
  assert.equal(parseCookies("b=ok").b, "ok");
  assert.equal(parseCookies(`${SESSION_COOKIE}=%`)[SESSION_COOKIE], "");
});
