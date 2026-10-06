# VAOS Web

Initial VAOS login surface.

## Run locally

From the repository root:

```bash
python -m http.server 4173 -d apps/web
```

Then open `http://localhost:4173/login`.

## Current routing

- `/login` — canonical public entry
- `/` — redirects to `/login`
- legacy `/house*` — retired and redirected to `/login`
- legacy `/range*` — retired and redirected to `/login`
- unknown routes — fail closed to `/login`

The login form is visual-only until the VAOS identity provider is connected.
