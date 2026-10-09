// Strict admission contract for an independently verified VYNDI approved schedule.
// Draft, unapproved, undated, or tampered snapshots fail closed.
const fail = (code) => { const error = new Error(code); error.code = code; return error; };
const hex = (buffer) => Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, "0")).join("");
export async function verifyApprovedScheduleBaseline(input, { minimumTaskCount = 1 } = {}) {
  if (!input || input.status !== "approved" || !input.snapshot) throw fail("SCHEDULE_NOT_APPROVED");
  const { snapshot, baselineHash, revisionId } = input;
  if (!revisionId || !/^sha256:[0-9a-f]{64}$/.test(baselineHash || "")) throw fail("SCHEDULE_EVIDENCE_INVALID");
  if (!Array.isArray(snapshot.tasks) || snapshot.tasks.length < minimumTaskCount ||
    !Array.isArray(snapshot.dependencies) ||
    snapshot.tasks.some(task => !task.id || !/^\d{4}-\d{2}-\d{2}$/.test(task.planned_start || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(task.planned_finish || "") ||
      task.planned_finish < task.planned_start))
    throw fail("SCHEDULE_INCOMPLETE");
  const digest = "sha256:" + hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(snapshot))));
  if (digest !== baselineHash) throw fail("SCHEDULE_HASH_MISMATCH");
  if (snapshot.revisionId !== revisionId || snapshot.timezone !== input.timezone)
    throw fail("SCHEDULE_AUTHORITY_MISMATCH");
  return Object.freeze({ revisionId, baselineHash, timezone:input.timezone, taskCount:snapshot.tasks.length,
    dependencyCount:snapshot.dependencies.length, accepted:true });
}
