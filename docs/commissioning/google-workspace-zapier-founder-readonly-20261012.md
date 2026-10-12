# VAOS Google Calendar / Drive and Zapier — independent read-only commissioning

## Authority boundary

The Google Calendar and Google Drive connectors in ChatGPT do **not** convey
their tokens, API authority, or existing OAuth grants to the VAOS Cloudflare
Worker. The separately installed Slack Google apps are notifications and not
VAOS identity grants.

The new Worker code is fail-closed until independent Google OAuth consent,
encrypted credentials, and hardened founder authentication are independently
qualified. Scope is limited to `calendar.events.readonly`,
`drive.metadata.readonly`, `openid`, and `email`; no write API is called.

## Minimum Google Cloud configuration

1. In Google Cloud Console, create/select an OAuth project and enable **Google
   Calendar API** and **Google Drive API**.
2. Configure the OAuth consent screen for the founder's Google account,
   including test-user inclusion when the app is in Testing mode. These scopes
   may require Google verification to expand beyond a test account.
3. Create an OAuth 2.0 **Web application** client. Set the exact redirect URI:
   `https://vaos.vayushastr.workers.dev/api/google-workspace/callback`
4. Save `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in
   Cloudflare Worker **encrypted secrets**. Never add either to GitHub or Slack.
5. Provision `VAOS_GOOGLE_VAULT_KEY` as an **independent, non-extractable
   AES-256-GCM secret_key** with encrypt/decrypt usages; do not share or reuse
   the Activepieces vault key.
6. Harden and independently qualify founder session authentication
   (`VAOS_AUTH_HARDENED_CONTROL=dedicated-hmac-v1`) before permitting the
   OAuth start route. No insecure development login may grant Google data access.
7. Only after all steps are qualified, set
   `VAOS_GOOGLE_CONTROL=founder-oauth-readonly-v1` as a Worker variable.
8. Authenticate to VAOS and open `/api/google-workspace/start` in the same
   browser to give explicit Google consent; verify callback reports
   `CONNECTED_READONLY`. No Google password ever enters VAOS.
9. Ask VAOS Operations in **Slack DM only**: `Google Workspace brief`. VAOS
   reads at most ten primary-calendar events from the next seven days and ten
   recent Drive file metadata entries. No titles, participants or file content
   leave the private runtime into Slack.
10. If a private morning digest is desired, enable
   `VAOS_GOOGLE_BRIEF_CONTROL=founder-daily-readonly-v1`; hourly trigger
   checks only the 08:00–08:59 IST window, sends at most one audited message per
   day to the allowlisted founder DM, and has no blind retries.

### Endpoints

* `GET /api/google-workspace/status` — founder-only presence/readiness.
* `GET /api/google-workspace/start` — hardened founder authorization required;
  initiates OAuth with PKCE + state + browser-bound SameSite=Lax cookie.
* `GET /api/google-workspace/callback` — only a valid, unexpired,
  single-use browser-bound state can complete Google consent; verifies account.
* `GET /api/google-workspace/brief` — founder-only, redacted counts.
* Slack founder DM `Google Workspace brief` — governed on-demand counts.

All endpoints and scheduled tasks fail closed when controls, consent or secure
vault key are missing. A Google consent event by itself is not an approval of
business transactions or company-wide document access.

## Zapier

`ZAPIER_CATCH_HOOK_URL` is already configured as an encrypted Cloudflare
secret, and `qualification/zapier/*.json` contains a synthetic test record.
VAOS can report existing readback through founder Slack DM
`Zapier qualification status`. No new webhook test is automatically sent:
Zapier HTTP acceptance is **not proof** of Zap execution.

Independent acceptance needs the *same* synthetic `eventId` in the Zapier
Catch Hook trigger/test, a successful Zap task in Zapier History, and the
expected resulting Slack message readback. Until then keep the Zapier provider
manifest disabled, do not trigger business writes or auto-retry ambiguous hooks.

## Emergency disable

Disable Google reads or daily briefs with
`VAOS_GOOGLE_CONTROL=disabled` and
`VAOS_GOOGLE_BRIEF_CONTROL=disabled` respectively. Revoke the OAuth grant in
Google Account third-party access if compromised. Rollback retains ciphertext
audit in R2 and does not propagate tokens to logs.
