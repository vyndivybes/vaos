# VAOS without a Cloudflare deployment

Open GitHub Codespaces on branch `development/no-cloudflare-preview`, or clone the branch locally.

```sh
npm ci
npx wrangler dev --local --ip 0.0.0.0 --port 8787
```

Open forwarded port 8787. This is a *local Worker development instance*, not a Cloudflare deployment. External integrations, durable objects, R2, Workers AI, secrets and the VYNDI service binding may not operate until suitable **nonproduction** bindings are configured. Never copy production credentials into Codespaces. Do not use `wrangler deploy`.

The `offline-preview` workflow is opt-in; its uploaded files are source snapshots, not a functional hosted backend. GitHub may require a workflow to exist on the default branch before the **Run workflow** button appears. Do not merge this branch just to enable that control while Cloudflare automatic builds are connected.
