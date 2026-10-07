import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError, validateApprovalDecision } from '../lib/api-contracts.mjs';
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
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'PATCH required'));
  }

  const session = verifySessionToken(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
  if (!session) return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication required'));

  const body = parseBody(req);
  const validation = validateApprovalDecision(body);
  if (!validation.ok) return res.status(422).json(apiError('VALIDATION_ERROR', 'Invalid approval decision', validation.errors));

  try {
    const result = await getDurableControlService(req.env).decideApproval(body.approvalId, {
      decision: validation.decision,
      decidedBy: session.email,
    });
    if (result?.outcome === 'NOT_FOUND') return res.status(404).json(apiError('NOT_FOUND', 'Approval not found'));
    if (result?.outcome === 'CONFLICT') return res.status(409).json(apiError('APPROVAL_ALREADY_DECIDED', 'Approval already has a different terminal decision'));

    let execution = null;
    if (validation.decision === 'APPROVED') {
      try { execution = await getExecutionEngine(req.env).processOne(); }
      catch { execution = { status: 'QUEUED' }; }
    }
    return res.status(200).json({ data: { ...result, execution } });
  } catch {
    return res.status(503).json(apiError('CONTROL_PLANE_UNAVAILABLE', 'Unable to persist approval decision'));
  }
}
