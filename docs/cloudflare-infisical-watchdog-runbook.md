# VAOS Infisical recurring health dispatch

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
