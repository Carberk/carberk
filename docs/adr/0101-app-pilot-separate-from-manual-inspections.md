# ADR-0101: The Ashgabat app pilot can precede manual inspections

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Supersedes**: ADR-0037's first-real-world-test sequencing only

## Context

ADR-0037 replaces the generic app beta with a first real-world trust pilot of 5-10 manual inspections. The founder later accepted a 20-user Ashgabat app pilot and, on 2026-10-14, approved its independence from the operationally gated inspection experiment. Its sequence needs a scoped replacement; trust/inspection remains the strategy.

## Decision

The 20-user Ashgabat app pilot may proceed when its hosting, legal, safety, core service and monitoring gates pass, without waiting for manual vehicle inspections. The separate 5-10-inspection trust experiment starts only when a qualified mechanic and local operational readiness exist. Neither experiment is represented as completed by preparing software or this record.

Preserve trust/inspection as the product strategy and all other ADR-0037 policies as amended by accepted decisions. No available inspection service, inspected-vehicle badge or vehicle-verification claim is implied by phone verification, moderation or this app pilot. ADR-0057's in-app inspection-demand deferral remains effective; this decision neither enables that prompt nor admits report-service expansion into analytics.

This decision does not authorize invitations, inspection operations, recruitment messages, paid resources or public promotion. Expansion from 20 to 50 users and Mary still follows its approved readiness/evidence gates.

## Consequences

### Positive

- Core app learning can proceed when safe without depending on mechanic availability.
- Operational inspection proof stays separate from app and monitoring proof.

### Negative / accepted costs

- The early app pilot alone does not validate the inspection strategy.
- Launch plans and inspection runbook sequencing need reconciliation before execution.

### Neutral

- Cars-only scope and existing inspection-demand deferral remain.

## Alternatives considered

- Require manual inspections before any app pilot. Rejected by the founder's accepted independent app-pilot sequence.
- Abandon the inspection experiment. Not selected; trust strategy remains.
- Restore the in-app inspection-demand prompt. Not selected; its owning scope requires a separate decision under ADR-0057.

## References

- [ADR-0037](0037-trust-inspection-competitive-wedge.md)
- [ADR-0057](0057-defer-the-in-app-inspection-demand-signal.md)
- [Monitoring parent #602](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/602)
- [Launch plan](../prd/ops/84-launch-plan.md)
- [Concierge runbook](../prd/ops/87-concierge-pilot-runbook.md)
