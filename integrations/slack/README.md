# VAOS -> Slack (outbound notifications)

Workspace identified: `vyndi`; dedicated channel: `#vaos-ops` (`C0C90LK78KA`).

The adapter is **disabled by default**. It performs outbound `chat.postMessage` with a least-privilege `chat:write` bot token (plus `chat:write.public` only if posting without joining channels; normally avoid it). Install the Slack app into the `vyndi` workspace and invite the bot to `#vaos-ops`.

**Do not put tokens in GitHub, source code, Slack messages, or chats.** Bind `SLACK_BOT_TOKEN` as a Cloudflare Worker secret or via VAOS Infisical broker; configure `SLACK_CHANNEL_ID=C0C90LK78KA` as nonsecret configuration. A ChatGPT-to-Slack connector token cannot be reused as the VAOS Worker bot credential.

Integrate `createSlackNotificationAdapter` through the existing `createGovernedHttpTransport({allowedOrigins:['https://slack.com']})` and provider runtime. The control plane must independently qualify `notification.send`, persist evidence and approval, and only then enable routing. Never enable solely because a credential exists.

Accept only declared event categories and sanitized summaries. No raw errors, logs, tokens, prompts, PII, or document contents. Redact at the caller boundary before constructing payloads. Slack is **not** an approval or command channel. Treat API acknowledgement as *send acknowledgement*, not independent readback; verify exact-channel Slack message readback through authorized API in a distinct live gate. Network uncertainty is HOLD, not a retry trigger, because a duplicate message could be generated.

Qualification:
1. Run `node --test integrations/slack/notification-adapter.test.mjs`.
2. Verify the provider manifest is valid and catalog registration is in place.
3. Commission the token and bot membership with restricted scopes.
4. Run one labeled synthetic notification via the VAOS Worker and independently read back channel/timestamp and content.
5. Record an immutable evidence reference, authority approval, fail-closed kill-switch test, and production routing transition.
6. Verify rate budget, deduplication/persistent admission, and monitoring before automating event streams.

The adapter is intentionally not tied into a scheduled Worker trigger until the above gates are green.


## Signed inbound founder event ingress (separately gated)

The Worker contains `POST https://vaos.vayushastr.workers.dev/api/slack/events`.
This endpoint remains **HOLD** unless the Worker secrets/flags and Slack app
Event Subscriptions are commissioned. It is distinct from the outbound
`notification.send` provider and never authorizes business writes or approvals.

1. In Slack API app **VAOS Operations**, retrieve the **Signing Secret** under
   Basic Information > App Credentials and store it only as Worker secret
   `SLACK_SIGNING_SECRET` (never Slack/chat/GitHub messages).
2. Enable Slack Event Subscriptions and use the request URL above; Slack's
   signed `url_verification` challenge must pass.
3. Subscribe bot events `message.im` and `app_mention`. Grant the required
   event-history bot scopes plus existing `chat:write`; reinstall the app if
   Slack requests it. Use only least-privilege scopes, never admin or write-ERP scopes.
4. After signed challenge, member allowlist, history scope, and readback are
   independently qualified, set Worker plain-text variable
   `VAOS_SLACK_EVENTS_CONTROL=founder-readonly-v1`.
5. Test a founder DM and a founder app mention in `#vaos-ops`; independently
   check thread replies, R2 `runtime/slack-events/` evidence, negative
   signature/replay/unknown-user tests, and emergency disable.

Founder DMs can return governed read-only observations; channel mentions only
return a safe direction to DM to avoid exposing business content publicly.
The Worker acknowledges Slack asynchronously and holds uncertain deliveries.
R2 event-ID readback suppresses sequential retries; this is **not an atomic
exactly-once guarantee** under concurrent delivery. Live qualification must
cover concurrency/race safeguards before high-volume production enablement.

Disable immediately with `VAOS_SLACK_EVENTS_CONTROL=disabled`.
The existing hourly `VAOS_SLACK_AGENT_CONTROL` mechanism is unchanged.
