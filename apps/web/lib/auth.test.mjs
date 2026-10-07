import test from "node:test";
import assert from "node:assert/strict";
import {
  constantTimeEqual,
  createSessionToken,
  isAllowedEmail,
  sha256,
  verifyDevelopmentCredential,
  verifyPasswordAgainstHash,
  verifySessionToken,
} from "./auth.mjs";

test("constantTimeEqual handles equal and unequal values", () => {
  assert.equal(constantTimeEqual("alpha", "alpha"), true);
  assert.equal(constantTimeEqual("alpha", "beta"), false);
});

test("password verifier checks a supplied digest", () => {
  const digest = sha256("example-secret");
  assert.equal(verifyPasswordAgainstHash("example-secret", digest), true);
  assert.equal(verifyPasswordAgainstHash("wrong-secret", digest), false);
});

test("development identity allow-list is fail closed", () => {
  assert.equal(isAllowedEmail("shyamsundhar1982@gmail.com"), true);
  assert.equal(isAllowedEmail("unknown@example.com"), false);
});

test("development credential uses VAOS_DEV_LOGIN_PASSWORD_SHA256 when configured", () => {
  const previous = process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256;
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256 = sha256("cloudflare-login-secret");

  try {
    assert.equal(
      verifyDevelopmentCredential("shyamsundhar1982@gmail.com", "cloudflare-login-secret"),
      true,
    );
    assert.equal(
      verifyDevelopmentCredential("shyamsundhar1982@gmail.com", "wrong-secret"),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256;
    else process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256 = previous;
  }
});

test("session tokens use the configured development password hash for signing", () => {
  const previous = process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256;
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256 = sha256("session-secret-one");

  try {
    const token = createSessionToken("shyamsundhar1982@gmail.com", 60, 1_000_000);
    process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256 = sha256("session-secret-two");
    assert.equal(verifySessionToken(token, 1_001_000), null);
  } finally {
    if (previous === undefined) delete process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256;
    else process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256 = previous;
  }
});

test("session token verifies and expires", () => {
  const token = createSessionToken("shyamsundhar1982@gmail.com", 2, 1_000_000);
  assert.equal(verifySessionToken(token, 1_001_000)?.email, "shyamsundhar1982@gmail.com");
  assert.equal(verifySessionToken(token, 1_003_000), null);
});

test("tampered session token is rejected", () => {
  const token = createSessionToken("shyamsundhar1982@gmail.com", 60, 1_000_000);
  const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  assert.equal(verifySessionToken(tampered, 1_001_000), null);
});
