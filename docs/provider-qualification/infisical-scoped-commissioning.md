# Infisical commissioning writer — restricted and expiring

This is **not an activation credential**. It can **only** record a verified
Infisical health result while the provider is qualified and disabled, or
perform an emergency disable of that provider. The database rejects every
other action, including `activate` and the generic `providerStatePut`.

## Authority and trust boundaries

1. GitHub Actions uses its own new secret `VAOS_INFISICAL_COMMISSIONING_KEY`.
   Do **not** replace `VAOS_DB_RPC_SECRET`, `INFISICAL_CLIENT_SECRET` or
   any Cloudflare secret. Do not paste plaintext credentials in chat.
2. The new database lease stores only the SHA-256 hash with a short
   expiration. No writer identity is provisioned by the migration.
3. The SQL routine locks the Infisical provider row, reconstructs only
   allowlisted health fields, and preserves `enabled=false` during health
   recording. The only other action sets `enabled=false` and
   `capabilityEnabled.secret.broker=false`.
4. Both actions write a private audit record. The SQL function refuses
   missing credentials, expired leases, wrong provider/state, invalid
   GitHub run evidence, timestamps beyond two minutes or activation actions.
5. The Edge Function uses a **separate** `infisicalCommissioningControl`
   operation and forwards it to the narrowly scoped SQL routine.
6. The `infisical-scoped-commissioning` workflow is manual-only.
   `record-health` first runs all live Universal Auth, allowed/denied canary,
   bounded token TTL, staging and kill-switch checks; a failure prevents
   health persistence. `disable` performs emergency rollback only.
7. Deployment/health pass **does not** authorize routing. Production
   activation requires a **different** identity, fresh health and a
   new explicit owner approval; it has not been implemented here.

## Provisioning, after migration and Edge deployment are verified

From the owner's PowerShell terminal (requires GitHub CLI authenticated to
`vyndivybes`), run this block. It prints **only a one-way hash**:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes); $rng.Dispose()
$key = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = [BitConverter]::ToString(
  $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($key))
).Replace('-', '').ToLowerInvariant()
$sha.Dispose()
gh secret set VAOS_INFISICAL_COMMISSIONING_KEY --repo vyndivybes/vaos --body $key
if ($LASTEXITCODE -ne 0) { throw "GitHub commissioning secret creation failed" }
Write-Host "SAFE SHA256 HASH: $hash"
Remove-Variable key, bytes -ErrorAction SilentlyContinue
```

The operator provides only `SAFE SHA256 HASH`. Register it in
`vaos_private.infisical_commissioning_lease` with a maximum 24-hour
`expires_at`, using the connected Supabase administrator. Never put the
plaintext key in SQL or a migration. Reprovision as needed; expired credentials
fail closed. Protect the GitHub `infisical-commissioning` environment with
branch restrictions and an authorized reviewer before dispatching.

## Qualification and independent activation

Wave-2 qualification is already stored with 15 PASS checks.
The existing read-only audit correctly reports `SAFE_HOLD` until health
is persisted. None of this work changes the qualification record or
the current `enabled=false` state. The new key must never be used for
full state writes or normal VAOS operation.
