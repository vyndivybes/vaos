# Infisical Wave 2 Live Qualification Setup

This setup is intentionally separate from production activation.

## Goal

Prove that the VAOS secret broker can:

1. authenticate through Infisical Universal Auth;
2. read one explicitly allowed canary secret;
3. fail to read one known-existing denied canary secret;
4. keep the access-token TTL within VAOS policy;
5. emit governed live evidence without logging or persisting secret material.

The workflow never enables the Infisical provider.

## Infisical qualification resources

Create or reuse a dedicated qualification project/environment.

Recommended names:

- Project: `vaos-provider-qualification`
- Environment: `qualification`
- Allowed path: `/vaos/allowed`
- Allowed key: `CANARY`
- Denied path: `/vaos/denied`
- Denied key: `DENIED_CANARY`
- Machine identity: `vaos-qualification-runner`

Both canary secrets must exist. Their values may be arbitrary non-empty random values.

The machine identity must be able to read the allowed canary and must not be able to read the denied canary. A denied request may surface as HTTP 403 or as permission-masking HTTP 404.

Configure Universal Auth for the machine identity and create a Client ID + Client Secret. Use the shortest practical credential and access-token TTL compatible with the qualification workflow. VAOS currently rejects access-token TTL above 7200 seconds.

## GitHub Actions secrets

Repository: `vyndivybes/vaos`

Configure:

- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`

Do not put these values into repository variables, workflow YAML, issues, pull requests, chat messages, or files.

## GitHub Actions variables

Configure:

- `INFISICAL_BASE_URL` — optional; defaults to `https://us.infisical.com` (Infisical Cloud US; use `https://eu.infisical.com` only if your identity was created in the EU region)
- `INFISICAL_PROJECT_ID`
- `INFISICAL_DENIED_PROJECT_ID` — optional for granular-access deployments, required for two-project Free-plan qualification
- `INFISICAL_ENVIRONMENT`
- `INFISICAL_ALLOWED_SECRET_PATH`
- `INFISICAL_ALLOWED_SECRET_KEY`
- `INFISICAL_DENIED_SECRET_PATH`
- `INFISICAL_DENIED_SECRET_KEY`
- `INFISICAL_MIN_TOKEN_TTL_SECONDS` — optional; defaults to `60`
- `INFISICAL_MAX_TOKEN_TTL_SECONDS` — optional; defaults to `7200`

Recommended values for the canary layout above:

```text
INFISICAL_ENVIRONMENT=qualification
INFISICAL_ALLOWED_SECRET_PATH=/vaos/allowed
INFISICAL_ALLOWED_SECRET_KEY=CANARY
INFISICAL_DENIED_SECRET_PATH=/vaos/denied
INFISICAL_DENIED_SECRET_KEY=DENIED_CANARY
```

## Live workflow

Workflow:

`provider-wave2-infisical-live-qualification`

The workflow runs:

- qualification-engine contract checks;
- provider-live-evidence contract checks;
- Infisical Wave 2 profile checks;
- Infisical resolver tests;
- live API transport tests;
- live Universal Auth;
- allowed canary read;
- denied-scope read;
- token TTL policy check;
- governed evidence validation;
- evidence artifact upload.

The evidence artifact is:

`qualification-evidence/provider-wave-2/infisical.json`

It contains check IDs, outcomes, GitHub Actions run references, runtime contract version, and commit SHA. It must never contain:

- Client ID;
- Client Secret;
- access token;
- allowed secret value;
- denied secret value.

## Qualification stages after ephemeral-live

A successful Wave 2 live run completes both the `ephemeral-live` and `staging` evidence stages:

- Universal Auth login
- allowed canary read
- denied-scope read
- bounded token TTL
- Credential Broker integration
- secret-value nondisclosure
- live health + expiry behavior
- provider kill-switch drill

Still required before provider qualification/activation:

### Production qualification — no old-secret retrieval needed

The Free-plan operator does **not** need to retrieve or copy the existing GitHub Actions `INFISICAL_CLIENT_SECRET` (GitHub secrets cannot be read back).

