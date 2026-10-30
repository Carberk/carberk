# Hosting readiness evidence assessment

Prepared 2026-10-18. No new provider provisioning, paid operation, staging mutation, real-user collection, cutover or store submission occurred.

## Prepared software

The worker's `operations:readiness <packet.json>` command evaluates a bounded, strictly validated receipt packet and emits criterion-level JSON with English, Russian and Turkmen labels. The result always states `activationAuthorized: false`. A complete packet would establish only consistency of the supplied assertions. The command cannot authenticate a vendor invoice, actual restoration, alert receipt or native crash.

Phases remain distinct under ADR-0100. The first Railway Google Play reviewer candidate requires diagnostics, analytics scorecard and TM serving to remain disabled; its readiness assessment does not invent a GlitchTip or native diagnostics prerequisite. Later Railway diagnostics testing needs independent monitoring/native/retention evidence. TM real serving additionally requires Google Play approval, actual provider topology/storage/backups/network, trusted-handler, physical SMS equipment and data-placement/egress/disclosure evidence. iOS store approval is not reintroduced as a TM prerequisite.

The assessor checks candidate/runtime receipt freshness and identity; actual inclusive billing projections with 80% warnings; matching database/media recovery checkpoints; checksum/schema/core-journey verification; 24-hour maximum core loss; recovery through safe traffic reopening within four staffed hours; deletion replay order and live fences; erased-record and retired-object denial; and telemetry exclusion from core backups. Existing restoration tooling and runbook remain the operators' source procedures. The assessor never executes restoration.

The prior issue-280 drill was verified on 2026-09-05. Its historical success remains valid history, but it is older than the current 30-day restore-evidence requirement and is not a current campaign receipt.

## Focused verification

- Four behavior tests pass. They cover first-reviewer phase separation, explicit missing evidence, stale historical drills, inconsistent database/media snapshots, staffed recovery across a weekend, late deletion replay, telemetry leakage into core backups, currency/scope mismatch and activation leakage.
- Worker typecheck and affected lint passed.
- Worker build passed. The built CLI emitted five missing criteria and a TM-not-applicable criterion for an explicitly synthetic empty Railway-diagnostics receipt packet, with `evidenceComplete: false` and no activation authorization. The node entrypoint uses exit 2 for incomplete evidence and exit 1 for invalid input. pnpm reports a failed lifecycle for either nonzero result.

## Current missing evidence

Actual fresh inclusive Railway billing/projection and measured resource limits; a current consistent isolated DB/media recovery drill with deletion replay; independent watchdog death and collector outage in deployment; authorized alert receipt; native minimization/cache deletion/symbolication; resource saturation isolation; actual TLS/disk probes; and all TM provider/hardware/network/handler facts remain unproven. The software and successful fixture tests do not close #919 or #920 by themselves.

## Current measured runtime evidence

The repository retains `docs/evidence/issue-920/railway-runtime-20261018.json`, a sanitized read-only Railway query for 2026-10-18. It describes old-main staging and production environments, not this campaign candidate. Samples are idle 300-second metrics and do not prove load headroom, saturation isolation, inclusive billing, restore consistency, alert receipt or final resource limits. The separate usage readback records USD 13.8313 current project usage for the provider billing period; it excludes no inferred forecast and is not spending authorization. Workspace usage includes other projects and is excluded from Carberk billing claims.
