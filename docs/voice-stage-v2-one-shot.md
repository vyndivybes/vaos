# VAOS Voice Stage V2 · Founder one-shot read-only conversation

## Commissioning scope

- Browser push-to-talk only. One user click admits one speech recognition utterance and a maximum of one authenticated `GET /api/missions?missionId=...` for a previously selected, existing mission.
- Supported intents: status, progress, evidence, blockers and reports. Other or ambiguous requests fail closed. No LLM interpretation is used and no AI answer is manufactured.
- A successful GET is checked against the selected exact mission ID; bounded, validated status/work-package data is rendered into a deterministic, labeled read-only preview then queued for the browser's native speech engine. A queued speech message is **not** a claim of audible delivery.
- Founder identity, signed session, old flag `VAOS_VOICE_CONTROL=founder-readonly-browser-v1`, and **independent** new flag `VAOS_VOICE_CONVERSATION_CONTROL=founder-readonly-one-shot-v1` must all pass. The new flag is OFF when absent.
- A Stop click, pagehide, changed mission ID, invalid transcript, invalid response, expired session, failed GET, audio failure or missing browser API cannot cause a second call or business action. A speech privacy notice warns of browser vendor processing.
- **Prohibited**: autonomous retries, always-on microphone, agent tools/dispatch, model-generated engineering claims, business writes, approvals, purchases, external speech API subscriptions.
- Reuses existing `/api/missions` session validation and data controls, with GET only. No new database migration or storage required.

## Qualification and rollback

1. CI: lint, tests for flag admission, rejected unsafe phrases, exactly-one GET, wrong-ID fail-closed, canceled late response, and speech-queue failure; public asset bundling.
2. Cloudflare deployed revision must match the approved squash-merge commit. Production variable values are kept out of the repository. Verify both flags and founder user path.
3. Browser acceptance: choose known mission `VAOS-CARBON-FRAME-S-20261010`; press **Ask VAOS · one-shot read-only**; say `What is the status and blockers for this mission?`; verify one read-only report visibly corresponds to this mission and browser speech is audible. Do not infer live project completion from a spoken status alone.
4. Negative acceptance: speech command `Approve purchasing and report status` must not fetch or speak a mission; abort during recording/read must not speak a stale result; non-founder/unauthenticated users must not receive the capability.
5. Rollback: disable or delete only `VAOS_VOICE_CONVERSATION_CONTROL` in Cloudflare, leaving existing Stage V1 voice and all business workflows unchanged. The endpoint then returns `oneShotEnabled:false` and the new buttons disable on refresh.

Code checks and Cloudflare deployment are distinct from the founder's end-to-end live acceptance. Record the latter as pending until independently observed.
