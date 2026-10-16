# REA local reverse-engineering evidence (developer workflow)

**Scope:** VAOS engineering agent research and prototype feature parity. This is a documented **manual handoff**, not a production REA integration. It does not grant JARVIS, the 16 digital employees, Cloudflare Workers, browser clients, or orchestration services direct access to Windows programs or REA's execution surfaces.

## Available tooling

- Upstream: [morluto/rea](https://github.com/morluto/rea), npm package `rea-agents@6.5.0`.
- Windows operator installed the REA workflow skill under `%USERPROFILE%\.agents\skills\reverse-engineer-anything`.
- Skill installation alone does not confirm a Codex MCP registration or a successfully analyzed target.
- REA supports static JS/Electron application inspection without launching a selected application. Native Ghidra inspection on Windows is experimental and requires separate tools/qualification.

## Local 5P engineering workflow

1. **Plan:** Select exactly one owned or authorized target and a specific feature/behavior question. Prefer direct source review where available. Confirm legal/third-party licensing.
2. **Prepare:** Operator checks REA skill `npx rea-agents doctor --skill --json`. For optional Codex MCP access, use `npx rea-agents setup --client codex` with reviewed approval and verify `npx rea-agents doctor --client codex --json`.
3. **Proceed:** Run an explicit, local, static analysis. ARKUS provides an independent opt-in helper, `python rea_review.py --target "C:\\path\\to\\authorized\\app" --approve`, storing output locally under gitignored `work/rea-evidence/`.
4. **Perform:** Inspect and redact findings, verify paths and supporting evidence, and write an independent feature specification. Use separately authored code and tests; never copy restricted-license code.
5. **Persist:** Attach only sanitized feature descriptions and approved evidence links to an engineering work item. Include target scope, tool version, operation, operator approval, findings, uncertainties, validation status and decisions. Retain raw outputs locally under operator control; do not store them in VAOS, source control, prompts or business data automatically.

## Authority and isolation

- **L0/L1:** An engineering agent may read *sanitized* research reports as untrusted external evidence.
- **L2:** It may recommend a feature or test based on findings, with explicit provenance and confidence.
- **L3:** It may draft an implementation for normal review.
- **L4/L5:** No autonomous REA process launch, executable execution, live debugging, arbitrary filesystem access, shell command, or source rewrite is authorized by this document.
- **Data boundary:** REA output is lower-trust tool data, not system instructions or VEDM engineering authority. Apply review, sanitization, validation, audit and approval gates before reuse.
- **Deployment boundary:** VAOS Cloudflare Workers cannot directly invoke the user's Windows-installed REA; local execution must remain outside the Workers request path. Do not bridge localhost CLI access into an internet-exposed HTTP endpoint.
- **Cost boundary:** Use REA's free static capabilities first. Do not install paid decompilers or enable paid analysis APIs without separate approval.

## Acceptance checklist

- Confirm REA skill readiness and optional Codex MCP readiness on the **actual Windows host**.
- On an approved JS/Electron directory, capture a static analysis result with zero runtime target execution.
- Inspect and redact evidence; verify the resulting feature summary against source or observed behavior.
- Implement with normal PR review, tests and governance. ARKUS helper tests or GitHub CI do not establish real hardware/Windows REA acceptance.

**Current status:** REA user-level skill installation is reported complete. The local static analysis helper is proposed in ARKUS; VAOS live REA tool connectivity is intentionally **not active** pending targeted design and local qualification.
