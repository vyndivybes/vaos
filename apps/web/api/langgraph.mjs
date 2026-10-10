import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError } from '../lib/api-contracts.mjs';
import { getDurableControlService } from '../lib/durable-control-provider.mjs';
import { getEightAgentOperatingService } from '../lib/operating-provider.mjs';

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;

export function createLangGraphHandler({ getControlService = getDurableControlService,
  getMissionService = getEightAgentOperatingService,
  loadSupervisor = () => import('../../../integrations/langgraph/agent-supervisor.mjs') } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'GET or POST required'));
    }
    if (!verifySessionToken(parseCookies(req.headers?.cookie || '')[SESSION_COOKIE])) {
      return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication required'));
    }
    let input;
    try {
      const url = new URL(req.url, 'https://vaos.invalid');
      if (req.method === 'GET') {
        if ([...url.searchParams.keys()].some(key => key !== 'missionId')
          || url.searchParams.getAll('missionId').length > 1) throw new Error();
        input = { operation: 'MONITOR', missionId: url.searchParams.get('missionId') };
      } else {
        if (req.headers?.origin !== url.origin) {
          return res.status(403).json(apiError('ORIGIN_DENIED', 'Same-origin control required'));
        }
        input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!input || Array.isArray(input) || typeof input !== 'object'
          || Object.keys(input).some(key => !['operation', 'missionId'].includes(key))
          || input.operation !== 'RUN_SAFE') throw new Error();
      }
      if ((input.missionId !== null && (typeof input.missionId !== 'string' || !idPattern.test(input.missionId)))
        || (req.method === 'POST' && !input.missionId)) throw new Error();
    } catch {
      return res.status(422).json(apiError('VALIDATION_ERROR', 'Valid mission ID and bounded operation required'));
    }
    const enabled = () => req.env?.VAOS_LANGGRAPH_CONTROL === 'read-only-v1';
    if (req.method === 'POST' && !enabled()) {
      return res.status(409).json(apiError('LANGGRAPH_CONTROL_DISABLED', 'LangGraph read-only control is not commissioned'));
    }
    try {
      const { createAgentSupervisor } = await loadSupervisor();
      const supervisor = createAgentSupervisor({ controlService: getControlService(req.env),
        missionService: getMissionService(req.env), isControlEnabled: enabled });
      const data = await supervisor.run(input);
      return res.status(data.status === 'HOLD' ? 409 : 200).json({ data });
    } catch {
      return res.status(503).json(apiError('LANGGRAPH_UNAVAILABLE', 'Agent supervision unavailable; inspect mission evidence before retrying'));
    }
  };
}

export default createLangGraphHandler();
