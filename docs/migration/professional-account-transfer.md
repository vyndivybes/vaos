# Transfer to Professional Ownership

The current repository is a development and qualification environment.

## Transfer gate

Transfer only after:

- Architecture contracts are frozen for the release candidate.
- Experimental code is removed or isolated.
- CI, security, agent-eval, performance, and migration qualification is green.
- Production secrets are absent from history.
- Deployment documentation is complete.
- A release candidate is tagged.

## Production ownership

The qualified repository will move to the professional VYNDI / Vāyú Shastr GitHub organization.

Production credentials, environments, domains, runners, and deployment permissions will be provisioned fresh after transfer.

Do not copy development secrets into the professional environment.
