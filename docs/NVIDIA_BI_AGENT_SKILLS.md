# NVIDIA BI developer skills — VAOS

These NVIDIA-authored agent skills were vendored **without modification** from
[NVIDIA/skills](https://github.com/NVIDIA/skills/tree/c24aea9a0b0bbe9bd16363682045fc9218b3cbef/skills)
at upstream commit `c24aea9a0b0bbe9bd16363682045fc9218b3cbef` (6 November 2026).

| Project-local skill | Purpose |
| --- | --- |
| `nvidia-ontology-setup` | Official Helm / Docker Compose runtime commissioning and MCP connection |
| `nvidia-ontology-query` | Grounded, authenticated Auto Ontology read/query/answer validation |
| `nvidia-ontology-management` | Semantic definitions, measures, relationships and governed publication |
| `accelerated-computing-cudf` | Optional NVIDIA GPU DataFrame ETL and pandas-compatible acceleration |

For live commissioning read [NVIDIA Auto Ontology commissioning](NVIDIA_AUTO_ONTOLOGY_COMMISSIONING.md). The fourth skill is pinned to the same NVIDIA source commit; deploying a server remains a separately qualified step.

Operational skill files are at `.agents/skills/<skill>/SKILL.md`; all locally
referenced `references/` and `assets/` files are included. Agent hosts that
recognize project-local Agent Skills (including Codex) can discover them when
they open the VAOS checkout. This **is not** a global installation to the
developer's Windows machine or ChatGPT plugin registry.

The Auto Ontology skills require an **independently installed, running and
authenticated** Auto Ontology server. No server, database connection, MCP
endpoint, token, or live business data has been provisioned by this commit.
The management skill must not gain automatic write authority; preserve
VAOS's existing permissions, approval, evidence, and read-only gates.

The cuDF skill is documentation for an optional accelerator. This commit does
not install CUDA, cuDF binaries, Python dependencies or GPU servers, and does
not change Cloudflare Workers (which cannot run CUDA). Keep the existing CPU/
SQL analytics path as the default, use cuDF only on compatible NVIDIA hardware
if representative benchmarks justify it, and validate null/date/groupby
semantic parity before publishing any output.

**Licenses and credit:** The two Auto Ontology skills are Apache-2.0;
`accelerated-computing-cudf` is marked CC-BY-4.0 AND Apache-2.0.
NVIDIA remains the author and copyright holder. Do not remove upstream
license/copyright notices. See the source repository's LICENSE and each
vendored `SKILL.md` for licensing details.

## Verification

Check that the three files below exist and that references/assets resolve:

```bash
test -f .agents/skills/nvidia-ontology-query/SKILL.md
test -f .agents/skills/nvidia-ontology-management/SKILL.md
test -f .agents/skills/accelerated-computing-cudf/SKILL.md
npx skills list -a codex
```

When verifying an import, compare each file with the exact upstream commit
`c24aea9a0b0bbe9bd16363682045fc9218b3cbef`, not moving `main`.

No package-lock update, runtime service binding, secrets, paid tier,
Cloudflare deployment trigger or GPU acceleration is introduced.
