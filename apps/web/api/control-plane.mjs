import { getControlPlanePayload } from '../lib/control-plane.mjs';
import { apiError } from '../lib/api-contracts.mjs';

export function controlPlaneDiagnostic(error) {
  const message = String(error?.message || '');
  if (message.includes('SUPABASE_CONFIG_MISSING:url')) return 'SUPABASE_URL_MISSING';
  if (message.includes('SUPABASE_CONFIG_MISSING:serverSecret')) return 'VAOS_DB_RPC_SECRET_MISSING';
  const edge = message.match(/SUPABASE_EDGE_FAILED:(\d{3})/);
  if (edge) return `SUPABASE_EDGE_${edge[1]}`;
  return 'CONTROL_PLANE_BOOTSTRAP_FAILED';
}

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
  } catch (error) {
    return res.status(503).json(apiError(
      'CONTROL_PLANE_UNAVAILABLE',
      'Durable control plane is unavailable',
      { diagnostic: controlPlaneDiagnostic(error) },
    ));
  }
}
