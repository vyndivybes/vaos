import crypto from "node:crypto";

const DEV_MAKER_EMAIL = "shyamsundhar1982@gmail.com";
const DEV_CHECKER_EMAIL = "kaaviyam1519@gmail.com";
const DEV_ALLOWED_EMAILS = new Set([
  DEV_MAKER_EMAIL,
  DEV_CHECKER_EMAIL,
]);

// Credential verifier. Password hashes come ONLY from deployment configuration
// (VAOS_DEV_LOGIN_PASSWORD_SHA256 / VAOS_DEV_CHECKER_PASSWORD_SHA256); nothing is
// defaulted from source and no signing key is derived from a password hash.
// Two formats are accepted:
//   pbkdf2-sha256$<iterations>$<salt-b64url>$<hash-b64url>   preferred (salted, slow)
//   <64 hex chars>                                           legacy unsalted SHA-256 (deprecated)
// Create a preferred hash with:  node scripts/auth/hash-password.mjs
// This digest used to ship as a built-in default. It is kept ONLY so it can be
// refused if anyone ever configures it; it is never accepted as a credential.
const DENIED_LEGACY_DIGEST = "11c5ab3591e9d8c06eeac2afa5d6639021b569e46ae1efbb74f8dc4b81bf08d1";
const DEV_PASSWORD_ENV = "VAOS_DEV_LOGIN_PASSWORD_SHA256";
const DEV_CHECKER_PASSWORD_ENV = "VAOS_DEV_CHECKER_PASSWORD_SHA256";
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const PBKDF2_FORMAT = /^pbkdf2-sha256\$(\d{5,7})\$([A-Za-z0-9_-]{22,})\$([A-Za-z0-9_-]{43})$/;
const PBKDF2_MIN_ITERATIONS = 100_000;
const PBKDF2_MAX_ITERATIONS = 2_000_000;
const PBKDF2_DEFAULT_ITERATIONS = 600_000;
const HMAC_KEY_HEX = /^[a-f0-9]{64,128}$/i;
const HARDENED_CONTROL = "dedicated-hmac-v1";
function hardenedAuth() { return process.env.VAOS_AUTH_HARDENED_CONTROL === HARDENED_CONTROL; }
function hardenedSigningKey() {
  const value = String(process.env.VAOS_SESSION_HMAC_KEY || "").trim();
  const maker = configuredPasswordHash(DEV_PASSWORD_ENV);
  const checker = configuredPasswordHash(DEV_CHECKER_PASSWORD_ENV);
  if (!maker || !checker || checker === maker
    || !HMAC_KEY_HEX.test(value) || value.length % 2 !== 0
    || value.toLowerCase() === maker || value.toLowerCase() === checker) {
    throw new Error("HARDENED_AUTH_CONFIG_INVALID");
  }
  return Buffer.from(value, "hex");
}

export const SESSION_COOKIE = "vaos_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const b64url = (value) => Buffer.from(value).toString("base64url");
const unb64url = (value) => Buffer.from(value, "base64url").toString("utf8");

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function constantTimeEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left)).digest();
  const b = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

function parsePbkdf2(value) {
  const match = PBKDF2_FORMAT.exec(String(value || ""));
  if (!match) return null;
  const iterations = Number(match[1]);
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS
    || iterations > PBKDF2_MAX_ITERATIONS) return null;
  const salt = Buffer.from(match[2], "base64url");
  const hash = Buffer.from(match[3], "base64url");
  if (salt.length < 16 || hash.length !== 32) return null;
  // Reject non-canonical encodings: distinct text must not represent the same stored hash.
  if (salt.toString("base64url") !== match[2] || hash.toString("base64url") !== match[3]) return null;
  return { iterations, salt, hash };
}

function configuredPasswordHash(envName) {
  const configured = String(process.env[envName] || "").trim();
  if (SHA256_HEX.test(configured)) {
    const digest = configured.toLowerCase();
    return digest === DENIED_LEGACY_DIGEST ? null : digest;
  }
  return parsePbkdf2(configured) ? configured : null;
}

function developmentPasswordHash() {
  return configuredPasswordHash(DEV_PASSWORD_ENV);
}

function checkerPasswordHash() {
  const configured = configuredPasswordHash(DEV_CHECKER_PASSWORD_ENV);
  if (!configured || configured === developmentPasswordHash()) return null;
  return configured;
}

