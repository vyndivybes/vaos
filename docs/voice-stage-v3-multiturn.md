# Stage V3 voice: bounded multi-turn read-only foundation

Scope: per-tab, founder-only, maximum three separately initiated microphone turns about one existing VAOS mission in a five-minute session. Each accepted question independently retrieves the authoritative mission status through the existing authenticated `GET /api/missions`. Mission, status, and work-package state counts are checked and rendered into deterministic text, then spoken through native browser audio.

This stage **does not invoke a language model**. Its topic matching is deterministic. That is deliberate: the preexisting founder AI drafts require a recorded-message and model qualification workflow; exposing them as free-form spoken facts would enlarge authority/privacy/cost scope. An AI-assisted V3 variant requires its own evidence-bound classification endpoint, independent test evidence and a separate commissioning flag before activation.

## Safety and privacy

- Existing `VAOS_VOICE_CONTROL=founder-readonly-browser-v1` and `VAOS_VOICE_CONVERSATION_CONTROL=founder-readonly-one-shot-v1` remain required.
- New `VAOS_VOICE_MULTITURN_CONTROL=founder-readonly-multiturn-v1` is independently default OFF.
- Founder-only session established using existing signed session capability route.
- No always-on microphone. Every turn requires the founder to click **Ask next question**.
- Raw utterances are processed in-browser and **not sent to VAOS APIs**. Browser vendor speech recognition may process audio. Only three topic labels (status / blockers / progress / evidence) are retained in short-lived volatile memory; no server storage, login history, analytics or persistent transcript is created.
- One authenticated GET per accepted turn, no retry, no POST, no business writes, agent dispatch, approvals, purchases or production engineering signoffs.
- A different selected mission, stop action, pagehide or expired session clears the context and aborts active GET; responses arriving afterward cannot speak.
- Evidence questions explicitly say this snapshot does **not** independently prove engineering validation. No model content is treated as evidence.

## Release and commissioning gates

1. Automated: red/green tests for three allowed turns, four rejected unsafe questions, wrong mission ID, fresh GET per question, canceled late responses, TTL expiry, no audio queue and absent feature flags, plus existing platform/web/Cloudflare smoke checks.
2. Merged code and production Cloudflare build must match. Preserve existing Worker bindings.
3. Activate **only** `VAOS_VOICE_MULTITURN_CONTROL` after all gates pass, maintaining V1/V2 and business controls unchanged.
4. Founder browser acceptance: enter `VAOS-CARBON-FRAME-S-20261010`, start Stage V3, click Ask next question, speak **What is the mission status?**; click Ask next question, speak **What about blockers?**; click Ask next question, speak **Show progress for the mission.** Verify reports include live status, 9 packages, 5 blocked, 0 completed if source has not changed. Fourth request must not run.
5. Negative live acceptance: attempting **approve purchasing and report status** must not trigger mission read/speech; End session must discard context and reject any stale reply.
6. Kill switch: disable/delete `VAOS_VOICE_MULTITURN_CONTROL` in Cloudflare then hard reload. Base V1/V2 still function and no workflow writes change.

Developer note: successful tests/build/configuration are *not* evidence that a signed-in user physically heard the three responses. Report that distinct user acceptance separately.
