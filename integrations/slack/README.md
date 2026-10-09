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
