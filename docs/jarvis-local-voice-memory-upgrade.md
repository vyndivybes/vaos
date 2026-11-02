# JARVIS local voice and governed conversation memory

Initial development implementation, 2 November 2026. The user subsequently approved an ElevenLabs personal/non-commercial rollout with strictly zero-paid usage. See the [current ElevenLabs test-mode guide](jarvis-elevenlabs-personal-test.md) for that follow-up. No private history import or restricted autonomy activation is authorized by this voice change.

## Audit and scope

Baseline: `292f86f663cca6a68b9c19e3d4697d347bb8d463` on `main`.

| Existing component | Finding | Change |
| --- | --- | --- |
| `apps/web/main-voice.mjs`, voice readback/acknowledgement | Browser speech synthesis selected platform voices, including Windows TTS | JARVIS output uses authenticated local Kokoro synthesis and browser WAV playback |
| `apps/web/skills.mjs` | Result readback used platform TTS | Local neural result readback, bounded to 600 characters |
| Companion `store.mjs` | Explicit personal notes in SQLite; no conversation provenance or tenant policy | Separate governed conversation tables and FTS5 index; legacy notes stay separate |
| `jarvis-project-memory.mjs` | Founder-only R2 object, up to eight short notes, 60-day read filtering | Existing hosted notes are not silently migrated or imported |
| `g6-conversation.mjs` | Short-lived in-page follow-up context | Retained; historical recall is a separate explicit local read |

The follow-up also replaces the older qualification pilot, visual JARVIS, engineering viewer and diagnostics output bindings. All shipping browser consumers use an explicit neural adapter, with no platform TTS fallback. Hosted output uses the user-requested ElevenLabs free personal test; the standalone companion retains offline Kokoro. Existing business evidence/model routes, calendars and autonomy gates are unchanged.

## Run locally

Use Node 24+ and Python 3.12. In the repository:

```powershell
py -3.12 -m venv apps/companion/.runtime
apps/companion/.runtime/Scripts/python.exe -m pip install -r apps/companion/requirements.txt
apps/companion/.runtime/Scripts/python.exe -m pip install -r apps/companion/requirements-neural.txt
apps/companion/.runtime/Scripts/python.exe apps/companion/setup_neural.py --destination apps/companion/.data/models/kokoro
$env:VAOS_COMPANION_PYTHON=(Resolve-Path apps/companion/.runtime/Scripts/python.exe).Path
$env:VAOS_COMPANION_TENANT='my-local-profile'
$env:VAOS_COMPANION_SUBJECT='local-owner'
npm ci --ignore-scripts --no-audit --no-fund
npm run companion
```

The model installation is an explicit public download of approximately 354 MB. Startup and synthesis never download models. The installer and runtime verify fixed SHA-256 digests from the publisher's `model-files-v1.1` release. `VAOS_COMPANION_NEURAL_MODEL` can name an existing verified local model directory. `VAOS_COMPANION_DATA` chooses the database directory.

Open the companion on its loopback address. Its pairing code is the local owner's credential. The credential stays in page memory. On a hosted development JARVIS page, open **Local neural voice connection** and pair the same computer. Production serving this branch is intentionally not enabled by this work. Chromium may require local-network permission and a deliberate playback click.

The fixed `vaos-cinematic-v1` voice blends Kokoro's `bm_george` at 65% with `bm_lewis` at 35%, using British English phonemization and speed 0.96. This is VAOS's own preset recipe, not a newly trained identity, exclusive voice or actor/film-character imitation. There is no voice-cloning input. English only; unsupported languages fail explicitly, leaving the text answer visible. No Windows/cloud voice fallback occurs. Text chunks, one-at-a-time synthesis, timeouts, aborts, stale callbacks, WAV validation and temporary file cleanup are enforced. Startup removes only this feature's abandoned temporary WAV files after obtaining the data-directory lock.

## Save, import and recall

