import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError } from '../lib/api-contracts.mjs';
import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { resolveDurableControlConfig } from '../lib/durable-control-provider.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'GET required'));
  }

  const session = verifySessionToken(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
  if (!session) return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication required'));

  try {
    const store = createSupabaseControlStore(resolveDurableControlConfig(req.env));
    const data = await store.operationalCommissioningSnapshot();
    return res.status(200).json({ data });
  } catch {
    return res.status(503).json(apiError(
      'COMMISSIONING_UNAVAILABLE',
      'Operational commissioning snapshot is unavailable',
    ));
  }
}
