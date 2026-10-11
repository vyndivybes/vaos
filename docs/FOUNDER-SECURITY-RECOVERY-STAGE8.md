# VAOS Stage 8 — Founder security and safe inference recovery (draft)

Release state: NOT commissioned. This PR does not activate flags, rotate credentials,
modify production database tables, or enable business writes.

## Session hardening
Feature flag OFF by default: VAOS_AUTH_HARDENED_CONTROL=dedicated-hmac-v1.
When commissioned it requires BOTH:
- Existing VAOS_DEV_LOGIN_PASSWORD_SHA256 configured with a non-default digest.
- New independent VAOS_SESSION_HMAC_KEY secret, 32–64 random bytes encoded in
  lower/uppercase hexadecimal (64–128 hex characters), not equal to a password digest.
  Never print, log or paste the key into a chat message.

Existing development-style cookies are cryptographically rejected at cutover; the
founder/checker must sign in again. Hardened sessions carry version 2, an issued-at
timestamp and random session ID, and cannot exceed the existing eight-hour TTL.
HMAC signing is no longer derived from the password hash in this mode. A missing
key/configured login digest fails closed. Old mode is untouched before release.

The existing password authentication still uses a SHA-256 digest, and Stage 8 does
NOT yet supply MFA, passkeys, managed accounts, per-device revocation, lockout policy,
or full password-hashing modernization. Those are separate release prerequisites
for higher-risk agent actions.

## Failed inference recovery
If the atomic inference claim already exists, VAOS now checks the immutable
reply store a SECOND time. If a valid reply arrived concurrently, it returns
that same persisted record without rerunning the model. If no reply is stored,
it reports CLAIMED_NO_REPLY (HOLD) rather than incorrectly suggesting success or
blindly consuming more Workers AI. If the readback fails, it returns a 503.

No existing claims are reset or deleted; no model inference is automatically
retried. Recovery after an outage still needs an audited, maker/checker-reviewed
procedure, to be implemented separately.

## Commissioning checklist
1. All web tests and Cloudflare smoke PASS, including auth hardening and claim race.
2. Independent code and adversarial auth review.
3. Install a strong secret in an isolated PREVIEW Worker, not production.
4. Prove HMAC signing and verification via the Worker runtime; legacy cookie
   rejection, new founder and checker logins, and no exposure to network logs.
5. After explicit release approval, install production HMAC key, then switch
   hardening flag. Treat this as a planned global session invalidation.
6. Verify role denial, session expiration, Stage 4–7 read-only behavior,
   failed-claim readback and emergency disable; preserve hourly watchdog.
7. Do not enable business writes or autonomous agent tool execution.

Current Stage 7 remains a founder-only read-only pilot, with a separate
authenticated multi-topic acceptance still needed.
