// Browser-only pilot contract. No voice result may dispatch, approve, or execute a business action.
export const VOICE_PILOT_FLAG = 'founder-readonly-browser-v1';

export function appendVoiceTranscript(existing, transcript, maxLength=900) {
  if (typeof existing !== 'string' || typeof transcript !== 'string'
      || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 2000) {
    throw new Error('VOICE_TRANSCRIPT_INVALID');
  }
  const incoming = transcript.trim();
  if (!incoming || /[\x00-\x1f\x7f]/.test(incoming)) throw new Error('VOICE_TRANSCRIPT_INVALID');
  const combined = [existing.trim(), incoming].filter(Boolean).join(' ');
  if (combined.length > maxLength) throw new Error('VOICE_TRANSCRIPT_TOO_LONG');
  return combined;
}

export function selectSpokenReadback(source, text) {
  const markers = {
    preview: ['READ-ONLY PREVIEW — NOT AN AI REPLY', 'No model invoked. No action authorized.'],
    draft: ['UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE', 'No business action authorized.'],
  };
  const pair = Object.hasOwn(markers, source) ? markers[source] : null;
  if (!pair || typeof text !== 'string' || text.length > 3200
      || !text.startsWith(pair[0] + '\n') || !text.endsWith(pair[1])) {
    throw new Error('VOICE_REPLY_UNVERIFIED');
  }
  return text;
}


// Speech qualification is a locally authored fixture; it is not an agent reply,
// engineering evidence, or a production business record.
export const VOICE_AUDIO_TEST_MESSAGE = [
  'READ-ONLY PREVIEW — NOT AN AI REPLY',
  'Audio test only. This is a sample VAOS spoken response, not a project status report.',
  'No model invoked. No action authorized.',
].join('\n');

// Reuse existing GET /api/missions evidence; never create a report request,
// persist a conversation, execute an action or imply independent verification.
export function formatMissionSnapshotSpokenPreview(record,requestedId) {
  if (typeof requestedId !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(requestedId)
      || !record || typeof record !== 'object' || Array.isArray(record)
      || !record.mission || typeof record.mission !== 'object'
      || record.mission.id !== requestedId
      || !Array.isArray(record.workPackages)
      || record.workPackages.length > 1000) {
    throw new Error('VOICE_MISSION_NOT_VERIFIED');
  }
  const status = record.mission.status || 'UNVERIFIED';
  if (typeof status !== 'string' || !/^[A-Za-z0-9_ -]{1,48}$/.test(status)
      || !record.workPackages.every(work =>
        work && typeof work === 'object' && !Array.isArray(work)
        && typeof work.status === 'string'
        && /^[A-Za-z0-9_ -]{1,48}$/.test(work.status))) {
    throw new Error('VOICE_MISSION_NOT_VERIFIED');
  }
  const completed = record.workPackages.filter(work => work.status === 'COMPLETED').length;
  return [
    'READ-ONLY PREVIEW — NOT AN AI REPLY',
    'Mission: ' + requestedId + '.',
    'Status reported by VAOS: ' + status + '.',
    'Work packages: ' + record.workPackages.length + '. Completed status entries: ' + completed + '.',
    'This is a read-only snapshot, not independent evidence of completion.',
    'No model invoked. No action authorized.',
  ].join('\n');
}


/**
 * Explicit, bounded read-only question filter for the founder's manual mission
 * lookup. This is not NLP authorization: mission ID and the GET action still
 * require a separate deliberate browser click and an authenticated session.
 */
export function isReadOnlyMissionStatusQuestion(text) {
  if (typeof text !== 'string' || text.length < 5 || text.length > 900
      || /[\x00-\x1f\x7f]/.test(text)) return false;
  const question = text.trim().toLowerCase();
  if (!/\b(status|state|progress|summary|report|blockers?|evidence)\b/.test(question)) return false;
  if (/\b(approve|authorization|post|dispatch|execute|run|purchase|order|pay|payment|delete|update|create|record|submit|override|change|transfer|send|write|cancel|modify|book)\b/.test(question)) return false;
  return true;
}