Open **Memory → Conversation history on this computer** on the local companion page. Existing notes and conversation history are separate stores. Nothing automatically records conversations or imports this chat.

Choose an authorized JSON export and **Review authorized export**. The complete normalized text, selected source label, archive digest, tenant-bound review hash and expiry are displayed before approval. Pending reviews hold staged text for at most 15 minutes. They can be loaded on the local companion page after preparation on a paired hosted development page. Approvals from hosted origins are denied.

The importer accepts either ChatGPT `conversations.json` or this explicit format:

```json
{
  "schemaVersion": 1,
  "messages": [
    {
      "conversationId": "project-history",
      "messageId": "decision-1",
      "role": "user",
      "text": "An authorized historical statement.",
      "createdAt": "2026-11-02T10:00:00Z"
    }
  ]
}
```

ChatGPT import follows `current_node` through parent links. It imports only user/assistant text on that selected branch. It excludes system/tool records, alternative branches and non-text content. No attachment, remote link, connector, cookie store or inaccessible private conversation is fetched. Malformed/cyclic exports, duplicate source IDs, future timestamps and conflicting edits to an existing source fail closed. Re-importing an identical source is idempotent. A conflicting batch rolls back atomically. Exports are bounded to 100 conversations, 2,000 text messages, 12,000 characters per message and the HTTP request limit of 15 MB. The UI selects files below 10 MB. At most 20 pending reviews per tenant are allowed.

On JARVIS, **Review saving this exchange** captures the question associated with the displayed response. Editing the input afterwards does not rewrite that association. Saving is a review/approval operation, not automatic logging.

**Recall history** returns up to 20 matching excerpts with original message/conversation IDs, original timestamps, content and archive hashes, importer and approval provenance. In Ask JARVIS, `Recall rotor steel` or `What did we decide about rotor steel?` performs the same local read and displays up to three cited excerpts. Retrieval uses AND keyword matching, ordered by recency, not embeddings or an LLM summary. No-result responses explicitly avoid concluding that no conversation ever occurred.

All imported statements, including past assistant answers and instruction-like text, are `USER_SUPPLIED_UNVERIFIED`. Recall is labeled `UNTRUSTED_HISTORICAL_REFERENCE`, `actionAuthorized:false`, `policyMutable:false`. Text is rendered with `textContent`. It never enters a system prompt, gains engineering authority, dispatches a tool, grants autonomy or changes a policy. Existing verified business reads do not silently mix historical statements into current business facts.

## Identity, policy and deletion

The local owner pairing credential is bound at service startup to `VAOS_COMPANION_TENANT` and `VAOS_COMPANION_SUBJECT`, defaulting to `local-personal` / `local-owner`. Request body fields, query parameters and arbitrary tenant headers cannot choose another tenant. The connection displays the configured profile. The programmatic server constructor can provision separate tenant/subject reader credentials for isolated retrieval. Those credentials cannot access legacy companion tools or approve changes. No credential-enrollment HTTP endpoint is added.

This is local profile isolation, not an integration with hosted VAOS organization membership or enterprise SSO. Anyone holding the same local owner code has that profile's authority. Use separate data directories/processes and OS accounts for separate human owners until enterprise credential provisioning is commissioned. Legacy personal notes/tools remain single-owner and are not made tenant-aware by this feature.

Only three policy fields exist: `retentionDays` from 1 to 365, `recallEnabled`, and `importEnabled`. Defaults are 60/true/true. Changing any field requires a prepared immutable proposal and an explicit local-owner approval of its exact hash. The approval is bound to tenant, subject, policy version and a 15-minute expiry. Wrong hashes, readers, cross-tenant actors, replayed approvals and stale versions fail. Historical/model text has no policy-changing route. There is no auto-capture or autonomy-policy field.

Retention begins at the original source timestamp. Already expired sources are skipped. Shortening retention immediately shortens existing records; increasing it never extends existing expiry dates. Startup, a minute timer, and every memory request purge expired messages, staged reviews and the search index. When the process is off, expiry is enforced on next startup; no offline background eraser is claimed.