1. Keep the **existing** `INFISICAL_CLIENT_SECRET` and `INFISICAL_CLIENT_ID` unchanged. The existing Client Secret was proven valid in live run `37781924884`.
2. In the same Infisical machine identity, generate **one new** Universal Auth Client Secret with a short lifetime. Save the complete new value securely until promotion. Do **not** revoke the original yet.
3. Save the **new** secret value in GitHub Actions repository secret `INFISICAL_NEXT_CLIENT_SECRET`. This is a separate secret; `INFISICAL_CLIENT_SECRET` still contains the old credential.
4. Trigger workflow `provider-wave2-infisical-rotation-preflight` from a push of `.github/provider-wave2-infisical-rotation-preflight.trigger` to `qualify/infisical-live`. It authenticates with NEXT and proves allowed/denied reads and the staging kill switch while the old credential is still present. **Wait for SUCCESS.** If it fails, **do not revoke the original**.
5. After the preflight passes, revoke/delete **only the original Client Secret** in Infisical (not the new one). Confirm the new secret remains valid. Do not remove the old `INFISICAL_CLIENT_SECRET` from GitHub yet; it is now deliberately revoked and will be used as a negative-login probe.
6. Trigger workflow `provider-wave2-infisical-production-qualification` from a push of `.github/provider-wave2-infisical-production.trigger` to the PR branch. The workflow maps `INFISICAL_NEXT_CLIENT_SECRET` to **current** and the existing `INFISICAL_CLIENT_SECRET` to **revoked**. It proves next credentials authenticate, revoked credentials fail, and the local governed rollback drill disables routing. It rejects equal credentials. **No routing is enabled in production.**
7. Once the production run passes, promote the **saved new value** from `INFISICAL_NEXT_CLIENT_SECRET` into the repository secret `INFISICAL_CLIENT_SECRET` securely, then delete `INFISICAL_NEXT_CLIENT_SECRET`. Do not expose secret values in chat, comments, files or logs.
8. Complete evidence ingestion/qualification with verifiable live and production GitHub Actions run IDs. Final owner approval must be explicit. **Activation remains a separate gated procedure.**

The production workflow writes `qualification-evidence/provider-wave-2/infisical-production.json`, archived as `provider-wave2-infisical-production-evidence`.


The final production-stage check is explicit owner approval. CI cannot manufacture that evidence.

Only after all four stages pass may the Provider Qualification Engine mark `secret.broker` qualified. Activation is a separate governed action and requires healthy current provider state.


## Free-plan qualification using separate projects

Infisical Free permits unlimited projects but does not permit folder-level access controls. For VAOS qualification on the Free plan, use **project-level isolation**, retaining the positive and negative authorization checks.

1. Keep `vaos-provider-qualification` as the **allowed** project, with the existing `/vaos/allowed/CANARY` secret in its existing `dev` environment.
2. Create a separate project named `vaos-provider-denied-canary`, with its own `dev` environment and `/vaos/denied/DENIED_CANARY` secret.
3. Confirm the denied secret genuinely exists in the separate project using the human administrator dashboard, independently from the machine identity. Retain a non-secret verification record or screenshot showing the project, environment, path and key name **with the value hidden**. A 404 for a nonexistent secret is **not** evidence of access denial.
4. **Remove** the original `DENIED_CANARY` from the allowed project before assigning read access to that project. Verify the allowed project contains no restricted secrets.
5. Assign `vaos-qualification-runner` the built-in **Viewer** role *only in the allowed project*; do not assign it to the denied project. Do not assign Admin or Member.
6. Set `INFISICAL_ENVIRONMENT=dev`. Keep `INFISICAL_PROJECT_ID` referencing the allowed project. Set repository variable `INFISICAL_DENIED_PROJECT_ID` to the **actual UUID of the denied project**.
7. Keep `INFISICAL_DENIED_SECRET_PATH=/vaos/denied`, `INFISICAL_DENIED_SECRET_KEY=DENIED_CANARY`, and both existing allowed-secret variables unchanged.
8. Configure Universal Auth credentials as GitHub Actions **Secrets**, never as repository variables. Run the live qualification workflow against both project IDs; verify the positive read succeeds and the negative read fails (403 or permission-masked 404).

**Scope of evidence:** This proves enforced **project isolation** with the machine identity and tests an actual denied project. It does **not** claim same-project folder-granular authorization on Infisical Free. The manual denied-secret existence verification is mandatory before treating the live run as security qualification evidence. VAOS provider activation remains disabled until all subsequent staging/production checks and owner approval pass.

When `INFISICAL_DENIED_PROJECT_ID` is absent, the runner retains the original same-project denied-probe behavior for deployments with granular access controls.


### Auth API contract (October 2026)

The live qualification uses the current Infisical Universal Auth login API: `POST /api/v1/auth/universal-auth/login` with `Content-Type: application/json` and `clientId`/`clientSecret` in the JSON request body. The API's US base is `https://us.infisical.com`; the EU deployment requires `https://eu.infisical.com`. It records only an allowlisted HTTP failure category or network category when authentication fails; it never emits the Client ID, Client Secret, access token, or response body.
