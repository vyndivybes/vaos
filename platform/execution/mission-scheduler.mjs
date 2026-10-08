import { createMissionConsumer } from './mission-consumer.mjs';

function bounded(value) {
  if (!Number.isInteger(value) || value < 1 || value > 8) {
    throw new Error('MISSION_SWEEP_LIMIT_INVALID');
  }
  return value;
}

/**
 * Bounded, restart-safe sweep. One failure is isolated and surfaced.
 * Only the mission consumer's explicitly allowlisted read-only jobs execute.
 */
export async function runScheduledMissionSweep({
  service,
  maxMissions = 4,
  maxHandoffs = 4,
  createConsumer = ({ service: instance }) => createMissionConsumer({ service: instance }),
} = {}) {
  if (!service || typeof service.listRunnableMissions !== 'function'
      || typeof service.dispatchMission !== 'function') {
    throw new Error('MISSION_SWEEP_SERVICE_REQUIRED');
  }
  const limit = bounded(maxMissions);
  const handoffLimit = bounded(maxHandoffs);
  const discovered = await service.listRunnableMissions({ limit });
  if (!discovered || !Array.isArray(discovered.missionIds)
      || discovered.missionIds.length > limit
      || discovered.missionIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('MISSION_QUEUE_INVALID');
  }
  if (new Set(discovered.missionIds).size !== discovered.missionIds.length) {
    throw new Error('MISSION_QUEUE_DUPLICATE');
  }
  const consumer = createConsumer({ service });
  let processed = 0, submitted = 0, verified = 0, returned = 0, preparedForClosure = 0;
  const failures = [];

  for (const missionId of discovered.missionIds) {
    try {
      const consumed = await consumer.consume(missionId, { maxHandoffs: handoffLimit });
      const reviewed = await consumer.review(missionId, { maxHandoffs: handoffLimit });
      // Dispatch is assignment only. No domain effects or approval bypass.
      await service.dispatchMission(missionId, { maxAssignments: handoffLimit });
      if (typeof service.snapshot === 'function' && typeof service.prepareMissionClosure === 'function') {
        const current = await service.snapshot(missionId);
        if (current?.mission?.status === 'ACTIVE' && current?.metrics?.readyForClosure === true) {
          await service.prepareMissionClosure(missionId);
          preparedForClosure += 1;
        }
      }
      processed += 1;
      submitted += consumed.submitted || 0;
      verified += reviewed.verified || 0;
      returned += reviewed.returned || 0;
    } catch (error) {
      failures.push({
        missionId,
        code: typeof error?.message === 'string' ? error.message.slice(0,150) : 'MISSION_SWEEP_FAILED',
      });
    }
  }
  return {
    processed,
    submitted,
    verified,
    returned,
    preparedForClosure,
    failures,
  };
}
