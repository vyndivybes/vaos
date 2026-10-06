import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError, validateIntentRequest } from '../lib/api-contracts.mjs';
import { getDurableControlService } from '../lib/durable-control-provider.mjs';
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
  const idempotencyKey = String(req.headers['idempotency-key'] || '');
  const validation = validateIntentRequest({ idempotencyKey, body });
  if (!validation.ok) return res.status(422).json(apiError('VALIDATION_ERROR', 'Invalid intent', validation.errors));

  try {
    const result = await getDurableControlService().proposeIntent({
      idempotencyKey,
      agentId: body.agentId,
      actionType: body.actionType,
      risk: String(body.risk).toLowerCase(),
      reason: body.reason.trim(),
      payload: body.payload || {},
      actor: session.email,
    });

    let execution = null;
    if (result.status === 'AUTHORIZED') {
      try { execution = await getExecutionEngine().processOne(); }
      catch { execution = { status: 'QUEUED' }; }
    }
    return res.status(result.status === 'AWAIT_APPROVAL' ? 202 : 200).json({ data: { ...result, execution } });
  } catch (error) {
    if (String(error?.message).includes('IDEMPOTENCY_CONFLICT')) {
      return res.status(422).json(apiError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with a different intent'));
    }
    return res.status(503).json(apiError('CONTROL_PLANE_UNAVAILABLE', 'Unable to persist intent'));
  }
}
