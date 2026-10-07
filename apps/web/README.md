# VAOS Web

VAOS development web surface and governed control-plane API.

## Run locally

From the repository root:

```bash
python -m http.server 4173 -d apps/web
```

Then open `http://localhost:4173/login`.

Static-only local serving is useful for visual work. API-backed control-plane flows require a compatible serverless/Worker runtime and the Supabase control-plane bindings.

## Current routing

- `/login` — canonical public entry
- `/workspace` — authenticated VAOS workspace shell
- `/api/*` — control-plane API handlers
- `/` — redirects to `/login`
- legacy `/house*` — retired and redirected to `/login`
- legacy `/range*` — retired and redirected to `/login`
- unknown routes — fail closed to `/login`

## Cloudflare Workers

VAOS can run on Cloudflare Workers without rewriting the existing serverless handlers.

`cloudflare-worker.mjs` provides the Worker fetch entrypoint and `lib/cloudflare-adapter.mjs` maps Fetch API requests/responses onto the existing handler interface. Static HTML, CSS, browser modules and assets are served through the Cloudflare Static Assets binding. Server-only API and library sources are excluded from the public asset bundle through `.assetsignore`.

Cloudflare configuration is defined at repository root in `wrangler.jsonc`.

### Qualification

Every pull request touching the Worker surface runs a Wrangler dry-run bundle gate. The deployment workflow also runs the complete VAOS test suite and a second dry-run before deployment.

### Required GitHub secrets

The manual `cloudflare-deploy` workflow requires:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `VAOS_DB_RPC_SECRET`

The Cloudflare token should be scoped to the minimum Worker-edit permissions and the intended Cloudflare account.

### Deployment status

The Worker is named `vaos-dev` and uses `workers.dev` for the development deployment. Deployment remains manual until the production identity provider and edge-access policy are qualified.

Do not commit Cloudflare or Supabase credentials.
