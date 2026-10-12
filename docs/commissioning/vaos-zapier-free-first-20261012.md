# VAOS Free-First Integrations — 12 October 2026

## Financial constraint

No additional subscriptions or usage-based third-party API charges are approved.
VAOS must not depend on Zapier Catch Hook or other premium apps for core Slack notifications.

## Live native path (no Zapier task consumption)

Cloudflare Worker (already deployed) → Slack bot → founder DM / #vaos-ops,
with signed founder-only Slack ingress, rate-limited R2 audit, and no business writes.
Existing worker hourly cron remains unchanged. No new provider is provisioned.

Slack founder DM command: `VAOS free tier status`.
It reports native Slack and hourly founder observer binding status,
plus Zapier account-level free entitlements without exposing secrets.

## Zapier Free features (Zapier official Aug 2026)

* $0/month, 100 tasks/month shared between Zaps and MCP.
* Unlimited Zaps, Tables, Forms as assets; only two-step Zaps (one trigger + one action).
* 15-minute polling when the selected trigger is polling.
* Tables: 2,500 records; Forms: 10 project pages; one individual user.
* Copilot daily usage limits. MCP calls may consume tasks.
* Webhooks by Zapier Catch Hook, Catch Raw Hook and premium apps **not free**.
* Multi-step workflows and custom polling intervals **not free**.

Free Zap options the founder can configure in Zapier with an appropriate
standard-app action (only after reviewing source data sensitivity):
1. GitHub (new issue/PR event) → Slack #vaos-ops (minimal title + link; no sensitive text).
2. Google Calendar (new event from a dedicated business calendar) → Slack founder DM.
3. Google Drive (new file in a dedicated non-sensitive shared folder) → Slack founder DM.

Each is an optional separate two-step Zap, not an already created or published
Zap. No separate Gmail, Calendar, Drive, GitHub or Zapier authorization is
granted to VAOS merely because those apps appear in Slack or ChatGPT.

Current published `VAOS Webhook to slack` Zap #383210428 uses a paid
Webhooks by Zapier Catch Hook trigger. During the trial it may run; on Free
it is not eligible. Do not depend on it after trial or activate any billing.

## Account-side boundaries

Cloudflare/GitHub connectors can inspect or change VAOS's own resources, but
do not have authenticated Zapier-Zap authoring, Tables or Forms controls.
Free-plan features are account entitlements; no bulk activation toggle exists.
Any new Zap must be created and explicitly published from a signed-in Zapier
editor by the user or an independently authorized Zapier API/browser session.

Use direct native Slack for alerts instead of recreating a premium Zap.
Fail closed for unqualified GitHub CI, incident, Google OAuth, payments,
procurement writes and production business actions.
