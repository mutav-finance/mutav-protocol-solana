# Security reviews

Reports of the reviews and audits of this repository, newest first. Every review is dated and names the commit it covered. Internal reviews are not independent audits. The review cycle and status of each step are in [`docs/security/reviews-and-audits.md`](../security/reviews-and-audits.md).

A report is published here only after its fixes land, so each one ships with the status of every finding.

| Date | Review | Commit covered | Status |
|---|---|---|---|
| 2026-10-29 | [Internal security audit #2](2026-10-internal-audit-2.md) (four finders: program logic, refactor equivalence, app signing, scripts and CI) | Program and client `46ca747..833c114` (deployed `v1.0.0-devnet`); app, scripts and CI `46ca747..893f3a9` | Draft: findings under review; fixes pending. 0 Critical, 0 High, 6 Medium, 15 Low, 9 Informational. |
| 2026-10-11 | Internal security audit #1 (Wave 1: five finders plus verifiers) | `46ca747` | Done; fixes in #51, #52, #54, #58. #55 and #56 open; the AV-1 and AV-2 reversals deferred to the first upgrade. No standalone report. |
| 2026-10-09 to 2026-10-10 | Pre-devnet adversarial review (55 findings) | `f30664a` | Report in review: #94 |
