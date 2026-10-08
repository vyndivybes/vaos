// Read-only presentation of an authoritative mission snapshot.
// This is a progress summary, not a substitute for the database closure gate.
const text = (value) => typeof value === 'string' ? value.trim() : '';
const field = (obj, snake, camel) => obj?.[snake] ?? obj?.[camel];

function verifiedHandoff(handoff, ownerAgentId) {
  if (!handoff || handoff.status !== 'COMPLETED') return false;
  const actor = text(field(handoff, 'to_agent_id', 'toAgentId'));
  const checker = text(field(handoff, 'verified_by_agent_id', 'verifiedByAgentId'));
  const refs = field(handoff, 'evidence_refs', 'evidenceRefs');
  return actor === ownerAgentId && checker !== '' && checker !== actor
    && Array.isArray(refs) && refs.some((ref) =>
      typeof ref === 'string' && !ref.startsWith('REVIEWED:')
        && refs.includes(`REVIEWED:${ref}`));
}

export function summarizeMissionSnapshot(snapshot) {
  const mission = snapshot?.mission;
  if (!mission || !text(mission.id) || !text(mission.status)
      || !Array.isArray(snapshot.workPackages) || !Array.isArray(snapshot.handoffs)) {
    throw new Error('MISSION_STATUS_SNAPSHOT_INVALID');
  }
  const ids = snapshot.workPackages.map((wp) => text(wp?.id));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('MISSION_STATUS_WORK_PACKAGES_INVALID');
  }

  const jobs = snapshot.workPackages.map((wp) => {
    const owner = text(field(wp, 'owner_agent_id', 'ownerAgentId'));
    const valid = snapshot.handoffs.find((handoff) =>
      text(field(handoff, 'work_package_id', 'workPackageId')) === wp.id
        && verifiedHandoff(handoff, owner));
    const verified = wp.status === 'COMPLETED' && Boolean(valid);
    return {
      id: wp.id,
      action: text(field(wp, 'action_type', 'actionType')) || 'UNKNOWN',
      owner: owner || 'UNASSIGNED',
      status: text(wp.status) || 'UNKNOWN',
      verified,
      verifiedBy: verified ? text(field(valid, 'verified_by_agent_id', 'verifiedByAgentId')) : null,
      evidenceRefs: verified ? [...field(valid, 'evidence_refs', 'evidenceRefs')].filter((ref) => !ref.startsWith('REVIEWED:')) : [],
    };
  });

  const completed = jobs.filter((job) => job.verified).length;
  const total = jobs.length;
  const allHandoffsDone = snapshot.handoffs.every((handoff) => handoff.status === 'COMPLETED');
  const readyForClosure = mission.status === 'READY_FOR_CLOSURE'
    && total > 0 && completed === total && allHandoffsDone;

  return {
    id: mission.id,
    status: mission.status,
    updatedAt: field(mission, 'updated_at', 'updatedAt') || null,
    completed,
    total,
    percent: total ? Math.round(completed * 100 / total) : 0,
    readyForClosure,
    jobs,
    warning: mission.status === 'READY_FOR_CLOSURE' && !readyForClosure
      ? 'Closure-ready database status could not be independently corroborated from the returned snapshot.'
      : null,
  };
}
