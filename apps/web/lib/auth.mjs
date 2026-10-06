import crypto from "node:crypto";

const DEV_ALLOWED_EMAILS = new Set([
  "shyamsundhar1982@gmail.com",
  "kaaviyam1519@gmail.com",
]);

// Development-only credential verifier. The plaintext password is never
// committed. Replace this mechanism with the production identity provider
// before production release.
const DEV_PASSWORD_SHA256 = "11c5ab3591e9d8c06eeac2afa5d6639021b569e46ae1efbb74f8dc4b81bf08d1";
const DEV_SESSION_KEY = crypto
  .createHash("sha256")
  .update(`vaos-development-session-v1:${DEV_PASSWORD_SHA256}`)
  .digest("hex");

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

export function verifyPasswordAgainstHash(password, expectedHash) {
  return constantTimeEqual(sha256(password), expectedHash);
}

export function isAllowedEmail(email) {
  return DEV_ALLOWED_EMAILS.has(String(email || "").trim().toLowerCase());
}

export function verifyDevelopmentCredential(email, password) {
  return isAllowedEmail(email) && verifyPasswordAgainstHash(password, DEV_PASSWORD_SHA256);
}

function signature(payload) {
  return crypto.createHmac("sha256", DEV_SESSION_KEY).update(payload).digest("base64url");
}

export function createSessionToken(email, ttlSeconds = SESSION_TTL_SECONDS, nowMs = Date.now()) {
  const payload = b64url(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
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
    if (!isAllowedEmail(data.email)) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return index < 0
        ? [part, ""]
        : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
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
