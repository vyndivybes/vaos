import { getControlPlanePayload } from '../lib/control-plane.mjs';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const payload = getControlPlanePayload(req.headers.cookie || '');
  if (!payload) return res.status(401).json({ error: 'unauthorised' });
  return res.status(200).json(payload);
}
