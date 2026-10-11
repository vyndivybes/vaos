# VAOS Voice Command & Spoken Reply — Controlled Preparation (2026-10-11)

## Scope and authority

Phase 0 prepares a **browser-only, read-only voice pilot** in the already authenticated
Founder Command console, Stage 5 durable mission conversation. It reuses the existing
founder-only, separately commissioned `/api/founder-conversation` and
`/api/founder-chat` flow. This change **does not** qualify new agents or commission
new back-end voice providers.

**No speech-to-business-effect route exists.** A recognized utterance fills the text area
only. The founder must review it and click the existing read-only conversation button.
Existing server-side session, founder identity, same-origin, control flag, mission
evidence, per-agent constraints, idempotency, and no-write gates remain authoritative.
Speech synthesis is manually invoked for a loaded `AI_DRAFT_UNVERIFIED` reply
with `actionAuthorized:false`. It is never evidence of a completed task.

## Operator workflow

1. Sign into VAOS and open Founder Command.
2. Choose **Project Controls** or **Orchestrator** and supply an existing mission ID.
3. Click **Start voice dictation** and grant microphone permission if prompted.
4. Read the transcript in **Follow-up report request**; edit if needed.
5. Click **Record follow-up and generate read-only draft** only when ready.
6. Wait for persisted history, then optionally click **Speak last unverified reply**.
7. Stop microphone and playback at any point using their separate buttons.

## Browser/privacy expectations

- Recognition uses `SpeechRecognition` or the prefixed browser implementation where
  supported. Browser/OS support varies; some vendors send audio to a vendor speech
  service. Do not dictate confidential information before approving the browser's
  privacy model. VAOS itself adds no dedicated audio-upload or voice transcript API.
- `speechSynthesis` generates spoken replies through the browser/OS.
- No continuous microphone, wake word, hands-free execution, automatic dispatch,
  voice approval, audio recording storage, or new third-party paid API is introduced.
- This browser pilot is not equivalent to the future Cloudflare real-time voice
  gateway. Unsupported browsers keep full manual text functionality.

## Acceptance gates

- Unit tests: transcript length/control-character validation; confirmed read-only
  speech; missing browser capability; explicit microphone start/stop; late events
  ignored; no automatic submit.
- Existing `npm test` and Cloudflare Worker dry-run bundle gates PASS.
- Authenticated mobile and desktop browser check: microphone allow/deny, speech
  timeout, text fallback, interrupted/failed playback, source and agent change,
  an existing mission conversation, post-readback audio, and negative checks for
  writes or approval effects.
- Privacy review (browser speech vendor), accessibility, microphone permission
  UX and feature-support testing completed before approving any release.

## Planned next phase — server-side real-time voice, separately approved

1. Evaluate Cloudflare `@cloudflare/voice` beta and its current Workers/DO routing,
   authentication and migrations for an isolated preview, **not** the production
   Worker. Production cron schedules must remain unchanged.
2. Add authenticated voice admission, per-session/actor quotas and a
   short-lived microphone lease. Bind to **existing** capability governance;
   never treat a transcript, wake word, model assertion or spoken 'yes' as approval.
3. Implement STT → transcript review → existing read-only orchestration,
   and TTS → playback with interruption and caption parity. Reject unknown intents.
4. Add consent, retention policy, cost ceilings, monitoring, connection recovery,
   kill switch and explicit failure states. No business writes in initial qualification.
5. Independently verify identity, readback, audit, rate limit, replay, model/provider
   outage, audio injection, hallucination, and attempted privilege escalation.
6. Gradually qualify supported languages and opt-in conversational streaming;
   do not represent English (India), Tamil or Hindi quality as tested before trials.

**Release state:** Prepared code in a review branch. Not enabled in production until
human review, test evidence, independent browser verification and deployment approval.
