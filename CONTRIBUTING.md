# Contributing

VAOS is developed contract-first.

## Rules

1. Define or update interfaces before implementation.
2. Validate all external input at system boundaries.
3. State-changing operations must be idempotent where retries are possible.
4. Agent capabilities require explicit authority levels.
5. No production secrets or credentials may be committed.
6. Cross-domain changes require impact analysis.
7. Every merged feature must have verification evidence.

## Branching

Use short-lived feature branches and pull requests into `main`.

## Commit style

Prefer conventional commits such as:

- `feat:`
- `fix:`
- `chore:`
- `docs:`
- `test:`
- `refactor:`
