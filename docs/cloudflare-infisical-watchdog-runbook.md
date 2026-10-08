# VAOS Cloudflare → GitHub Infisical watchdog fallback

## Verified root cause (9 Oct 2026)

Cloudflare `vaos` has an active `*/15 * * * *` cron and its scheduled
invocations were observed in Cloudflare Workers Logs with an `ok` outcome.
However, before this change the `scheduled()` handler in
`apps/web/cloudflare-worker.mjs` ran **only** the VAOS mission sweep.
It did not run Infisical health checks or dispatch the GitHub watchdog.
GitHub's native `schedule` event had zero recorded executions.
Supabase independent `pg_cron` correctly disabled Infisical at
2026-10-08T22:45:00Z after 30 minutes without fresh health evidence.

## Change

The already-configured Cloudflare cron keeps running the existing mission
sweep. In parallel it can now dispatch the existing
`infisical-scoped-commissioning.yml` workflow on `main` with
`action=record-health`. The GitHub workflow performs the live Infisical
canary and writes health using its existing restricted DB identity.
Cloudflare receives **no** Infisical or database identity and cannot
enable providers. It sends one fixed-path GitHub API request with a 12s
timeout, no redirects and no retries of ambiguous POSTs. No credentials,
HTTP bodies or GitHub responses are logged.

## One-time operator credential provisioning (REQUIRED, not automated)

1. Create a short-lived GitHub fine-grained personal access token scoped
   **only** to repository `vyndivybes/vaos`, repository permission
   **Actions: Read and write**. Do not grant repo Contents, Administration,
   Secrets, or organization-wide access. Record the expiry/rotation owner.
2. Store the token in Cloudflare Worker `vaos` using an encrypted Worker
   secret named `VAOS_GITHUB_WATCHDOG_DISPATCH_TOKEN`. Never paste the
   token into ChatGPT, source control, logs, or a plaintext variable.
3. Deploy the *reviewed and merged* `main` build to Cloudflare with
   Wrangler, preserving existing assets, environment secrets, service
   bindings, Durable Object class and `*/15` cron. GitHub CI is
   a **dry run only**; merging does not deploy the Worker.
4. Confirm Cloudflare Workers Logs emit
   `VAOS_INFISICAL_CRON_DISPATCH_ACCEPTED` for a scheduled event.
   `ACCEPTED` means GitHub HTTP 204 only: it is not proof of canary success.
5. Find a matching GitHub Actions run with event `workflow_dispatch`,
   confirm it passed all live canary steps, health persistence and evidence
   artifact, then independently check the production Supabase provider state
   and the five-minute independent guard verdict. Verify two cycles.
6. The provider is currently **disabled**. This fallback **must not**
   re-enable it. Follow the existing separately approved activation
   procedure only after all required checks. Confirm health again after
   reactivation. A successful canary on a disabled provider alone is
   not activation approval.

### Failure handling

- No secret: `VAOS_INFISICAL_CRON_DISPATCH_UNCONFIGURED` logged; no
  unauthorized outbound call. Qualification remains BLOCKED.
- Unauthorized, rate-limited, missing workflow or other non-204 response:
  `VAOS_INFISICAL_CRON_DISPATCH_FAILED` and scheduled invocation fails,
  independently of completed mission sweep. No POST retry.
- GitHub dispatch succeeds but canary fails: never infer health; the
  existing five-minute Supabase independent guard remains fail-closed.
- An unresolved GitHub `schedule` event must not be described as PASS
  merely because Cloudflare initiated `workflow_dispatch` successfully.

## Validation

`node --test platform/qualification/cloudflare-infisical-dispatch.test.mjs`
`npm test`
`node --test apps/web/cloudflare-worker.test.mjs`
`npx wrangler@4.136.3 deploy --dry-run --config wrangler.jsonc`

**Release gates:** code green, independent review, merge, actual Cloudflare
deployment, restricted token present, two live Cloudflare-to-GitHub-to-
Supabase matched executions, no unauthorized reactivation.
