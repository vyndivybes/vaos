import { buildSessionCookie, createSessionToken, verifyDevelopmentCredential } from "../lib/auth.mjs";

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
  if (!verifyDevelopmentCredential(email, password)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  res.setHeader("Set-Cookie", buildSessionCookie(createSessionToken(normalizedEmail)));
  return res.status(200).json({ authenticated: true, email: normalizedEmail, environment: "development" });
}