Delete excerpt and Delete all saved conversations remove original text and FTS entries using SQLite secure-delete with rollback journaling and FTS5 secure-delete. Delete all also clears staged reviews. Content-free approval/deletion audit metadata expires after 30 days. Deletion is tenant-scoped. It does not erase the user's original export, downloaded outputs, screenshots, filesystem snapshots, SSD remanence or external backups. Re-importing deleted content requires a new explicit approval. Legacy notes and hosted R2 notes have their own existing deletion controls.

The SQLite file is not encrypted by this application. The OS account and data-directory permissions are a trust boundary. Production acceptance must establish appropriate disk encryption, backup/deletion procedures and account provisioning. No claim of forensic erasure or tamper-proof audit is made.

## Qualification and production acceptance

The branch workflow `JARVIS local voice and governed memory` runs repository regression tests, local browser/tool acceptance, a Worker bundle dry run, and actual CPU neural synthesis. It has read-only repository permissions, no deployment credentials and no deploy step. `wrangler deploy --dry-run` bundles locally only.

```powershell
npm test
$env:VAOS_UI_ACCEPTANCE='1'
$env:VAOS_RUNTIME_ACCEPTANCE='1'
npm run test:companion
$env:VAOS_NEURAL_ACCEPTANCE='1'
$env:VAOS_COMPANION_NEURAL_MODEL=(Resolve-Path apps/companion/.data/models/kokoro).Path
node --test apps/companion/test/neural-runtime.test.mjs
```

Automated checks cover restart, tenant scope, read-only principals, provenance, local approval origin, wrong/replayed/expired/stale approvals, atomic conflict rollback, duplicate import, malicious historical text, retention, physical plaintext removal from the test database, history UI import/recall/delete, responsive widths, neural WAV generation, cancellation and cleanup. Existing business question and follow-up routes retain regression coverage. Native microphone/speaker/desktop checks remain opt-in device acceptance, not inferred from a green unit suite.

Initial Windows CPU evidence: an 8.628-second, 24 kHz mono WAV was generated in 31.216 seconds on a cold run. This proves neural synthesis, not acceptable interactive latency or perceived cinematic quality. The per-request Python/model lifecycle is intentionally simple and may need an authenticated persistent worker after resource/latency qualification. No latency promise is made.

Production gates remain:

1. Owner listening approval of pronunciation, pacing and voice identity on target speakers; real microphone, interruption, tab visibility and browser autoplay/local-network acceptance.
2. Target hardware latency, concurrency and sustained resource measurements. English is the only qualified neural output language.
3. Approved historical exports, exact tenant mapping, scope review, and import approval. No real historical conversations were ingested by development qualification.
4. Enterprise identity provisioning, credential rotation/revocation and hosted account-to-local-profile binding; disk encryption and backup/deletion sign-off where required.
5. Independent security/retention review and explicit approval for any production rollout. Restricted autonomy remains separately governed.

## Open-source components

No purchased AI tokens, external model API key, paid TTS/embedding service or new subscription is required. Local hardware/storage/electricity and any CI usage are not claimed to be free resources. Existing VAOS provider billing configuration is not altered.

Kokoro-82M weights are Apache-2.0; kokoro-onnx and ONNX Runtime are MIT; NumPy uses BSD-3-Clause; phonemizer and eSpeak NG use GPL-3.0 licenses. These are open-source dependencies, not all permissive licenses. No upstream code, weights or voice files are committed here. Preserve installed package/model notices and comply with their source/license obligations when redistributing an assembled runtime.

Primary references: [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M), [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), [voice blending example](https://github.com/thewh1teagle/kokoro-onnx/blob/main/examples/with_blending.py), [fixed model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1), [phonemizer](https://github.com/bootphon/phonemizer), [eSpeak NG](https://github.com/espeak-ng/espeak-ng).
