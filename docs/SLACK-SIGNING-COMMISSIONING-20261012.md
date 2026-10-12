# VAOS Slack signing-secret commissioning gate — 12 October 2026

This gate audits **Cloudflare Worker binding names and types only**. It intentionally does not retrieve secret text, call Slack App Credentials, or rotate the app signing secret. The active Slack Events ingress already prefers `VAOS_SLACK_SIGNING_SECRET_SECURE` over the legacy `SLACK_SIGNING_SECRET` and fails closed when the new value is present but invalid.

The live Worker currently has `SLACK_SIGNING_SECRET` as `plain_text` and **no** `VAOS_SLACK_SIGNING_SECRET_SECURE`. Consequently Slack credential hardening is a commissioning HOLD even though the secured runtime migration code is deployed.

## Read-only acceptance gate

1. Encrypted Worker secret `VAOS_SLACK_SIGNING_SECRET_SECURE` present (`secret_text`).
2. Encrypted `SLACK_BOT_TOKEN` present (`secret_text`).
3. Remove the legacy `SLACK_SIGNING_SECRET` plaintext binding **only after** a live correctly signed Slack callback has succeeded against the secure binding.
4. Independently observe signed callback acceptance and VAOS Slack reply delivery. Reading a channel or confirming a bot token alone is not valid signing-key evidence.
5. No business writes are permitted by this gate. Both an incorrect HMAC and an unsigned event callback must return denial.
6. For credential rotation coordinate the Slack App Credentials page with a fresh securely configured Cloudflare binding and replay a signed callback. Avoid rotating the Slack secret before the Worker is ready to accept the matching value, or incoming events can fail. Never paste credentials in GitHub, Slack messages or ChatGPT.

Workflow `slack-signing-commissioning-gate` tests the fail-closed contract on PR and `main`. Its manual `workflow_dispatch` reads Cloudflare **metadata only** and exits HOLD until it can prove the secure configuration. An explicit independent signed-event readback is still necessary for final commissioning. No certificate is minted by this workflow.

## Security disposition

Existing Slack service compatibility stays enabled during migration. No plaintext secret is re-used as a new secret via agent tooling; the application owner must perform the credential transfer/rotation through the appropriate secure UI. This engineering gate can pass CI without implying the production Slack migration is finished.
