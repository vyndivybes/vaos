# VAOS Runtime Foundation

This directory contains the first executable VAOS control-plane runtime.

## Boundary

Agents may **propose an intent**. The runtime evaluates capability authority and policy before an effect can proceed.

```text
agent intent
  → capability authority
  → action policy
  → DENY | PREPARE_ONLY | AWAIT_APPROVAL | ALLOW
  → approval queue / authorization evidence
  → execution adapter (future)
```

The runtime does **not** perform business side effects. An `AUTHORIZED` result means governance has authorized a future execution adapter; it does not mean the effect has already happened.

## Current persistence

The development runtime is explicitly `EPHEMERAL_DEVELOPMENT`. Its state is process-local and may reset between serverless instances. Durable event, intent, approval and idempotency storage is the next infrastructure layer.

## Idempotency

Intent and approval paths reject reuse of the same idempotency key with a different payload. Same-intent retries replay the existing result.

## Authority

Authority is capability-scoped using L0–L5. No agent receives wildcard authority.
