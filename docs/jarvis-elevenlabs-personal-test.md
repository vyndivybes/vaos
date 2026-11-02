# ElevenLabs voice for the approved personal test

The user rejected the previous development-only voice result because the live `/workspace` still served Windows/browser TTS. Read-only inspection confirmed that production had not received the branch. The user subsequently approved deployment using ElevenLabs, required strictly zero-paid usage, completed ElevenLabs onboarding, and confirmed personal/non-commercial use.

## Runtime behavior

All shipped browser speech consumers now use an explicit audio adapter. Main JARVIS, visual JARVIS, the engineering viewer, Founder Command, diagnostics and Skills result readback no longer select a platform TTS engine. A regression test scans all first-party browser modules for direct native speech selection. Hosted pages use `/api/voice-speech`; the standalone local companion retains its explicitly installed offline Kokoro backend. There is no automatic fallback between providers and no Windows voice fallback.

Hosted speech uses the official `@elevenlabs/elevenlabs-js` SDK, the stock George voice `JBFqnCBsd6RMkjVDRZzb`, Eleven v4, stability 0.5, similarity boost 0.75 and MP3 44.1 kHz/128 kbps. This is a provider stock voice, not a trained original identity or actor imitation. English is qualified; other reply languages stay available as written text until neural pronunciation is qualified.

The original memory implementation remains unchanged. Speech text selected for readback is sent to ElevenLabs under that provider's retention policy. Deleting VAOS memories does not delete ElevenLabs speech history. No claim of provider-side zero retention is made. The interface displays this distinction and attribution to ElevenLabs.

## Zero-paid controls

Activation requires the server-only `ELEVENLABS_API_KEY`, the explicit `VAOS_ELEVENLABS_CONTROL=free-personal-v1` setting, the existing founder voice control, and the existing R2 storage binding. The key was created through `npx -y @elevenlabs/cli@latest onboard init` and its browser authorization flow. It is kept in ignored `.env.local` locally and a Worker secret when provisioned, never in client assets or committed source. `npm run elevenlabs:preview` loads it via Node's `--env-file=.env.local` option. Cloudflare supplies it as a runtime secret.

Every generation verifies that the account is still on the free tier, overage cap is exactly zero, both extension flags are false, and sufficient included free quota remains. Unknown billing metadata, a paid plan, enabled extensions or insufficient free quota reject generation before synthesis. The observed account was free with 10,000 included credits, zero used before testing, and overages disabled.

Each request is capped at 600 characters. A content-free R2 ledger allows up to 1,000 characters per UTC day within the remaining monthly free quota, using conditional writes and a short generation lease. Concurrent attempts cannot both reserve the same ledger version. There are no automatic synthesis retries or refunds after ambiguous provider failures. No subscription upgrade, top-up, paid plan enrollment or overage activation exists in the code. External use of the same account can reduce remaining free quota; the account check is repeated for each request.

The endpoint requires the existing signed founder session, active founder voice capability, exact same-origin JSON and a fixed server-selected voice/model. Arbitrary voice IDs, external endpoints and client-supplied billing settings are rejected. Error responses are allowlisted and never echo credentials or provider response bodies. Responses include provider/profile provenance headers that the browser verifies before playing audio. Browser cancellation propagates an abort signal and suppresses late audio; already consumed provider credits cannot be undone.

Free credits are finite. If the quota or daily limit is reached, the written answer remains visible and speech stops with an error. No other provider is silently substituted. This mode is approved only for the user's personal/non-commercial test; commercial use is not qualified.

## Evidence and rollout

The official onboarding checker confirmed that the key works, the SDK is declared/imported, and the application loads the ignored env file. The onboarding test returned HTTP 200. A separate real SDK call generated the fixed public 77-character audition using George/Eleven v4 and returned a 103,278-byte MP3. Neither test included private business or historical conversation content. Audio quality still requires the user's own listening acceptance.

`npm run test:elevenlabs` verifies signed access, origin and input bounds, binary/provenance headers, free-only billing rejection, durable budget concurrency, no retry/refund behavior and absence of platform speech bindings. It is included in the repository regression command. The branch CI also runs the existing memory, browser, local-tool and offline neural qualification. CI does not receive the live ElevenLabs key and does not consume provider credits.

The approved rollout uses the existing controlled release workflow after exact-commit regression passes. Existing governance controls, schedules, provider permissions and restricted autonomy remain unchanged. Live verification must inspect served modules, confirm the authenticated ElevenLabs status and perform an owner-authorized speaker test. A green CI run alone does not establish listening acceptance.

Primary references: [ElevenLabs billing and free-plan usage](https://elevenlabs.io/docs/overview/administration/billing), [subscription/overage metadata](https://elevenlabs.io/docs/api-reference/user/subscription/get), [TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [official SDK](https://github.com/elevenlabs/elevenlabs-js), [onboarding](https://elevenlabs.io/docs/eleven-api/quickstart).
