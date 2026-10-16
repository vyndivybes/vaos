# VAOS local skills companion

Original VAOS implementation. The hosted page is `/skills.html`; it also runs directly from the companion on `http://127.0.0.1:47831/`. The companion binds only to loopback. No external API key or subscription is needed for the implemented local tools.

## Start

Use Node 24 or newer. From the repository root, run `npm ci --ignore-scripts` and `npm run prepare:companion`. The committed browser assets are also usable directly.

Install Python 3.12 tools in a separate virtual environment using `scripts/setup-companion.ps1 -PythonPath <python.exe>`. Supply `-VoiceModel` to explicitly download the approximately 75 MB English tiny.en model. Set `VAOS_COMPANION_PYTHON` to that environment's `Scripts/python.exe`. Use `VAOS_COMPANION_MODEL` if the model is stored outside `apps/companion/.data/models/tiny.en`.

Run `npm run companion`. On Windows this opens the local interface with a temporary session code in a fragment, which the page immediately removes. For the hosted VAOS interface, choose Copy pairing code locally, open VAOS Skills, choose Connect computer, and paste the code. The browser may ask for local-network access; it must be allowed to reach the companion.

Close the process or choose Stop companion to stop tasks and pause routines. Disconnect revokes the session's pairing code. Restart the companion to issue a fresh code. A routine cannot run while its companion process is closed.

## Implemented operations

| Skill | Concrete behavior and boundaries |
| --- | --- |
| Speech | Browser recording, actual microphone-level waveform, local faster-whisper CPU transcription, review before Ask VAOS, Stop/discard and stale-result guards. English model; maximum recording 30 seconds and decoded upload 60 seconds. Audio uploads are removed after processing, and transcripts are not persisted in job metadata. |
| Business conversation | Existing authenticated VAOS read-only question classification and evidence routes. The local page does not proxy account cookies or acquire authority to dispatch business writes. |
| Documents | Word through python-docx, workbooks through ExcelJS and PDFs through pdf-lib. Files are created inside the companion data directory and downloaded through authenticated artifact requests. PDF standard fonts currently support Latin text. |
| Browser | Playwright public-page text research, reviewed multi-step field filling/button actions, and downloads. Fresh isolated browser contexts; selected origin only, DNS pinned to a checked public IPv4 address, no service workers or web sockets. Private addresses are denied. Effectful tasks targeting VAOS/VYNDI or Workers domains are denied. Receipts describe browser actions, not independently certified business completion. |
| OCR | Tesseract with a locally installed English language pack. PNG/JPEG selection and browser-selected one-frame screen capture. Camera and continuous screen monitoring are not started. OCR does not establish visual understanding of diagrams. |
| Memory | Explicit save/edit/search/delete in local SQLite. Delete uses secure-delete with rollback journaling. Derived files the user already generated/downloaded are separate artifacts. |
| Routines | Durable interval and named-event routines, receipt deduplication, local document/briefing/reviewed-text-skill tasks. Restart marks unfinished tasks interrupted rather than replaying them. Browser writes and desktop actions cannot be scheduled. |
| Desktop | Reviewed Windows Notepad/Calculator launch, ASCII typing and coordinate clicking. Input requires one exact matching target window, activation and a second title check. PyAutoGUI fail-safe remains enabled. No arbitrary shell endpoint or unrestricted file-tree access. |
| Interface | Original responsive VAOS layout, actual task events/results, optional Three.js capability map with text fallback and keyboard rotation, reduced-motion support. |
| Skill Forge | Generate a bounded text-tool recipe from a supported purpose, run user-supplied expected-output tests in a separate worker with memory/time limits, review its exact hash, approve, then register/run. No arbitrary generated Python/JavaScript, imports, network or shell access. This is a limited text-tool forge, not general autonomous code invention. |

## Node-RED event integration

