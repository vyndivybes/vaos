import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError } from '../lib/api-contracts.mjs';
import { getEightAgentOperatingService } from '../lib/operating-provider.mjs';
import { createMissionConsumer } from '../../../platform/execution/mission-consumer.mjs';
import { VAOS_JOB_CATALOG } from '../../../platform/runtime/vaos-eight-operating-model.mjs';

const JOBS = new Set(Object.values(VAOS_JOB_CATALOG).flat().map((job) => job.actionType));
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try {
      const value = JSON.parse(req.body);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {}
  }
  return {};
}

function exactKeys(body, allowed) {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function validMissionId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function validPlan(body) {
  return exactKeys(body, ['operation', 'missionId', 'objective', 'requestedJobs'])
    && validMissionId(body.missionId)
    && typeof body.objective === 'string'
    && body.objective.trim().length >= 10
    && body.objective.trim().length <= 500
    && Array.isArray(body.requestedJobs)
    && body.requestedJobs.length >= 1
    && body.requestedJobs.length <= 32
    && new Set(body.requestedJobs).size === body.requestedJobs.length
    && body.requestedJobs.every((name) => JOBS.has(name));
}

function validDispatch(body) {
  return exactKeys(body, ['operation', 'missionId', 'maxAssignments'])
    && validMissionId(body.missionId)
    && (body.maxAssignments === undefined || (
      Number.isInteger(body.maxAssignments)
      && body.maxAssignments >= 1
      && body.maxAssignments <= 16
    ));
}

export function createMissionsHandler({
  getService = getEightAgentOperatingService,
  createConsumer = ({ service }) => createMissionConsumer({ service }),
} = {}) {
  if (typeof getService !== 'function') throw new Error('MISSION_SERVICE_FACTORY_REQUIRED');
  if (typeof createConsumer !== 'function') throw new Error('MISSION_CONSUMER_FACTORY_REQUIRED');

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'GET or POST required'));
    }

    const session = verifySessionToken(parseCookies(req.headers?.cookie || '')[SESSION_COOKIE]);
    if (!session) return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication required'));

    if (req.method === 'GET') {
      let missionId;
      try { missionId = new URL(req.url, 'https://vaos.invalid').searchParams.get('missionId'); }
      catch { missionId = null; }
      if (!validMissionId(missionId)) {
        return res.status(422).json(apiError('VALIDATION_ERROR', 'Valid missionId required'));
      }
      try {
        const snapshot = await getService(req.env).snapshot(missionId);
        return res.status(200).json({ data: snapshot });
      } catch {
        return res.status(503).json(apiError('MISSION_UNAVAILABLE', 'Unable to read mission'));
      }
    }

    const body = parseBody(req);
    if (body.operation === 'PLAN' && validPlan(body)) {
      try {
        const result = await getService(req.env).planMission({
          missionId: body.missionId,
          objective: body.objective.trim(),
          requestedJobs: body.requestedJobs,
        });
        return res.status(result?.outcome === 'CREATED' ? 201 : 200).json({ data: result });
      } catch {
        return res.status(503).json(apiError('MISSION_UNAVAILABLE', 'Unable to plan mission'));
      }
    }

    if (body.operation === 'DISPATCH' && validDispatch(body)) {
      try {
        const result = await getService(req.env).dispatchMission(body.missionId, {
          maxAssignments: body.maxAssignments ?? 16,
        });
        return res.status(200).json({ data: result });
      } catch {
        return res.status(503).json(apiError('MISSION_UNAVAILABLE', 'Unable to dispatch mission'));
      }
    }

    if (body.operation === 'RUN_SAFE'
      && exactKeys(body, ['operation', 'missionId', 'maxHandoffs'])
      && validMissionId(body.missionId)
      && (body.maxHandoffs === undefined || (
        Number.isInteger(body.maxHandoffs) && body.maxHandoffs >= 1 && body.maxHandoffs <= 8
      ))) {
      try {
        const service = getService(req.env);
        const consumer = createConsumer({ service });
        const options = { maxHandoffs: body.maxHandoffs ?? 4 };
        const consumed = await consumer.consume(body.missionId, options);
        const reviewed = await consumer.review(body.missionId, options);
        return res.status(200).json({ data: { consumed, reviewed } });
      } catch {
        return res.status(503).json(apiError('MISSION_CONSUMER_UNAVAILABLE', 'Safe mission execution did not complete'));
      }
    }

    return res.status(422).json(apiError(
      'VALIDATION_ERROR',
      'Invalid or unauthorized mission operation',
    ));
  };
}

export default createMissionsHandler();
