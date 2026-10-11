import { clearSessionCookie } from "../lib/auth.mjs";
import {hardenedRevocationRequired,revokeHardenedCookie} from '../lib/session-revocation.mjs';

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if(hardenedRevocationRequired(req.env)){
    try {
      const result=await revokeHardenedCookie(req.headers?.cookie,req.env?.VAOS_ARTIFACTS);
      if(!result.revoked) return res.status(401).json({error:'unauthenticated'});
    }catch{
      // Never report successful logout when durable revocation cannot be verified.
      return res.status(503).json({error:'logout_revocation_unavailable'});
    }
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ authenticated: false });
}
