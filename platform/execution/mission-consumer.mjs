import { routeJob } from '../runtime/vaos-eight-operating-model.mjs';

/**
 * Small, deliberately allowlisted read-only operating capabilities.
 * Effectful, judgmental, or unsupported work is never auto-completed.
 */
export const SAFE_MISSION_JOBS = Object.freeze([
  'PROJECT.TRACK_DEPENDENCY',
  'KNOWLEDGE.DETECT_GAP',
  'RELEASE.CHECK_OPEN_ITEMS',
  'RISK.IDENTIFY',
]);

const SAFE = new Set(SAFE_MISSION_JOBS);
const OPEN = new Set(['PLANNED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'FAILED']);
const TERMINAL = new Set(['COMPLETED', 'CANCELLED']);

function prop(x, snake, camel) {
  return x?.[snake] ?? x?.[camel];
}

function requiredString(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function compare(a, b) {
  return String(a).localeCompare(String(b));
}

function normalizedPackages(items) {
  if (!Array.isArray(items)) throw new Error('MISSION_WORK_PACKAGES_INVALID');
  return items.map((item) => ({
    id: requiredString(item?.id, 'MISSION_WORK_PACKAGE_ID_REQUIRED'),
    status: requiredString(item?.status, 'MISSION_WORK_PACKAGE_STATUS_REQUIRED'),
    dependsOn: prop(item, 'depends_on', 'dependsOn') || [],
  }));
}

export function calculateReadOnlyMissionAudit(actionType, items, workPackageId) {
  if (!SAFE.has(actionType)) throw new Error('MISSION_AUTO_JOB_UNSUPPORTED');
  const workPackages = normalizedPackages(items);
  const own = requiredString(workPackageId, 'MISSION_WORK_PACKAGE_ID_REQUIRED');
  const byId = new Map(workPackages.map((item) => [item.id, item]));
  if (!byId.has(own)) throw new Error('MISSION_WORK_PACKAGE_NOT_FOUND');

  const external = workPackages.filter((item) => item.id !== own);
  const dependencies = workPackages.flatMap((item) => (item.dependsOn || []).map((id) => ({
    child: item.id,
    dependency: id,
    state: byId.get(id)?.status || 'MISSING',
  }))).sort((a, b) => compare(a.child, b.child) || compare(a.dependency, b.dependency));

  let findings;
  if (actionType === 'PROJECT.TRACK_DEPENDENCY') {
    findings = dependencies.filter((entry) => entry.state !== 'COMPLETED').map((entry) =>
      `${entry.child} -> ${entry.dependency}: ${entry.state}`);
  } else if (actionType === 'KNOWLEDGE.DETECT_GAP') {
    findings = dependencies.filter((entry) => entry.state === 'MISSING').map((entry) =>
      `MISSING_DEPENDENCY:${entry.child}:${entry.dependency}`);
  } else if (actionType === 'RISK.IDENTIFY') {
    // Strictly a mission-work-package blocker indicator screen.
    // No risk score, risk register mutation, mitigation or acceptance.
    findings = [
      ...external.filter((item) => ['BLOCKED', 'FAILED'].includes(item.status)).map((item) =>
        `MISSION_BLOCKER:${item.id}:${item.status}`),
      ...dependencies.filter((entry) => entry.state === 'MISSING').map((entry) =>
        `MISSING_DEPENDENCY:${entry.child}:${entry.dependency}`),
    ];
  } else {
    findings = external.filter((item) => OPEN.has(item.status)).map((item) =>
      `OPEN_ITEM:${item.id}:${item.status}`);
  }

  return {
    schemaVersion: 'vaos.read-only-mission-audit.v1',
    kind: 'READ_ONLY_MISSION_AUDIT',
    actionType,
    workPackageId: own,
    dependencyCount: dependencies.length,
    findings: findings.sort(compare),
    referencedWorkPackages: workPackages.length,
  };
}

/**
 * Checks each reported field against a fresh authoritative snapshot.
 * This verification is performed under a verifier role different from the maker.
 */
export function verifyReadOnlyMissionAudit(report, items, workPackageId) {
  try {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
    if (!SAFE.has(report.actionType)) return false;
    const actual = calculateReadOnlyMissionAudit(report.actionType, items, workPackageId);
    if (Object.keys(report).length !== Object.keys(actual).length) return false;
    return Object.entries(actual).every(([key, value]) =>
      JSON.stringify(report[key]) === JSON.stringify(value));
  } catch {
    return false;
  }
}

function maxCount(value) {
  if (!Number.isInteger(value) || value < 1 || value > 8) throw new Error('MISSION_CONSUMER_LIMIT_INVALID');
  return value;
}

function handoffOwner(handoff) { return prop(handoff, 'to_agent_id', 'toAgentId'); }
function handoffAction(handoff) { return prop(handoff, 'requested_job', 'requestedJob'); }
function handoffWorkPackage(handoff) { return prop(handoff, 'work_package_id', 'workPackageId'); }
function handoffEvidence(handoff) { return prop(handoff, 'evidence_refs', 'evidenceRefs') || []; }
function packageHumanApproval(item) { return prop(item, 'human_approval_required', 'humanApprovalRequired') === true; }

function safeJobValidated(handoff, item) {
  const actionType = handoffAction(handoff);
  if (!SAFE.has(actionType) || !item || item.id !== handoffWorkPackage(handoff)) return false;
  const route = routeJob(actionType);
  const mode = prop(item, 'execution_mode', 'executionMode');
  return prop(item, 'action_type', 'actionType') === actionType
    && route.ownerAgentId === handoffOwner(handoff)
    && prop(item, 'owner_agent_id', 'ownerAgentId') === handoffOwner(handoff)
    && !route.humanApprovalRequired
    && !packageHumanApproval(item)
    && route.authority <= 2
    && Number(item.authority) <= 2
    && ['ANALYSE', 'PREPARE'].includes(route.executionMode)
    && mode === route.executionMode;
}

function requiredSnapshot(snapshot, missionId) {
  if (!snapshot || prop(snapshot.mission, 'id', 'id') !== missionId) {
    throw new Error('MISSION_SNAPSHOT_INVALID');
  }
  if (snapshot.mission.status !== 'ACTIVE') throw new Error('MISSION_NOT_ACTIVE');
  if (!Array.isArray(snapshot.workPackages) || !Array.isArray(snapshot.handoffs)) {
    throw new Error('MISSION_SNAPSHOT_INCOMPLETE');
  }
  return snapshot;
}

function reviewer(actionType, ownerId) {
  const route = routeJob(actionType);
  const id = route.verifierAgentIds.find((item) => item !== ownerId)
    || (ownerId === 'orchestrator' ? 'project' : 'orchestrator');
  if (id === ownerId) throw new Error('MISSION_INDEPENDENT_REVIEWER_REQUIRED');
  return id;
}

function evidenceRef(evidenceId) {
  return requiredString(evidenceId, 'MISSION_EVIDENCE_ID_REQUIRED');
}

export function createMissionConsumer({ service } = {}) {
  const methods = ['snapshot', 'transitionHandoff', 'recordWorkEvidence', 'getWorkEvidence'];
  if (!service || methods.some((name) => typeof service[name] !== 'function')) {
    throw new Error('MISSION_CONSUMER_SERVICE_REQUIRED');
  }

  return Object.freeze({
    async consume(missionId, { maxHandoffs = 4 } = {}) {
      const id = requiredString(missionId, 'MISSION_ID_REQUIRED');
      const limit = maxCount(maxHandoffs);
      const initial = requiredSnapshot(await service.snapshot(id), id);
      let submitted = 0, unsupported = 0, attempted = 0;
      const used = [];
      for (const handoff of initial.handoffs) {
        if (attempted >= limit) break;
        if (!['PENDING', 'ACCEPTED'].includes(handoff.status)) continue;
        const wp = initial.workPackages.find((item) => item.id === handoffWorkPackage(handoff));
        if (!safeJobValidated(handoff, wp)) {
          unsupported += 1;
          continue;
        }
        attempted += 1;

        let version = handoff.version;
        if (handoff.status === 'PENDING') {
          const accepted = await service.transitionHandoff({
            handoffId: handoff.id, expectedVersion: version,
            byAgentId: handoffOwner(handoff), outcome: 'ACCEPT',
            evidenceRefs: [],
          });
          version = accepted.handoff.version;
        }

        // Use the current authoritative snapshot after ACCEPT.
        const refreshed = requiredSnapshot(await service.snapshot(id), id);
        const report = calculateReadOnlyMissionAudit(handoffAction(handoff), refreshed.workPackages, handoffWorkPackage(handoff));
        const recorded = await service.recordWorkEvidence({
          handoffId: handoff.id,
          expectedVersion: version,
          byAgentId: handoffOwner(handoff),
          report,
        });
        const ref = evidenceRef(recorded.evidenceId);
        await service.transitionHandoff({
          handoffId: handoff.id, expectedVersion: version,
          outcome: 'SUBMIT', byAgentId: handoffOwner(handoff), evidenceRefs: [ref],
        });
        used.push(handoff.id);
        submitted += 1;
      }
      return { missionId: id, submitted, unsupported, handoffs: used };
    },

    async review(missionId, { maxHandoffs = 4 } = {}) {
      const id = requiredString(missionId, 'MISSION_ID_REQUIRED');
      const limit = maxCount(maxHandoffs);
      const snap = requiredSnapshot(await service.snapshot(id), id);
      let verified = 0, returned = 0, unsupported = 0;
      for (const handoff of snap.handoffs.filter((item) => item.status === 'SUBMITTED').slice(0, limit)) {
        const wp = snap.workPackages.find((item) => item.id === handoffWorkPackage(handoff));
        if (!safeJobValidated(handoff, wp)) { unsupported += 1; continue; }
        const role = reviewer(handoffAction(handoff), handoffOwner(handoff));
        const refs = handoffEvidence(handoff);
        let valid = refs.length === 1;
        let record;
        if (valid) {
          try { record = await service.getWorkEvidence(refs[0]); }
          catch { valid = false; }
        }
        valid = valid && record?.handoff_id === handoff.id
          && verifyReadOnlyMissionAudit(record.report, snap.workPackages, handoffWorkPackage(handoff));
        if (valid) {
          await service.transitionHandoff({
            handoffId: handoff.id, expectedVersion: handoff.version,
            byAgentId: role, outcome: 'VERIFY',
            evidenceRefs: [`REVIEWED:${refs[0]}`],
          });
          verified += 1;
        } else {
          await service.transitionHandoff({
            handoffId: handoff.id, expectedVersion: handoff.version,
            byAgentId: role, outcome: 'REJECT_VERIFICATION',
            reason: 'Recorded evidence absent, invalid, or inconsistent with current authoritative mission state',
            evidenceRefs: [],
          });
          returned += 1;
        }
      }
      return { missionId: id, verified, returned, unsupported };
    },
  });
}
