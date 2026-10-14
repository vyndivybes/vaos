import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError } from '../lib/api-contracts.mjs';
import { getEightAgentOperatingService } from '../lib/operating-provider.mjs';
import { createMissionConsumer } from '../../../platform/execution/mission-consumer.mjs';
import { VAOS_JOB_CATALOG, routeJob } from '../../../platform/runtime/vaos-eight-operating-model.mjs';
import { getFounderInboxStore } from '../lib/founder-inbox-provider.mjs';
import { readMissionDepartment } from '../lib/mission-department-reader.mjs';
import { loadFounderMissionResults } from '../lib/founder-mission-results.mjs';

const JOBS = new Set(Object.values(VAOS_JOB_CATALOG).flat().map((job) => job.actionType));
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;


const FOUNDER_EMAIL = 'shyamsundhar1982@gmail.com';
const FOUNDER_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// One existing, non-effectful catalog action per department. The Orchestrator
// coordinates the mission itself, and is excluded from departmental dispatch.
const STARTUP_DEPARTMENT_JOBS = Object.freeze([
  'PROJECT.TRACK_DEPENDENCY',
  'ENGINEERING.ASSESS_REQUIREMENT',
  'QA.AUDIT_EVIDENCE',
  'RISK.IDENTIFY',
  'SECURITY.ASSESS_ACCESS',
  'KNOWLEDGE.DETECT_GAP',
  'RELEASE.CHECK_OPEN_ITEMS',
  'COMMERCIAL.OBSERVE_PIPELINE',
  'PROCUREMENT.OBSERVE_SHORTAGE',
  'INVENTORY.OBSERVE_STOCK',
  'PRODUCTION.OBSERVE_WIP',
  'MAINTENANCE.OBSERVE_ASSET',
  'FINANCE.OBSERVE_LEDGER',
  'PEOPLE.OBSERVE_WORKFORCE',
  'ENGINEERING.OBSERVE_CONFIGURATION',
]);

const INSTRUCTION_DOMAINS = Object.freeze([
  [/\b(?:engineer(?:ing)?|vedm|frame|geometry|carbon|composite|materials?|design|fea|cad)\b/, ['ENGINEERING.ASSESS_REQUIREMENT', 'ENGINEERING.OBSERVE_CONFIGURATION']],
  [/\b(?:quality|qa|capa|audit|inspect(?:ion)?|nonconformance|defect)\b/, ['QA.AUDIT_EVIDENCE']],
  [/\b(?:risk|blockers?|hazards?|mitigat(?:ion|e))\b/, ['RISK.IDENTIFY']],
  [/\b(?:security|access|identity|permission|credential)\b/, ['SECURITY.ASSESS_ACCESS']],
  [/\b(?:knowledge|documents?|sources?|evidence|references?)\b/, ['KNOWLEDGE.DETECT_GAP']],
  [/\b(?:release|readiness|gate|deployment)\b/, ['RELEASE.CHECK_OPEN_ITEMS']],
  [/\b(?:sales|commercial|customers?|leads?|crm)\b/, ['COMMERCIAL.OBSERVE_PIPELINE']],
  [/\b(?:procurement|suppliers?|purchas(?:e|ing)|vendors?|quotation)\b/, ['PROCUREMENT.OBSERVE_SHORTAGE']],
  [/\b(?:inventory|stocks?|warehouse|stores?)\b/, ['INVENTORY.OBSERVE_STOCK']],
  [/\b(?:production|manufactur(?:e|ing)|assembly|job.?card|wip)\b/, ['PRODUCTION.OBSERVE_WIP']],
  [/\b(?:maintenance|asset|equipment|machinery)\b/, ['MAINTENANCE.OBSERVE_ASSET']],
  [/\b(?:finance|budget|cost|cash|ledger|payment|funding)\b/, ['FINANCE.OBSERVE_LEDGER']],
  [/\b(?:people|hr|human resources|recruit(?:ment|ing)|payroll|workforce)\b/, ['PEOPLE.OBSERVE_WORKFORCE']],
]);

