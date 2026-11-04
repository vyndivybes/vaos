import { buildSessionCookie, createSessionToken, verifyDevelopmentCredential } from "../lib/auth.mjs";
import { loginIdentity, loginThrottle } from "../lib/login-throttle.mjs";

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { email, password } = parseBody(req);
  const identity = loginIdentity(req, email);
  const gate = loginThrottle.check(identity);
  if (!gate.allowed) {
    res.setHeader("Retry-After", String(gate.retryAfterSeconds));
    return res.status(429).json({ error: "too_many_attempts" });
  }
  if (!verifyDevelopmentCredential(email, password)) {
    loginThrottle.recordFailure(identity);
    return res.status(401).json({ error: "invalid_credentials" });
  }
  loginThrottle.recordSuccess(identity);

  const normalizedEmail = String(email).trim().toLowerCase();
  let token;
  try { token = createSessionToken(normalizedEmail); }
  catch { return res.status(503).json({ error:"authentication_configuration_unavailable" }); }
  res.setHeader("Set-Cookie", buildSessionCookie(token));
  return res.status(200).json({ authenticated: true, email: normalizedEmail, environment: "development" });
}
