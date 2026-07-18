# Review Verdict Rules

The target project's `.fpg/references/execution-card.md` is authoritative for FPG status transitions and closeout. This reference adds only review-specific evidence and verdict rules.

## Required Closure Evidence

All items must pass for `ACHIEVED`:

1. The DoD and exit scenarios have not been silently relaxed.
2. Every required exit scenario maps to stable, executable cases and current evidence.
3. Required automatic checks pass.
4. Every real or production-like user flow required by the DoD passes.
5. Planned negative and recovery paths are covered.
6. Write-path tests use isolated, repeatable fixtures and deterministic cleanup.
7. Commands, baseline, counts, case IDs, and artifacts are mutually consistent.
8. No affected case remains `pending_approval`.
9. No P0 remains open; accepted lower-priority risk has an owner and disposition.
10. Sprint smoke report, plan evidence/status, `PROGRESS.md`, and the direct parent summary agree as required by the execution card.

## Evidence Strength

| Evidence | Proves | Does not prove alone |
| --- | --- | --- |
| Compile/build | Source is buildable | Business behavior or persistence correctness |
| Unit test | Local logic under test doubles | Real integration or end-to-end flow |
| Integration/API test | Contract and collaborating modules | Browser interaction or unexercised ownership boundaries |
| Browser assertion | User-visible flow and state | Unasserted database facts |
| Screenshot | Visual state at one moment | Correct navigation, mutation, cleanup, or lifecycle |
| Smoke evidence | One real or production-like scenario | Other required scenarios or repeatability without a durable case |

## Case Results

- `passed`: a current controlled run completed all assertions and cleanup.
- `failed`: a current assertion detected incorrect behavior.
- `blocked`: a controlled prerequisite is unavailable.
- `pending_approval`: expected behavior conflicts with an unapproved requirement change.
- `unimplemented`: no executable test exists.
- `awaiting_verification`: code appears fixed but has not passed the required current rerun.

Historical evidence expires after relevant code, configuration, schema, fixture, or expectation changes.