An existing Node-RED installation on the same computer can POST JSON such as `{"name":"report.ready","id":"unique-event-id"}` to `/api/events` with `Authorization: Bearer <session pairing code>` and `Content-Type: application/json`. Event IDs deduplicate each routine's delivery. Rotate the code after restarting or revoking pairing. This is a local event integration; it does not enable VAOS's evaluation-only Node-RED provider or expose its administration APIs.

## Data and security

The default data directory is `.data` beside the companion, configurable through `VAOS_COMPANION_DATA`. It contains a local SQLite database, generated artifacts, the OCR cache, and explicitly installed voice models. Upload names are generated by the service, never user-controlled paths. The database does not automatically save voice audio, transcripts, website text or arbitrary request payloads. Saved memories and routine templates are intentionally persistent and are not encrypted by this application.

Every data/control endpoint needs the temporary bearer code. Host validation prevents DNS rebinding of the localhost service. CORS permits only the companion's own origin and the existing VAOS Worker origin. Tokens stay in browser memory, are omitted from ordinary URLs and API logs, and can be revoked. No new production business write path is introduced.

## Verification

`npm run test:companion` runs boundary and persistence tests. Set `VAOS_RUNTIME_ACCEPTANCE=1`, `VAOS_COMPANION_PYTHON` and `VAOS_CHROME_PATH` for real document/OCR/browser acceptance. Add `VAOS_UI_ACCEPTANCE=1` for interactive UI tests at 320/768/1024/1440 pixels. `VAOS_ACCEPTANCE_DIR` optionally saves screenshots. A voice fixture check additionally needs `VAOS_VOICE_ACCEPTANCE=1`, `VAOS_VOICE_FIXTURE` and `VAOS_COMPANION_MODEL`.

Fixture-based voice and browser checks are not live microphone, speaker or physical desktop-user acceptance. The native input path requires a separate real-device check before claiming that experience is accepted.

## Third-party notices

Direct components use permissive licenses: faster-whisper and its selected tiny.en model, python-docx, ExcelJS, pdf-lib and Three.js use MIT; PyAutoGUI uses BSD; Playwright and Tesseract.js use Apache-2.0; SQLite is public domain. Preserve the notices in `licenses/` and `apps/web/vendor/THREE-LICENSE.txt`. Package/browser/model dependencies retain their respective licenses. `scripts/sync-companion-assets.mjs` copies the installed JavaScript notices and the exact Three.js assets; rerun it after dependency changes. No source, branding or assets from another assistant application are used.

## Reviewed browser and skill boundaries

Browser research uses an isolated, unauthenticated browser and same-origin GET/HEAD requests. Workflows still require review of the exact URL, steps, values and permissions. An optional `writePaths` array permits at most four exact, query-free POST paths, each used once per task and only within click-step windows. Other HTTP writes, other origins, sockets and service workers remain blocked. Page-load traffic settles before these windows open. This is a network permission, not proof that a website implements a safe business operation. A page script can use a permitted path during that window; only approve trusted public, non-sensitive tasks. GET endpoints can also have server-side effects. VAOS business control-plane actions remain denied here.

Skill Forge generates only the existing bounded text-operation language. Review now displays the complete definition and SHA-256. Execution checks that stored approval matches the definition again. Revoke approval through the UI or `POST /api/skills/:id/revoke` with its hash. Queued and scheduled runs check current approval when execution starts. Revocation does not undo a completed synchronous text transform. A changed tool must be proposed, tested and approved separately. Tool approval cannot deploy code, rewrite VAOS or grant network, filesystem, shell, camera or microphone permissions.

Video interpretation now supplies exact numeric sample times, all unsampled intervals, the largest gap and client-declared timestamp authority to both the synthesis model and the visible result. Images have verified digests; the uploaded clip association and timeline remain client-declared. No continuous motion or transcript synchronization is established. Existing opt-in visual voice continuation remains half-duplex, supports tap-to-interrupt, and now expires after five minutes or 12 questions, cancelling in-flight responses and closing the camera on limit. Native speech recognition and audible delivery still require device acceptance. Optional camera gesture recognition is not implemented.
