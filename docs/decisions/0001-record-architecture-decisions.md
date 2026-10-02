# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

The program holds a reserve that backs real rental guarantees. Choices about who can move funds, how value is measured and what is gated must be traceable, because auditors, admins and the agents writing code all need to know why the program behaves as it does. The design was settled across several research notes and reviews before this repository existed.

## Decision

We record architecture decisions as short ADRs in `docs/decisions/`, numbered sequentially (`NNNN-title.md`), each with **Context**, **Decision** and **Consequences**.

- Any change to economic behaviour (fund movements, NAV, coverage, free capital, gates, caps, roles) requires a new ADR and a matching update to [`spec.md`](../spec.md) in the same PR.
- ADRs are not edited after acceptance except to change their status. A reversal is a new ADR that supersedes the old one.
- ADRs 0002–0006 condense the decisions locked before the build started.

## Consequences

- The spec stays the single source of business rules, and the ADRs explain why.
- Changing economic behaviour costs one short document, which is the intended friction.
