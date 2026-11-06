# Contributing to VAOS

Our goal is software people can understand, test and operate confidently. Use clear names, small changes and evidence that another developer can reproduce.

## Engineering rules

1. Define or update interfaces before implementation.
2. Validate every external input at its system boundary.
3. Make state-changing operations safe to retry where possible.
4. Require explicit authority for every agent capability and protect approval gates.
5. Never commit production secrets, tokens or private customer data.
6. Review the impact of changes that cross business domains.
7. Every merged feature must have tests or other verifiable qualification evidence.

## Writing for people

Follow [WRITING_FOR_PEOPLE.md](docs/WRITING_FOR_PEOPLE.md) for documentation, UI copy, reports and error messages. Tell the reader what happened, what is uncertain and the next safe step. Keep exact API codes and audit classifications intact.

Use **HOLD** when the underlying rule requires it, and explain why the process cannot continue. A friendlier message must not imply that an order, payment, forecast or release is approved when it is not.

## Working on a change

Use a short-lived branch and open a pull request into `main`. Describe the user problem, the changes made, the tests run and anything still unverified. Prefer focused commits with familiar prefixes (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).

Before requesting a merge, run the relevant focused tests and the required full qualification checks. Deployment success and real-world operational verification are separate acceptance gates.
