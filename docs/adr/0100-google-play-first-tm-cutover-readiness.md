# ADR-0100: Google Play approval and readiness gate the TM production cutover

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Supersedes**: ADR-0039's both-store cutover trigger and owned/racked application-host requirement only

## Context

The founder selected Railway for the first Google Play reviewer submission, followed by diagnostics/product measurement work on Railway and later TurkmenTelecom VPS production. ADR-0039 requires both stores to approve before cutover. The accepted Android-first plan needs a scoped replacement; its other requirements and later amendments remain effective.

## Decision

Google Play approval replaces both-store approval as the store condition for TM production cutover. TurkmenTelecom VPS is the selected TM application-host direction; provider-provisioned, tested TM hosting replaces the requirement to own and rack the application servers. This does not replace physical SMS/Proxy PC equipment or domestic connectivity readiness with a VPS purchase. Approval is necessary and insufficient: core flow verification, actual TM hosting/storage/network and trusted-handler readiness, applicable data/egress/disclosure requirements, monitoring/alert receipt and backup/restore evidence must also pass. iOS approval is not a prerequisite for this Android-first cutover.

The first Google Play reviewer submission remains Railway-only without GlitchTip, admin analytics or TM VPS. Monitoring and product measurement are developed and tested on Railway afterward using synthetic/reviewer/test data. TM real users remain behind cutover and core service readiness; this decision does not authorize real-user collection on Railway, spending, vendor signup, provisioning, deployment, cutover, invitations or store submission.

Retain ADR-0005 TM-local data placement, permitted isolation/egress, access control and recovery constraints; verify that the quoted VPS/storage/backup/network design satisfies them before provisioning or cutover. Exact provider shape and resource sizing remain evidence work, not a new blanket topology exemption.

All other ADR-0039 policies and their accepted amendments remain effective, including production promotion controls and non-TM staging. Implementation readiness is separate from real-user invitation and cutover readiness.

## Consequences

### Positive

- Android-first readiness no longer waits for an unrelated iOS approval.
- Reviewer, implementation, cutover and real-user evidence stay distinct.

### Negative / accepted costs

- The team must prove TM readiness and diagnostics in the actual native candidate; Google Play approval cannot substitute for them.
- Canonical hosting/runbooks/release gates need reconciliation before execution.

### Neutral

- No production infrastructure or store configuration changes through this document.

## Alternatives considered

- Keep both-store approval. Rejected by the founder's accepted Android-first direction.
- Cut over immediately on Google Play approval. Rejected because infrastructure/recovery/network and data readiness remain prerequisites.
- Admit TM real users on Railway through this decision. Not selected; existing real-user hosting gates remain.

## References

- [ADR-0039](0039-phased-cloud-first-hosting.md)
- [Monitoring parent #602](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/602)
- [Hosting decision #604](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/604)
- [Release gates #608](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/608)
- [Diagnostics specification](../prd/ops/81-monitoring-alarms.md)
