# VAOS Stage 4 — governed founder AI draft pilot

**Candidate only — OFF by default; do not merge or commission without independent approval and gate evidence.**

The first slice of Stage 4 is a bounded, two-sided read-only exchange: the founder
records a REPORT_REQUEST message to **Project Controls** or **VAOS Orchestrator** in
the already-commissioned Stage 2 inbox; optionally enters a mission ID; and can
request one natural-language model draft from Cloudflare Workers AI.

This is **not a qualified digital-employee response**. The first pilot accepts only an exact JSON echo of authoritative mission facts; it does not use free-form AI narrative to make factual claims. Outputs are explicitly
\`AI_DRAFT_UNVERIFIED\`. An independent database mission snapshot and Stage 3
verifier-derived facts are the only sources of authoritative evidence; model text
cannot grant a PASS, authorize closure or claim a business transaction occurred.

## Technical controls
- New route: POST \`/api/founder-chat\` (signed founder session, same-origin JSON,
  strict 4-field body, 2 named agents, recorded matching REPORT_REQUEST).
- All three flags required: \`VAOS_FOUNDER_INBOX_CONTROL=record-only-v1\`,
  \`VAOS_FOUNDER_AGENT_REPORT_CONTROL=preview-only-v1\`, and a **new**
  \`VAOS_FOUNDER_CHAT_CONTROL=qualified-readonly-v1\`. The new flag is NOT set.
- No user-supplied URL/model, tools, function calling, mission dispatch,
  approvals, jobs, overrides, updates or other VYNDI writes.
- Native Workers AI binding; one fixed free-tier-eligible model
  \`@cf/meta/llama-3.1-8b-instruct-fp8\`, max 256 output tokens per request. Live Cloudflare tests showed GLM-4.7 Flash produced no usable text within 256 tokens, and Granite invented an unsupported blocker. The selected Llama 3.1 8B FP8 model returned correctly structured JSON in a synthetic test. The Worker independently compares every echoed mission fact and formats the final text ONLY from authoritative data; extra model prose or contradictory facts fail closed.
  Live synthetic model tests consumed small amounts of quota. Cloudflare subscription and account billing read endpoints returned authorization failures; a Workers & Pages usage screenshot does not verify Workers AI neuron balance. On paid Workers accounts, usage above any free allowance may incur charges.
  **HOLD: account-specific Workers AI billing/usage is not independently confirmed; obtain spend-limit evidence before activation.**
- Candidate migration \`founder_agent_drafts\` is private, RLS enabled and
  append-only; one AI draft per original request. An exact Edge RPC authenticates
  the server key. Idempotent replay uses persisted text, no model re-invocation
  for already stored replies. An atomic immutable one-shot claim is reserved BEFORE inference and limits generation attempts to three per minute, with only one attempt per request, preventing concurrent duplicate inference. Failed inference consumes the claim and requires a NEW recorded report request. Account-level billing caps still require separate review.
- The model output is not evidentiary. A hash of the independent report and
  verified evidence IDs accompany the saved draft. UI uses textContent.

## Commissioning/acceptance sequence
1. TDD, complete CI, Cloudflare preview build, dependency and safety audit.
2. Review code and candidate SQL; test migration on isolated staging, negative
   RLS, server-key, role/CSRF/malformed envelope and replay tests. Apply only
   after successful independent verification.
3. Confirm Workers AI model and no unapproved spend; explicit founder approval
   before enabling \`VAOS_FOUNDER_CHAT_CONTROL\`.
4. Run one authenticated founder test with known Stage 3 verified mission;
   corroborate stored draft with database hash, source evidence and request ID.
5. Checker denial, no additional inference on replay, no business mutation,
   and drift/regression/cost controls must pass before production commission.

## Future work
Multi-turn context, separate agent personalities, streaming, push/voice, provider
fallback, reliable FIFO per-agent replies, AI evaluation,
human escalation, and independent model-output audit are **not** delivered here.
The UI must not call this a real autonomous digital employee.
