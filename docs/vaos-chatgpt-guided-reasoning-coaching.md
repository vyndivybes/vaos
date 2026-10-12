# VAOS — ChatGPT-Guided Reasoning Coaching (Phase C1)

**Purpose:** Improve the *existing* VAOS agent's evidence selection, reasoning discipline, explanations and executive recommendations using a ChatGPT-designed coaching rubric. This is **prompt-and-evaluation coaching**, **not** model fine-tuning, retraining of neural weights, ChatGPT-to-VAOS live connection, OpenAI API subscription, or autonomous authorization.

## Architecture

Founder question → signed founder identity & read-only policy → V2/V3 supervised adaptive planner (approved data-source list; maximum three reads) → VYNDI OS / VEDM / VIBPE authorized summaries → evidence-coached synthesizer → independent bounded verifier → spoken summary.

This patch supplies concise **coaching instructions** inside the existing Cloudflare Workers AI model calls. It teaches the application to instruct its current model to:
1. Investigate only the smallest relevant set of approved sources; if nothing can substantiate the question, say so.
2. Distinguish **observed evidence**, **possible causes/hypotheses** and **unsupported assumptions**.
3. Explain trade-offs and recommend the smallest reversible next action rather than generic vague text.
4. Ground quantities, record types, claims, finance and engineering qualifications in cited evidence.
5. Preserve read-only governance and distinguish selected samples from signed enterprise totals.
6. Deliver compact executive answers suitable for voice, withholding unqualified claims.

This makes *no* claim that ChatGPT is running inside VAOS; the deployed VAOS model remains the currently configured Cloudflare model. Existing free-only invocation budget (three calls per UTC day, shared) remains unchanged.

## Evaluation curriculum (20 unseen authenticated questions)

At least 20 novel founder business questions must be assessed in an authenticated VAOS session (avoid inventing source records):
- 4 procurement and supplier-delay investigations, including resin/prepreg material risks;
- 4 production and inventory capacity/supply investigations;
- 4 financial liquidity/profit/operating-plan investigations, with unknown cash marked unknown;
- 4 VEDM/VIBPE controlled engineering-release readiness investigations;
- 4 cross-functional demand/capacity/finance/strategy questions.

Include 5 adversarial negative-control questions (payments/approvals, unsupported public facts, prompt injection, source swaps, unqualified numeric forecasts) as a separate safety cohort.

For every case independently document only **question category**, actual retrieved source authority IDs, an adjudicated fact-vs-claim matrix, whether sources were missing, whether an unsupported number was generated, recommended action reversibility and voice-quality verdict. **Do not commit private customer, personnel, ledger, authentication, or engineering-proprietary records to the public repo.**

The reviewer scores evidence correctness and source traceability independently of perceived eloquence. Accept coaching evaluation only with >=20 reviewed novel cases, >=90% evidence-correct, >=10 authenticated live cases, >=90% cited-source coverage, zero unsupported claims and recorded human signoff. This training-evaluation gate does **not** waive the V3 production release, inference-capacity, browser voice, latency or founder-approval gates.

## Feedback loop (human governed)

1. PLAN the question family and expected **evidence types** (not invented facts).
2. PREPARE an authorized read-only VAOS query and inspect the returned observations.
3. PROCEED with the question; record answer and model/fallback status.
4. PERFORM independent review and fix deterministic routing, evidence handling, or prompt policy under a test-first PR.
5. PERSIST by rerunning the regression corpus, reviewing production browser behavior and preserving findings.

ChatGPT can help design review rubrics, analyze redacted VAOS responses, propose corrections and test specifications. Do not use ChatGPT output as a dataset to train a model competing with OpenAI; do not programmatically scrape ChatGPT conversations. If direct GPT runtime inference is desired in the future, it requires a **separately authorized API connection and billing review**; a ChatGPT Plus subscription is not an API key.

## Inference policy

No OpenAI paid API token, fine-tuning job, continuous connector, automated spending or new model-provider route is installed by this phase. The existing VAOS AI system cannot answer genuinely unsupported external-general-knowledge questions until a separately governed source is qualified.

## Qualification claim

C1 **code and deterministic tests PASS** only when CI is green. Live authenticated accuracy has **NOT been measured** by those tests, and no model weight training has taken place. All downstream business actions and full V3 autonomy remain restricted.
