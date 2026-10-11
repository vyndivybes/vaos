# VAOS Stage V4 — Governed AI-assisted read-only voice (controlled canary)

V4 adds exactly one constrained use of the existing Cloudflare Workers AI binding per explicitly accepted founder question. The AI returns **topics only**, never facts, work-package status, approvals, agent commands or spoken prose.

## Security and trust
- Founder signed session and flags V1 `VAOS_VOICE_CONTROL`, V2 `VAOS_VOICE_CONVERSATION_CONTROL`, V3 `VAOS_VOICE_MULTITURN_CONTROL`, plus independent V4 `VAOS_VOICE_AI_CONTROL=founder-readonly-ai-focus-v1`. OFF if any missing.
- Every V4 question requires a user click. Speech recognition happens in browser; unlike deterministic V3, V4 **sends transcribed question text** and up to 2 prior topic labels to a new POST `/api/voice-ai-focus` for Cloudflare Workers AI classification. The founder is warned in the UI.
- Model `@cf/meta/llama-3.1-8b-instruct-fp8` (existing binding) is constrained to one exactly shaped JSON classification, max 96 output tokens, temperature 0. No tool calls. Model text never authors mission facts.
- A fresh `GET /api/missions?missionId=<selected>` must return an exact-ID validated snapshot **before inference**. The browser renders status and work-package counts from the snapshot only, with a clear **AI-ASSISTED READ-ONLY PREVIEW — NOT AGENT EVIDENCE** label.
- The model cannot approve, submit, dispatch, purchase, edit business records, or invoke other integrations. A server-origin check, JSON-only request, founder-only session, exact body keys, bounded question and forbidden verbs fail closed.
- AI classification is inference-only but uses a POST due to bounded computation, NOT a business write.

## Cost cap
- HARD quota in preexisting R2 binding `VAOS_ARTIFACTS`: **maximum three model-inference claims per UTC day** across this founder-only V4 endpoint. The counter key contains day and count, not question, transcript, mission, email or model response.
- The cap claim happens *before* inference; R2 optimistic `onlyIf` conditional PUT guards concurrent updates. A missing store, quota conflict, invalid counter or quota exhaustion produces denial and **never calls AI**. No blind retry.
- This is not a guarantee the account incurs $0. Cloudflare Workers AI has a shared free daily allowance; other account usage and billing plan are outside this endpoint. The owner should review the Workers AI dashboard and cap configuration.

## Commissioning and rollback
1. Run platform/web CI plus Cloudflare smoke, including unauthenticated/non-founder, wrong origin, action requests, unsupported topics, model tool-calls, missing quota, 3/day, stale in-flight responses, and Stage V3 compatibility.
2. Deploy verified exact merge commit; verify all old flags and bindings intact.
3. Activate only `VAOS_VOICE_AI_CONTROL` after green gates, as founder-only canary.
4. Real browser: enter existing mission `VAOS-CARBON-FRAME-S-20261010`, click **Start AI-assisted V4 read-only session**, use **Ask next question** with status/blocker/evidence prompts. The app should give factual speech based on current persisted mission and indicate model-classified focus, not model-authored facts. Three inferred requests per UTC day globally; the fourth must receive 429 even if browser session restarts.
5. Also check **Approve purchasing and report status** is rejected without inference, and **End session** discards context and stale audio. Record user-visible acceptance separately from code success.
6. Kill switch: delete/disable **only** `VAOS_VOICE_AI_CONTROL` (Cloudflare Worker secret). Existing V1/V2/V3 deterministic read-only voice continues. Do not enable procurement, approvals, execution or unrestricted AI narration.

This is **model-assisted conversational focus**, not unrestricted autonomous voice-agent authority. It does not claim independent engineering validation.
