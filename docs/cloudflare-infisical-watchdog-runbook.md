# VAOS hourly production scheduling (effective 2026-10-11)

The verified production Cloudflare Worker Cron Trigger runs at `0 * * * *` (UTC hour). The independent Supabase Infisical guard runs at `15 * * * *` and the digital employee activity monitor at `20 * * * *`. Each runs **once per hour**; the separate minute offsets avoid coincident database checks.

The Infisical routing health TTL is 70 minutes (60-minute canary plus 10-minute tolerance). The database guard warns after 70 minutes of absent verified health and disables the already-enabled broker after 130 minutes. Invalid credentials, qualification or health still fail closed immediately when checked. Neither guard nor health recording can enable a disabled provider. Emergency/manual disable is unchanged.

GitHub Actions `infisical-scoped-commissioning.yml` remains manual-only as the fallback. There is no native scheduled GitHub workflow, and no change to push-triggered CI. Qualification requires an automatic production canary, database health readback, and matching evidence; a configuration readback alone does not qualify live canary execution.

## Historical context (before the hourly change)

Earlier 15-minute recurring health dispatch

GitHub's native 15-minute schedule did not refresh health within the bounded
20-minute routing window. The independent database guard disabled Infisical
at 2026-10-09T09:19:29Z after the 08:46 health record aged past 30 minutes.
The production cron and `VAOS_GITHUB_WATCHDOG_DISPATCH_TOKEN` already exist,
but the deployed handler had stopped calling the dispatcher.

Cloudflare's existing quarter-hour cron now sends one fixed main-only health
dispatch. The fetch uses workerd-supported `redirect:manual` and rejects every
non-204 status, including redirects. It carries no Infisical/database identity,
never changes routing, and never retries an uncertain POST. The cron tick is
included as `watchdog_tick` and logged in GitHub as
`VAOS_INFISICAL_WATCHDOG_TICK` so independent verification can match the
Cloudflare invocation, GitHub run, and durable database health record.

The mission sweep and watchdog both settle before the scheduled invocation
reports failure. A dispatch failure cannot terminate a pending mission sweep.
A Cloudflare-dispatched live canary failure disables Infisical using the
existing restricted commissioning identity; the independent five-minute
Supabase guard remains active. A fresh health record alone never enables a
disabled provider. GitHub native scheduling remains a secondary trigger and
must not be described as verified because a Cloudflare dispatch succeeded.

Qualification requires two actual automatic Cloudflare ticks, matching
successful GitHub runs and matching Supabase commissioning records. A
bootstrap run is useful but is not proof of recurrence. Restricted existing
GitHub dispatch credential must remain repository-only Actions read/write;
never grant Contents, Administration, Secrets, or organization-wide access.
