# VAOS ↔ Zapier free-plan Catch Hook commissioning

**Status:** Qualification-only, not production enabled. Existing Zapier provider manifest remains `enabled: false`.

## Direction and scope

Use **VAOS → Webhooks by Zapier (Catch Hook) → Slack** in a *separate Zap*.
The existing **GitHub New Commit → Slack** Zap is not a Catch Hook and need not be overwritten.

Zapier's incoming Catch Hook trigger is available on Free plans. **Webhooks by Zapier as an outgoing action is not**; a GitHub-triggered Zap posting an HTTP webhook to VAOS therefore cannot be assumed free.

## Zapier setup

1. Create new Zap with **Webhooks by Zapier** trigger and **Catch Hook** event.
2. Copy the `https://hooks.zapier.com/hooks/catch/<account>/<key>/` URL. Treat the entire URL as a password; never commit, email, or post it in logs/issues/chat.
3. On Cloudflare `vaos` Worker → Settings → Variables and Secrets, create an **encrypted Secret**, name `ZAPIER_CATCH_HOOK_URL`, value the full Catch Hook URL.
4. Deploy the tested VAOS Worker change; sign into VAOS maker account before calling `GET /api/zapier-webhook` (returns secret presence only). GET must report `READY_FOR_SYNTHETIC_PROBE`.
5. To send one deliberately bounded test from the VAOS origin, use `POST /api/zapier-webhook` with JSON body `{"confirm":"run-synthetic-zapier-once"}` and same-origin maker session. Record the returned `eventId`.
6. In Zapier's trigger **Test**, inspect the `vaos.zapier.synthetic.v1` event, confirm the `eventId`, then add the desired low-risk Slack action. Do not publish until independently reviewed.

## Nonnegotiable controls

- HTTPS and exact Zapier Catch Hook host/path allowlist.
- Maker session + same-origin POST + explicit one-shot confirmation.
- No business entity data; no arbitrary action execution; no inbound activation.
- Bound 8-second network timeout, redirects forbidden, no automatic resend after unknown outcomes.
- R2 admission record required **before** sending; final receipt is redacted and leaves independent readback pending.
- Zapier HTTP acceptance does **not** prove Zap execution; provider manifest remains disabled until verified run evidence and explicit approval.
- Verify duplicate behavior and rate limits before later production qualification.

## API

`GET /api/zapier-webhook`: presence-only status, authenticated maker.
`POST /api/zapier-webhook`: manual synthetic test only; status `HOLD` even for HTTP 200 accepted hooks.

If callback/audit/qualification gates are not completed, never set the production provider to ACTIVE.
