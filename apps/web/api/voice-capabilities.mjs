import {parseCookies, SESSION_COOKIE, verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {VOICE_PILOT_FLAG} from '../lib/voice-pilot.mjs';

const FOUNDER = 'shyamsundhar1982@gmail.com';

// Capability lookup only: no audio bytes, transcripts, tool dispatch or business writes.
export function createVoiceCapabilitiesHandler() {
  return function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED', 'GET required'));
    }
    const session = verifySessionToken(parseCookies(req.headers?.cookie || '')[SESSION_COOKIE]);
    if (!session) return res.status(401).json(apiError('UNAUTHENTICATED', 'Sign in required'));
    if (session.email !== FOUNDER) return res.status(403).json(apiError('FOUNDER_ONLY', 'Founder identity required'));
    const enabled = req.env?.VAOS_VOICE_CONTROL === VOICE_PILOT_FLAG;
    return res.status(200).json({data:{
      enabled,
      mode: enabled ? 'BROWSER_DICTATION_READONLY' : 'DISABLED',
      transport: 'BROWSER_WEB_SPEECH',
      manualReviewRequired: true,
      speechRecognitionMayUseBrowserVendorService: true,
      automaticSubmission: false,
      agentDispatch: false,
      actionAuthorized: false,
      serverAudioEnabled: false,
    }});
  };
}

export default createVoiceCapabilitiesHandler();
