# Review Report Template

Lead with findings. Omit empty sections except the verdict and verification record.

## Findings

Order by severity.

`[P0|P1|P2] Title — path:line`

- Trigger and observable impact.
- Evidence and why existing tests or reports do not close it.
- Smallest safe recommendation.
- Required rerun/case ID and closure evidence.
- Approval dependency, if any.

## FPG Verdict

- Verdict: `ACHIEVED | CONDITIONALLY_ACHIEVED | NOT_ACHIEVED | BLOCKED`
- Target and frozen baseline.
- Passed exit scenarios.
- Missing or invalid exit scenarios.
- Why the current plan status is or is not valid.

## Acceptance Matrix

| Requirement / exit scenario | Case | Implementation | Current evidence | Result | Blocker |
| --- | --- | --- | --- | --- | --- |

Use only: `passed`, `failed`, `blocked`, `pending_approval`, `unimplemented`, `awaiting_verification`.

## Approval Decisions

| ID | Conflict | Affected cases | Options and impacts | Recommendation |
| --- | --- | --- | --- | --- |

Do not reinterpret silence as approval.

## Ordered Remediation

| Priority | Scope | Expected result | Regression/evidence required | Owner or approval |
| --- | --- | --- | --- | --- |

## Verification Record

List only commands actually executed in this review, their result, and artifact paths. State explicitly which commands were skipped and why. Separate memory or prior evidence from current evidence.

## Residual Risk

State untested environments, external dependencies, accepted lower-priority defects, and evidence expiry triggers.
