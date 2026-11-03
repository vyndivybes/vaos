# Internet and computer tools in JARVIS

JARVIS can route explicit typed or spoken requests to the paired local companion. Routing is deterministic and uses no model API. Existing business questions continue through the authenticated business routes.

## Connect your computer

1. From the repo, run `npm run companion`. The CLI uses `apps/companion/.runtime` automatically when installed, or `VAOS_COMPANION_PYTHON` when set.
2. Open the hosted workspace and expand **Internet & computer tools** below JARVIS.
3. Enter the local address and pairing code printed by the companion. The code stays in this tab, is cleared from its input after pairing, and is never placed in a URL by this interface.
4. Type a request or select **Start conversation**. The browser asks for microphone permission. On-device recognition is preferred. Browser-provider recognition requires a separate consent prompt when local recognition is unavailable.

The companion must be running on the computer being controlled. An update to the hosted website does not install or start a service on somebody else's computer. Windows Word/desktop dependencies are documented in `apps/companion/README.md`. PDF, spreadsheet and RSS search do not require a Python model. Public-page browser tasks require Chrome or Edge configured through the existing companion launcher.

## Supported requests

| Request | Result |
| --- | --- |
| `search the web for bicycle tyre standards` | Public Bing RSS results with titles, source URLs and snippets. No key or paid tokens. |
| `read https://example.com/specs` | Public-page text and links from an isolated browser. |
| `open calculator` or `open notepad` | An exact PC action draft, waiting for approval. |
| `type "Hello" in window "Untitled - Notepad"` | Reviewed ASCII input into one exact matching window. |
| `click 100, 200 in window "Calculator"` | Reviewed screen coordinates; the target title is checked before input. |
| `create pdf titled "Notes" with text "My notes"` | Reviewed document creation and an authenticated Download file button. `xlsx` and `docx` are also supported. |
| `create spreadsheet with text Project status` | A simpler spoken document request, using the title JARVIS notes. |
| `on https://example.com fill "Search" with "bicycles" then click "Find" allowing post "/search"` | A browser draft showing the exact origin, fields, values, button and optional POST path. |
| `on https://example.com download "Download report"` | A reviewed browser download into companion artifacts. |

The quoted forms are useful for precise typing, window titles and browser fields. Voice transcription may not reproduce quotation marks or URLs reliably; edit the draft or use the existing Skills browser builder when needed. These are supported commands, not a promise to understand arbitrary computer instructions.

## Conversation and approval

Start conversation keeps listening between completed replies while the tab is visible. JARVIS pauses recognition while retrieving, reviewing or speaking. Say **stop listening**, **stop conversation** or **end conversation** when it is listening, or click **Stop** at any time. Hiding the tab ends listening and cancels the active request. A late language-pack probe or task response cannot reopen the microphone or overwrite a stopped turn.

PC actions, browser workflows and conversation-created documents require a clicked review of the server's exact payload and hash. Voice cannot approve an action. Cancel rejects the draft. Stop requests cancellation, but a click or keystroke already delivered may have partial effects. Stopping speech cannot undo an action.

## Boundaries

- Search uses a public provider feed which may be unavailable or change. Failures and empty results are displayed; no provider challenge is bypassed. Source snippets are not verified facts.
- Website text is shown as text and never treated as system instructions, action approval or business evidence. It does not automatically dispatch follow-on tools.
- Browser work uses a fresh isolated session, public IPv4 targets and the existing same-origin network controls. It cannot operate the user's signed-in browser tabs. POST requires an explicitly reviewed exact path; private networks, shell commands and VAOS/VYNDI business write bypasses remain blocked.
- Desktop control remains limited to Notepad/Calculator launch, ASCII typing and coordinate clicking. It is not unrestricted PC administration, arbitrary app automation or general filesystem access.
- Generated files stay in companion artifacts until explicitly downloaded or deleted. This change does not add arbitrary file deletion or shell access.
- Existing conversation-memory provenance, tenant scope, retention/deletion and approval controls are unchanged. Tool results and microphone transcripts are not automatically imported into memory.
- Hosted speech retains the existing ElevenLabs personal-test, free-credit and no-overage limits, with no Windows TTS fallback. Browser speech services may process audio under their own policy. This is foreground, half-duplex conversation; physical microphone/speaker and native input acceptance still require a device check.

## Verification

`npm run test:web` covers routing, consent, cancellation and existing voice/business regressions. `npm run test:companion` covers real reviewed PDF creation/download, exact-hash approval, origin isolation and search parsing/limits, alongside existing companion controls. Browser acceptance should pair through the interface, search/read a public source, reject a PC draft, approve/download a document, and exercise conversation resume and Stop on desktop and phone widths. Simulated recognition is not proof of physical microphone or audible speech acceptance.
