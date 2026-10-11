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
