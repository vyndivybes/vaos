import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError } from '../lib/api-contracts.mjs';
import { getExecutionEngine } from '../lib/execution-provider.mjs';

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'POST required'));
  }

  const session = verifySessionToken(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
  if (!session) return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication required'));

  const body = parseBody(req);
  const limit = Number(body.limit ?? 5);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    return res.status(422).json(apiError('VALIDATION_ERROR', 'Execution limit must be an integer from 1 to 10'));
  }

  try {
    const result = await getExecutionEngine(req.env).drain({ limit });
    return res.status(200).json({ data: result });
  } catch {
    return res.status(503).json(apiError('EXECUTION_ENGINE_UNAVAILABLE', 'Unable to process execution queue'));
  }
}
