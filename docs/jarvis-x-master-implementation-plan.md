# JARVIS X document implementation and acceptance plan

The founder's VAOS JARVIS X document is the scope authority for 46 distinct requirements: technologies 01–32, learning L1–L4 and reliability R1–R10. The machine-readable register is `governance/jarvis-x/requirements.json`; its SHA-256 identifies the attached source document. Its acceptance descriptions are derived requirements, not quotations or proof of completion. Five priorities, six intelligence layers and candidate stack choices organize these requirements rather than adding 15 separate technologies. The source mentions seven analytical skills and 19 safety locks without enumerating them; their separate controlling specification must be reconciled before claiming those controls complete.

## Completion contract

`foundation` means supporting code exists; `synthetic_only` means research with invented inputs; `pending` means no qualified VAOS integration was established. No entry is marked production accepted. Acceptance requires exact source lineage, relevant passing checks and independent final-surface evidence. A tested mathematical function does not establish reliable business predictions, source accuracy or agent competence. Existing VYNDI OS models should be reused through approved contracts rather than duplicated in VAOS.

G2–G5 retain their existing acceptance scope. Passing G5 does not complete all 46 requirements, and the earlier suggested G6–G9 progression is not a full document crosswalk. Training, departmental audits, interface/ledger checks and software qualification can proceed while manufacturing release remains held. Material, tooling and release gaps apply to affected business forecasts or actions rather than every training exercise.

## Implementation sequence

| Workstream | Document IDs | Required outcome |
| --- | --- | --- |
| Evaluation and recovery | 08, 14, L1–L4, R8–R10 | Independent scoring, paired comparisons, authorized actual restore and protected release evidence |
| Knowledge and evidence | 01–07, R3, R5 | Hybrid retrieval and versioned graph with source-linked claim checks |
| Governed orchestration | 09–16, R2, R4 | Approved tool discovery, durable workflows, scoped collaboration and retained dissent |
| Quantitative scenarios | 17–24 | Reuse qualified business models, reconcile units/revisions and backtest outcomes |
| Voice and perception | 25–32 | Streaming/local wake, multilingual and visual acceptance with privacy/cost limits |
| Operational reliability | R1, R6, R7, R9, R10 | Complete tracing, anomaly response, bounded canaries and independently proven recovery |

These are dependency-oriented workstreams, not permission to provision paid services. Reuse existing storage and avoid additional Durable Object namespaces. Candidate Cloudflare retrieval, speech and solver technologies require a current cost/runtime assessment before deployment. No external paid provider is enabled by this plan.

## First implementation increment

`intelligence/jarvis-evaluation.mjs` computes binary Brier score, ten-bin expected calibration error, accuracy, nearest-rank p95 latency, overconfident errors and paired regressions/improvements. It retains paired regressions even if overall accuracy is unchanged. Review samples use bounded pseudonymous IDs and strict allowlisted fields; raw questions, answers, documents and credentials are rejected. Self-review, duplicate samples, inconsistent model pairs and a correct verdict with unsupported claims are rejected.

Use `node scripts/qualification/jarvis-paired-evaluation.mjs /absolute/path/to/review.json` for a local, size-bounded JSON review batch. The CLI emits aggregate diagnostics only; it does not call an AI, alter a prompt, read a business system, dispatch agents, write a database or save transcripts. Keep real review inputs in approved private storage and out of this public repository.

The accepted shape is `{mode,pairs}`. Mode is `SYNTHETIC_ONLY` or `DECLARED_REVIEW_RESULTS`. Each pair has `sampleId`, `reviewerId`, `baseline` and `candidate`. Each outcome has `subjectId`, confidence in [0,1], Boolean `correct`, integer `unsupportedClaims` and bounded `latencyMs`. Correct means the reviewer assessed the response as correct with no unsupported claims. Outcome probabilities refer to the declared correctness event, not engineering safety or supplier reliability.

All reports remain `DESCRIPTIVE_METRICS_ONLY`. Declaring a reviewer identity does not authenticate independent review. Zero calibration error does not establish calibrated production confidence. Synthetic examples cannot satisfy live gates. `autoPromotionAuthorized`, `reviewerIndependenceVerified`, `productionAccuracyCertified`, `confidenceCalibrationCertified` and `actionAuthorized` remain false. Calibration fitting, paired statistical significance, production shadow execution, autonomous regression generation and actual outcome ingestion are outside this increment.

## Evidence needed next

Obtain independently reviewed paired samples, immutable source/version references and actual source recovery evidence; connect the evaluator to an approved private outcome ledger. Do not invent historical outcomes to fill empty forecast tables or assign arbitrary BOM revisions to released baselines. Signed-in question, voice and latency acceptance remains separate from source tests and release builds.
