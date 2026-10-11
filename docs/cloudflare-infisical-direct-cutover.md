# VAOS Infisical native Cloudflare watchdog cutover

## Current release boundary

The existing GitHub Actions canary remains the fallback until the direct path is
explicitly commissioned. The new Cloudflare Worker code defaults to **disabled**.
It must never activate `infisical.secret.broker` or alter a disabled provider.

## Runtime controls

- Effective 2026-10-11: Cloudflare cron is `0 * * * *` and independently runs the mission sweep.
- Set plain-text `INFISICAL_DIRECT_WATCHDOG_ENABLED=true` only after approved
  bootstrap credentials have been installed and reviewed.
- Cloudflare Secrets, not Wrangler vars:
  `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, and
  `VAOS_INFISICAL_WATCHDOG_KEY` (the existing durable *health/disable-only* key).
- Non-secret bindings (review before deploying): `INFISICAL_BASE_URL` (default
  `https://us.infisical.com`), `INFISICAL_PROJECT_ID`,
  `INFISICAL_ENVIRONMENT`, `INFISICAL_ALLOWED_SECRET_PATH`,
  `INFISICAL_ALLOWED_SECRET_KEY`, `INFISICAL_DENIED_SECRET_PATH`,
  `INFISICAL_DENIED_SECRET_KEY`, and optional `INFISICAL_DENIED_PROJECT_ID`.
  Treat any sensitive project/path metadata as Cloudflare Secrets as appropriate.
- Cloudflare `SUPABASE_URL` is existing. **Never use**
  `VAOS_DB_RPC_SECRET` to bypass scoped health/disable authorization.
- Do not reuse the scoped Stirling identity for this broker: it is a different
  Infisical project/permission boundary. Do not export GitHub secrets into code.

## Activation sequence (operator-reviewed)

1. Merge CI-green change and apply
   `20261009220000_infisical_cloudflare_direct_watchdog_v1.sql` with
   migration history. It accepts a recent `cloudflare:vaos:infisical:cron:<ms>`
   only for `record-health`; GitHub evidence and the existing independent
   five-minute Supabase emergency-disable guard remain intact.
2. Provision the **same qualified** Infisical Universal Auth machine identity
   into Cloudflare Secrets and configure the *fixed* allow/deny canary scope.
   The credential lease must be bounded; do not paste tokens into issue/PR logs.
3. In an isolated Worker preview, execute a synthetic native scheduled event
   and prove that a live allowed read succeeds, a denied read fails,
   a scoped `record-health` succeeds, and no GitHub dispatch occurs.
   Use immutable, sanitized evidence and independent database readback.
4. Enable `INFISICAL_DIRECT_WATCHDOG_ENABLED=true` only in production after
   isolation and rollout approval. Verify two **automatic** 15-minute Cloudflare
   ticks against the saved Supabase health authorities and cron logs.
5. Turn off both GitHub native `schedule:` on
   `infisical-scoped-commissioning.yml` and Cloudflare GitHub-dispatch
   credentials **only after** recurring direct evidence is verified.
   Keep manual GitHub workflow available only for break-glass qualification.
6. Separately commission production secret-broker routing through existing
   human authority and independent checks. The canary is not activation.

## Rollback / HOLD

Set `INFISICAL_DIRECT_WATCHDOG_ENABLED=false` and revert to the previous
Cloudflare GitHub dispatcher only while it is authorized and runners are available.
If health becomes stale, the five-minute Supabase guard disables Infisical;
**do not** auto-enable routing on a later healthy tick.
Any missing scope/secret, bad TLS/redirect, token TTL, readable denied path,
unknown dispatch, or failed database readback must fail closed.
No secret/access token/secret value is printed or returned by this module.

## Verification

```sh
node --test platform/execution/cloudflare-infisical-direct-health.test.mjs
npm test
npx wrangler deploy --dry-run --config wrangler.jsonc
```
 

## October 11 scheduling revision

Production hourly cadence is Cloudflare at minute 0, Supabase guard at minute 15, and workforce activity monitoring at minute 20. The Infisical routing freshness window is 70 minutes and stale disable is 130 minutes. Earlier mentions of a 15-minute cadence above describe the initial cutover, not current production configuration.
