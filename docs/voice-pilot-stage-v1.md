# VAOS Founder Voice Pilot — Stage V1 (Preparation)

**Branch:** `feat/founder-voice-readonly-pilot-20261011`  
**Authority:** Founder-only, read-only browser pilot. **Default: OFF.**  
**Production agent dispatch, financial/engineering writes, voice approvals, and autonomous voice actions: NOT AUTHORIZED.**

## Why this first increment

VAOS already provides founder-authenticated command drafting, recorded inbox messages that are **not routed**, and bounded mission read-only previews / unverified AI report drafts. The safest initial voice functionality supplements those flows without creating an independent decision engine or execution path.

This increment does **not** deploy a full server-side Cloudflare real-time voice-agent service, WebSocket, Durable Object, or continuous listening. The later real-time gateway should integrate with the existing VAOS authorization and audit authority, not with direct MCP calls.

## Available after separate commissioning

- Founder-only `GET /api/voice-capabilities` — returns `enabled:false` unless a Worker variable is explicitly set.
- Founder console push-to-talk dictation into **instruction draft** (up to 2,000 chars) or **mission follow-up** (up to 900 chars).
- The dictated text remains editable. Submitting, recording, generating reports, approving or executing **never occurs automatically**.
- Explicit button to speak the already-displayed *read-only preview* or *unverified AI draft*, keeping the status/warning wording in the audio.
- Stop microphone, stop speaking, and stop both on page exit.
- No audio uploaded to VAOS by the new code, no voice authentication, no voiceprints, no additional server ledger, no new third-party API tokens.

## Feature flag and rollback

Set `VAOS_VOICE_CONTROL=founder-readonly-browser-v1` only after isolated browser and security qualification and only when the change has passed review and is deployed through the approved Cloudflare release process. Do **not** set it for the preparation PR. Any other value or omission disables the pilot. Emergency disable: unset this variable or set `off`; existing typed console continues unaffected.

Do not put the flag in GitHub or checked-in Wrangler `vars` during preparation. The production Worker must be validated independently before activating the pilot.

## Voice privacy warning

Browser Web Speech recognition may use a browser-vendor transcription service. Users must not dictate secrets, personal data or confidential engineering/business records in the pilot. Microphone permission is requested by the browser and recognition starts only following an explicit click. Voice recognition is not a credential or authorization factor. Browser/device voice synthesis may be unavailable.

## Qualification requirements before pilot activation

1. **Static / unit:** test disabled-by-default, founder-only auth, method rejection, valid flag, no dispatch authority, transcript length/control validation, readback evidence gating, and no action side effects.
2. **Live authentication:** unauthenticated 401, checker 403, founder + OFF returns `enabled:false`; founder + flag returns `enabled:true`; no secrets exposed.
3. **Browser:** verify push-to-talk in a supported browser over HTTPS; deny microphone permission; record and stop; switch tabs / close page; confirm no background listening.
4. **UX:** dictation only populates fields, does not trigger a form submit or request, and confirmation/draft workflow remains unchanged. Ensure changing a draft after preparation invalidates submission until re-prepared.
5. **Speech output:** only approved display markers may be spoken; source text is read verbatim including unverified status. Browser TTS does not imply agent verification.
6. **Security:** verify permissions-policy microphone access, existing CSP, session, CSRF/origin checks on *existing* POST paths, rate limits, accessibility and privacy notice. Verify no new business writes.
7. **Rollback:** feature flag OFF deactivates voice controls on reload; standard typed workflow works.

## Follow-on Stage V2 (separate approval)

Deploy `@cloudflare/voice` behind a dedicated authenticated and rate-limited WebSocket gateway and Durable Object when justified. This requires additional privacy review, provider/cost caps, robust transcription safeguards, explicit consent, streaming interruptions, independent business effect gates and audit evidence, measured speech quality (English first, then Tamil/Hindi). No action authority is inherited merely because a command is spoken.

Reference: https://developers.cloudflare.com/agents/communication-channels/voice/

## Consolidation and verification record (2026-10-11)

- PR #172's controlled recognition lifecycle and cancellation guards have been ported into PR #174's browser-only pilot controller.
- Regression tests cover stale/late events, cancellation, unsupported browsers, permission failure, manual-only transcripts, and spoken read-only labels.
- GitHub Actions on the final PR #174 code: web-smoke, Cloudflare bundle-smoke, Dify and both Windmill qualification checks PASS.
- Cloudflare Worker binding inventory confirms VAOS_VOICE_CONTROL is absent. Production activation is OFF.
- Live browser microphone/audio, authorized founder session and end-to-end rollback checks still require independent qualification on a deployed/isolated preview.
- **Release decision: HOLD for merging/deployment/activation pending the remaining browser and authenticated live gates.** An automated build is not live voice qualification.

**Status:** Consolidated and CI-qualified as a draft PR. No production flag enabled; no browser/live qualification claimed.
