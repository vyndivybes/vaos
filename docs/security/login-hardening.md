# Login and deploy hardening: operator steps

This change set removes the built-in development credential and source-derived session
key, adds salted password hashing and login throttling, closes two unauthenticated
endpoints, and moves Cloudflare credentials behind protected GitHub environments.
Code changes ship in the repo; **the steps below must be done by an operator**.

## 1. Rotate to salted password hashes (do this before deploying)

The Worker still accepts the old unsalted 64-hex SHA-256 format, so nothing breaks on
deploy, but those digests are cheap to crack if they ever leak. Move to PBKDF2:

```bash
node scripts/auth/hash-password.mjs      # hidden prompt; min 14 characters
npx wrangler secret put VAOS_DEV_LOGIN_PASSWORD_SHA256     # paste the pbkdf2-sha256$... value
node scripts/auth/hash-password.mjs      # a DIFFERENT password for the checker
npx wrangler secret put VAOS_DEV_CHECKER_PASSWORD_SHA256
```

Notes:
* Hashes default to 600,000 PBKDF2-SHA256 iterations. This needs CPU headroom on the
  Workers plan you run on; measure one login after rotating.
* The previous built-in digest is now refused outright, even if configured.
* Rotate the passwords themselves if the old digests were ever stored outside Cloudflare.

## 2. Confirm the dedicated session key exists

Production already sets `VAOS_AUTH_HARDENED_CONTROL=dedicated-hmac-v1`, which requires
`VAOS_SESSION_HMAC_KEY` (>= 64 hex chars). Verify it is set as a secret, not a var.

Outside hardened mode (local dev, unit tests, any preview that does not set the flag)
sessions are now signed with a random per-process key. They cannot be forged from the
source, but they also will not survive a restart or span isolates. That is intentional.
Do not run a public deployment without the hardened flag.

## 3. Rate limit the login endpoint at the edge

`apps/web/lib/login-throttle.mjs` limits 5 failures per IP and 20 per account per 15
minutes, **per isolate**. It is defence in depth. Add a Cloudflare rate-limiting rule
for `POST /api/login` (for example 10 requests/minute per IP) as the authoritative
control.

## 4. Create the GitHub environments the workflows now reference

Settings -> Environments:

| Environment | Used by | Settings |
|---|---|---|
| `production-deploy` | `jarvis-controlled-release.yml` (deploy job) | **Required reviewers**; deployment branches: `main` only |
| `preview-deploy` | `dify-preview.yml` | Deployment branches: `feat/dify-fail-closed-adapter` |
| `cloudflare-maintenance` | `cloudflare-preview-retention.yml` (cleanup job) | Deployment branches: `main` only (no reviewers; it runs on a schedule) |

Then **move `CLOUDFLARE_API_TOKEN` (and `ELEVENLABS_API_KEY`) from repository secrets
into those environments' secrets**. Until you do, the environment names are harmless
but add no protection, because repository secrets are visible to every job.

Also:
* Scope the Cloudflare API token to this one Worker (Workers Scripts: Edit) and avoid
  account-wide permissions.
* Enable branch protection on `main` (require a pull request and passing checks).
* Other workflows that deploy or hold credentials (`vaos-slack-controlled-deploy.yml`,
  `vaos-g3e3-controlled-release.yml`, the Infisical and DB-RPC qualification workflows)
  should get the same treatment.

## 5. Adding a new API route

`apps/web/api-auth-coverage.test.mjs` fails if a routed handler neither verifies the
session nor appears in its reasoned `EXEMPT` list. Add the exemption deliberately, with
the alternative control, or authenticate the handler.

## Known follow-ups not changed here

* `isolated-stage8-stage9-qualification.yml` pins `wrangler@4.149.0` for a config it
  generates at run time; align it after running that workflow once on 4.157.0.
* Third-party actions are pinned to tags, not commit SHAs.
* Login/session responses still report `environment: "development"` regardless of mode.
