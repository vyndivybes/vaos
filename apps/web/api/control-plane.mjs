import { getControlPlanePayload } from '../lib/control-plane.mjs';
import { apiError } from '../lib/api-contracts.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'GET required'));
  }

  try {
    const payload = await getControlPlanePayload(req.headers.cookie || '', null, req.env);
    if (!payload) return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication required'));
    return res.status(200).json(payload);
  } catch {
    return res.status(503).json(apiError('CONTROL_PLANE_UNAVAILABLE', 'Durable control plane is unavailable'));
  }
}
