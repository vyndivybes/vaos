# Consolidated JARVIS reliability upgrade

## Scope and preserved contracts

Improve the existing JARVIS implementation in place. Keep all sixteen employees,
the existing risk/commercial specialist ownership, VYNDI OS/VEDM authority,
Cloudflare Workers Builds deployment, Supabase storage and free-tier routing.
No model, paid provider, infrastructure binding, database schema or execution
authority is added. Existing flags and authenticated founder access still apply.

The referenced chat exposes attachments and user messages but its assistant
approval bodies are unresolved content references. The current user request is
the controlling scope; no additional approved feature list is assumed.

## Reference assessment

The three supplied Zubair Trabzada packs describe six-prompt, eight-prompt and
sixteen-prompt JARVIS builds. Transferable requirements are bounded conversation,
source-visible answers, honest failure reporting, cancellable voice, explicit
sensor consent and evidence from the running system. Their paid API models,
local config/server pattern and desktop monitoring are not installed into VAOS.
Model names, prices and promotional assertions in these packs are not treated
as independently verified facts. Existing VAOS memory and authority boundaries
take precedence over a demo's automatic file writes.

External repositories were inspected as reference data only:

- Legal: `zubair-trabzada/ai-legal-claude` at
  `19ece98df260c4c645bdd750f6e2eb48af2bd6c4`. No license file was present.
  No source code, templates or installer were copied or executed.
- Marketing: `zubair-trabzada/ai-marketing-claude` at
  `e5aa0ea4c5f30d8bc08771e8ea932463e76d3356`. MIT licensed, but no code copied.
  `scripts/analyze_page.py` and `scripts/competitor_scanner.py` disable hostname
  and certificate verification. Their arbitrary URL fetching also lacks the
  public-destination checks needed for an authenticated service. Neither crawler
  nor installer is imported. VAOS specialist review remains network-free.

## Changes and acceptance

| Behavior | Implementation | Evidence |
| --- | --- | --- |
| Voice cannot remain stuck on a stalled read/classifier | Each operation has a 15-second deadline, AbortSignal race and listener/timer cleanup. No automatic retry; late completion cannot speak or record a turn. | Stalled-provider, cancellation and existing multi-turn regressions |
| Follow-ups remain within the current employee and recorded history | Reject report agent mismatch, non-adjacent prior ID and invalid sequence before inference | Context regression confirms zero model calls on rejected input |
| Displayed citations include the selected term | Center bounded source snippets around the first match, preserving original line numbers | Long-line knowledge and specialist citation regression |
| Specialist reports prepare a safe review | Existing Legal/Marketing previews now expose required context and review steps in both pasted and converted-file flows | Deterministic workflow and authenticated API regressions |

Legal preparation asks for the full revision, jurisdiction, dates, parties and
objectives, then requires counsel review. Marketing asks for audience, source
dates, approved claims and measured campaign evidence. No invented ROI, legal
score, certification, assignment, signing, publication, sending or spend occurs.
These remain keyword inventories, not semantic legal analysis or live web audits.

## Verification boundaries

Run existing test and bundle commands; the new regression joins `test:web`.
Record actual results in the PR and delivery report. A green local test or Worker
bundle does not establish authenticated production behavior, successful audio
playback or live model availability. Cloudflare Workers Builds remains the
deployment authority. No synthetic evidence is promoted to live qualification.

Browser acceptance after deployment: sign in as the founder, open File
intelligence, paste a 60–12,000 character contract or marketing excerpt, run the
corresponding review, and verify source lines, context requirements and approval
steps. For voice, begin a read-only mission session, cancel during a read, and
confirm no late speech; an unavailable provider must fail without retrying.
