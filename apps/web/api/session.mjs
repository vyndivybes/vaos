import { parseCookies, SESSION_COOKIE, verifySessionToken } from "../lib/auth.mjs";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const session = verifySessionToken(parseCookies(req.headers.cookie || "")[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ authenticated: false });
  return res.status(200).json({ authenticated: true, email: session.email, environment: "development" });
}