// Deterministic, model-free admission: an instruction becomes a stable mission.
// This function selects catalogued analysis work, never a payment/PO/release job.
export function planFounderInstruction(messageId, instruction) {
  if (typeof messageId !== 'string' || !FOUNDER_MESSAGE_ID.test(messageId)
      || typeof instruction !== 'string' || instruction.trim().length < 5
      || instruction.length > 2000) {
    throw new Error('FOUNDER_MISSION_SOURCE_INVALID');
  }
  const normalized = instruction.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const broad = /\b(?:startup|start.?up|all departments|all sixteen|all 16|sixteen employees|16 employees|company launch|company setup|launch the company)\b/.test(normalized)
    || (/\b(?:launch|start)\b/.test(normalized) && /\b(?:company|business|vayu|vyndi|enterprise)\b/.test(normalized));
  const selected = broad ? STARTUP_DEPARTMENT_JOBS : [
    'PROJECT.TRACK_DEPENDENCY',
    ...INSTRUCTION_DOMAINS.flatMap(([pattern, jobs]) => pattern.test(normalized) ? jobs : []),
  ];
  if (!broad && selected.length === 1) selected.push('KNOWLEDGE.DETECT_GAP');
  const requestedJobs = [...new Set(selected)];
  for (const actionType of requestedJobs) {
    const route = routeJob(actionType);
    if (route.ownerAgentId === 'orchestrator' || route.humanApprovalRequired
        || !['ANALYSE', 'PREPARE'].includes(route.executionMode)) {
      throw new Error('FOUNDER_MISSION_JOB_NOT_SAFE');
    }
  }
  return {
    missionId: 'founder-' + messageId.toLowerCase().replace(/-/g, ''),
    objective: instruction.trim().slice(0, 500),
    requestedJobs,
  };
}

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
  createConsumer = ({ service, readDepartment }) => createMissionConsumer({ service, readDepartment }),
  getInboxStore = getFounderInboxStore,
  getFounderResults = loadFounderMissionResults,
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
      let missionId,view;
      try {
        const url=new URL(req.url,'https://vaos.invalid');
        if([...url.searchParams.keys()].some(k=>!['missionId','view'].includes(k))
            ||url.searchParams.getAll('missionId').length!==1
            ||url.searchParams.getAll('view').length>1)throw Error('QUERY_INVALID');
        missionId=url.searchParams.get('missionId');
        view=url.searchParams.get('view');
      }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Valid mission query required'));}
      if (!validMissionId(missionId)||![null,'results'].includes(view)) {
        return res.status(422).json(apiError('VALIDATION_ERROR','Valid missionId and view required'));
      }
      if(view==='results'&&session.email!==FOUNDER_EMAIL){
        return res.status(403).json(apiError('FOUNDER_ONLY','Founder evidence readback only'));
      }
      try {
        const service=getService(req.env);
        const snapshot=await service.snapshot(missionId);
        if(view==='results'){
          const results=await getFounderResults({
            snapshot,getWorkEvidence:evidenceId=>service.getWorkEvidence(evidenceId),
          });
          // Preserve existing voice readback without a second mission request.
          // No immutable raw source rows or secret material is exposed.
          return res.status(200).json({data:{...results,snapshot}});
        }
        return res.status(200).json({ data: snapshot });
      } catch {
        return res.status(503).json(apiError('MISSION_UNAVAILABLE',
          'Unable to read persisted mission or its immutable evidence'));
      }
    }

    const body = parseBody(req);

    if (body.operation === 'ROUTE_FOUNDER_INSTRUCTION') {
      if (!exactKeys(body, ['operation', 'messageId'])
          || typeof body.messageId !== 'string'
          || !FOUNDER_MESSAGE_ID.test(body.messageId)) {
        return res.status(422).json(apiError('VALIDATION_ERROR', 'Recorded instruction ID required'));
      }
      if (session.email !== FOUNDER_EMAIL) {
        return res.status(403).json(apiError('FOUNDER_ONLY', 'Founder mission routing only'));
      }
      let origin;
      try { origin = new URL(req.url).origin; } catch { origin = null; }
      if (!origin || req.headers?.origin !== origin) {
        return res.status(403).json(apiError('ORIGIN_DENIED', 'Same-origin mission routing required'));
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')) {
        return res.status(415).json(apiError('CONTENT_TYPE_DENIED', 'JSON request required'));
      }
      if (req.env?.VAOS_FOUNDER_INBOX_CONTROL !== 'record-only-v1') {
        return res.status(409).json(apiError('FOUNDER_INBOX_DISABLED', 'Recorded founder instruction unavailable'));
      }
      let inbox;
      try { inbox = await getInboxStore(req.env).list({ agentId: 'orchestrator', actorEmail: session.email }); }
      catch { return res.status(503).json(apiError('FOUNDER_INBOX_UNAVAILABLE', 'Recorded instruction could not be read')); }
      const recorded = inbox?.messages?.find(item =>
        item?.messageId === body.messageId && item?.recipientAgentId === 'orchestrator'
        && item?.kind === 'INSTRUCTION' && item?.status === 'RECORDED_NOT_ROUTED');
      if (!recorded) {
        return res.status(409).json(apiError('FOUNDER_INSTRUCTION_UNCONFIRMED', 'Persisted Orchestrator instruction required'));
      }
      try {
        const plan = planFounderInstruction(body.messageId, recorded.instruction);
        const service = getService(req.env);
        const created = await service.planMission(plan);
        if (!['CREATED', 'REPLAY'].includes(created?.outcome)) {
          throw new Error('FOUNDER_MISSION_PLAN_UNCONFIRMED');
        }
        // The existing SQL dispatcher permits at most eight assignments per call.
        // A second bounded batch covers the 15 non-Orchestrator employee roles.
        for (let batch = 0; batch < 2; batch += 1) {
          const dispatched = await service.dispatchMission(plan.missionId, { maxAssignments: 8 });
          if (!['DISPATCHED', 'NO_READY_WORK'].includes(dispatched?.outcome)
              || !Number.isInteger(dispatched?.count) || dispatched.count < 0 || dispatched.count > 8) {
            throw new Error('FOUNDER_MISSION_DISPATCH_UNCONFIRMED');
          }
          if (dispatched.count < 8) break;
        }
        const snapshot = await service.snapshot(plan.missionId);
        if (snapshot?.mission?.id !== plan.missionId
            || !Array.isArray(snapshot.workPackages) || !Array.isArray(snapshot.handoffs)) {
          throw new Error('FOUNDER_MISSION_READBACK_UNCONFIRMED');
        }
        const assigned = new Set(snapshot.handoffs.map(item => item.work_package_id ?? item.workPackageId ?? item.id)).size;
        const total = snapshot.workPackages.length;
        if (assigned > total || total < plan.requestedJobs.length) {
          throw new Error('FOUNDER_MISSION_ASSIGNMENTS_INVALID');
        }
        return res.status(200).json({ data: {
          missionId: plan.missionId,
          sourceMessageId: body.messageId,
          status: assigned === 0 ? 'AWAITING_ELIGIBLE_EMPLOYEES'
            : assigned === total ? 'ASSIGNED' : 'PARTIALLY_ASSIGNED',
          assignedWorkPackages: assigned,
          totalWorkPackages: total,
          businessEffectsExecuted: false,
        } });
      } catch {
        return res.status(503).json(apiError('FOUNDER_MISSION_ROUTING_UNAVAILABLE',
          'Mission planning or assignment not confirmed; retry with the same recorded instruction'));
      }
    }

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
        const consumer = createConsumer({ service, readDepartment: input => readMissionDepartment({ ...input, env: req.env }) });
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