function developmentCredentialHash(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (hardenedAuth()) { try { hardenedSigningKey(); } catch { return null; } }
  if (normalized === DEV_MAKER_EMAIL) return developmentPasswordHash();
  if (normalized === DEV_CHECKER_EMAIL) return checkerPasswordHash();
  return null;
}

// Non-hardened (local development / unit tests only). The signing key is either
// the configured VAOS_SESSION_HMAC_KEY or a random per-process key. It is never
// derived from a value that exists in source or from a password hash, so a
// misconfigured deployment cannot be made to accept forged cookies.
let ephemeralDevelopmentKey;
function developmentSessionKey() {
  const configured = String(process.env.VAOS_SESSION_HMAC_KEY || "").trim();
  if (HMAC_KEY_HEX.test(configured) && configured.length % 2 === 0) {
    return Buffer.from(configured, "hex");
  }
  ephemeralDevelopmentKey ??= crypto.randomBytes(32);
  return ephemeralDevelopmentKey;
}

export function verifyPasswordAgainstHash(password, expectedHash) {
  const parsed = parsePbkdf2(expectedHash);
  if (parsed) {
    const actual = crypto.pbkdf2Sync(String(password), parsed.salt, parsed.iterations, 32, "sha256");
    return crypto.timingSafeEqual(actual, parsed.hash);
  }
  // Legacy unsalted SHA-256 digests remain verifiable until rotated.
  return constantTimeEqual(sha256(password), expectedHash);
}

export function hashPassword(password, {
  iterations = PBKDF2_DEFAULT_ITERATIONS,
  salt = crypto.randomBytes(16),
} = {}) {
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS
    || iterations > PBKDF2_MAX_ITERATIONS) throw new Error("PASSWORD_HASH_ITERATIONS_INVALID");
  if (!Buffer.isBuffer(salt) || salt.length < 16) throw new Error("PASSWORD_HASH_SALT_INVALID");
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256");
  return `pbkdf2-sha256$${iterations}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function isAllowedEmail(email) {
  return DEV_ALLOWED_EMAILS.has(String(email || "").trim().toLowerCase());
}

export function verifyDevelopmentCredential(email, password) {
  if (!isAllowedEmail(email)) return false;
  const expectedHash = developmentCredentialHash(email);
  return Boolean(expectedHash)
    && verifyPasswordAgainstHash(password, expectedHash);
}

function signature(payload) {
  return crypto
    .createHmac("sha256", hardenedAuth() ? hardenedSigningKey() : developmentSessionKey())
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(email, ttlSeconds = SESSION_TTL_SECONDS, nowMs = Date.now()) {
  const secure = hardenedAuth();
  if (secure) {
    hardenedSigningKey(); // fail before creating any token
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > SESSION_TTL_SECONDS)
      throw new Error("HARDENED_AUTH_TTL_INVALID");
  }
  const now = Math.floor(nowMs / 1000);
  const payload = b64url(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: now + ttlSeconds,
    ...(secure ? {v:2, iat:now, sid:crypto.randomBytes(16).toString("hex")} : {}),
  }));
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token, nowMs = Date.now()) {
  try {
    if (!token) return null;
    const [payload, sig, extra] = String(token).split(".");
    if (!payload || !sig || extra) return null;
    if (!constantTimeEqual(sig, signature(payload))) return null;
    const data = JSON.parse(unb64url(payload));
    if (!data?.email || !Number.isFinite(data?.exp)) return null;
    if (data.exp <= Math.floor(nowMs / 1000)) return null;
    if (hardenedAuth() && (data.v !== 2 || !Number.isInteger(data.iat)
      || typeof data.sid !== "string" || !/^[a-f0-9]{32}$/.test(data.sid)
      || data.iat > Math.floor(nowMs / 1000) + 60
      || data.exp - data.iat > SESSION_TTL_SECONDS || data.exp <= data.iat)) return null;
    if (!isAllowedEmail(data.email)) return null;
    return data;
  } catch {
    return null;
  }
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return ""; }
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return index < 0
        ? [part, ""]
        : [part.slice(0, index), safeDecode(part.slice(index + 1))];
    }),
  );
}

export function buildSessionCookie(token) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
