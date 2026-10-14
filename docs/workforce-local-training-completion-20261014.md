# Local workforce training completion — 14 October 2026

Scope: the defined deterministic prelaunch teaching exercises for sixteen roles. No paid branch or hosted provisioning is required. This is not a certificate of general employee competence or operational commissioning.

## Completed local acceptance

The loopback-only HTTP harness uses the existing VAOS login and hardened session-verification code. Its test generates random credentials and a separate signing key only in the test process; no real account credential is used, exported or changed. No extra human reviewer account is required for founder approval. A negative non-founder fixture is used solely to verify access denial, not as an independent reviewer.

For each of all sixteen role identities, normal and seeded-defect events run through authenticated POST requests, invoke the merged teaching evaluator and persist output in isolated PostgreSQL. Each of the 32 observed results matches the predetermined answer key. Duplicate events replay the saved output, while conflicting event inputs return 409. The report GET endpoint returns the stored 32 outputs.

After closing the HTTP server, the test dumps the PGlite database, closes it, restores a fresh instance, starts another loopback server, signs in again and compares the full authenticated report against the original. Missing sessions and expired tokens return 401; the signed-in non-founder fixture returns 403. Foreign origins and missing training headers return 403. Extra production input and unknown roles return 422. A production action route returns 404. Only 127.0.0.1 is bound; this harness has no production Worker import or production service binding.

Final aggregate npm test passed: 1,516 tests across eleven suites, plus web verification, syntax checks and the 32-exercise CLI. Diff whitespace checks passed. The suite is included in aggregate npm test. Source: platform/qualification/workforce-local-login-training.test.mjs and workforce-local-training-server.mjs. Run npm run test:workforce-local-login for a focused rerun.

## Verdict and boundaries

LOCAL_FOUNDATIONAL_TRAINING_EXERCISES: PASS for all sixteen defined role exercise pairs.
LOCAL_AUTHENTICATED_TRIGGER_OUTPUT_READBACK: PASS.
LOCAL_PGLITE_RESTORE_READBACK: PASS.
HOSTED_INTEGRATION: NOT_RUN.
BROAD_DEPARTMENTAL_COMPETENCE: NOT_ESTABLISHED.
LIVE_PROJECT_OPERATION: NOT_RUN; project records are not expected yet.
PRODUCTION_QUALIFICATION_FLAGS: UNCHANGED.

Founder Shyam is the acceptance/approval authority per his explicit session instruction. Technical negative tests and stored evidence are retained; an additional external reviewer is not imposed as a prerequisite for this local release. A fixture checker or automated golden-answer check must not be described as a real independent employee review.

These exercises are deterministic software routines, not LLM employees learning from practice. Completing them validates the defined software paths and predefined outputs. It does not train model weights, qualify all 107 departmental job executors, establish real VYNDI record-schema authority, or remove engineering-release gates. PGlite restore is not hosted Supabase pg_dump/G2b recovery. Loopback fixture login is not user-browser/device acceptance. Real TLS, hosted auth, deployed automation and broader role tasks remain separate future acceptance.
