# Writing for people in VAOS

Our users may be founders, engineers, analysts or operators. They need a clear picture of **what the system knows, what it doesn't know and what they can safely do next**.

## Write the message a person needs

A useful status message answers three questions:

1. **What happened?** “We checked the public import data. No matching record was available.”
2. **What does that mean?** “We can't use this result to estimate carbon-frameset imports.”
3. **What can I do next?** “Check the source and reporting period, or retry the public-data scan.”

Don't put an internal reason code in place of an explanation. Keep the code for support and audit trails, but describe it in plain language.

## Keep operational truth intact

| System term | Plain-language explanation |
|---|---|
| HOLD | This step cannot proceed because the evidence, required input or authority is missing. |
| OBSERVED | A source supplied an in-scope record. It has not necessarily been independently checked. |
| UNVERIFIED_HEADLINE_CONTEXT | A news mention worth reading, not proof of a price, market share or product release. |
| SCENARIO_ONLY_NOT_FORECAST | A calculation using assumptions provided by a person. It does not predict actual sales. |
| BACKTESTED_INDICATOR_EXTRAPOLATION | A statistical projection of a public indicator that was compared with held-out history; it is not a forecast of VYNDI orders. |
| READ_ONLY | This feature can show information but cannot approve a purchase or change business records. |

**Never turn “not verified” into “verified” through copy changes.** Keep source dates, units, scope and provenance beside the number they support. If an input is missing, make that visible instead of filling it with a plausible value.

## Before and after examples

**Unhelpful:** “MARKET_SOURCE_UNAVAILABLE — HOLD.”

**Better:** “We couldn't reach the public data source. Your last saved results are unchanged. You can try the scan again. (Code: MARKET_SOURCE_UNAVAILABLE)”

**Unhelpful:** “Forecast qualified.”

**Better:** “The historical indicator passed a backtest. This is not a verified forecast of bicycle demand.”

**Unhelpful:** “Archived successfully — action authorized.”

**Better:** “A new research version was saved. This does not approve a purchase, financial decision or engineering release.”

## Interface and documentation conventions

- Use short section headings, descriptive buttons and sentence-case explanations.
- Write for someone seeing the screen for the first time, but don't hide technical details engineers need to diagnose a fault.
- Use consistent words: **saved research**, **public sources**, **assumptions**, **source date**, **needs verification**, **human approval**.
- Explain any abbreviation on first use: Business Continuity Planning (BCP), bill of materials (BOM), first-party source, or mean absolute error (MAE).
- Preserve accessibility labels, focus order and screen-reader status regions when changing copy.
- Show a next step for empty, failed and unverified states; never call an empty chart “zero demand.”
- Avoid sales language such as “fully autonomous,” “guaranteed,” “intelligent prediction” or “production-ready” unless a cited acceptance record supports the specific claim.
- Distinguish tests, deployed code, live source observation and independently reconciled operational evidence.

## Review checklist

Before merging a wording change, confirm that the reader can identify what was checked, whether the source is trustworthy, which data is illustrative, what is still missing and whether any action was actually taken. Confirm that error codes, audit records, routes and controls remain unchanged.

UI text is part of product behavior. Update relevant tests when wording changes, and qualify the change against the existing deployment and security gates.
