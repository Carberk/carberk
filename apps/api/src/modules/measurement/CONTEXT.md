# First-party measurement boundary

This module owns validated measurement intake and the public post-commit emitter port. Source contexts own their facts. It is separate from Listing-view counters, diagnostics SDK intake and durable market knowledge.

[AcceptMeasurement](application/AcceptMeasurement.ts) applies the shared dictionary and server-owned purpose/population/origin policy. [The public ports](measurement.public.ts) require an atomic identity-generation/rights check with event-ID insertion. The current fake ledger proves the application contract; no durable ledger or identity adapter is composed yet. [The HTTP controller](presentation/MeasurementController.ts) is tested with the real public JWT guard but is not installed in AppModule. Collection is therefore unavailable and defaults closed.

Read [the measurement specification](../../../../../docs/prd/ops/85-launch-analytics-plan.md) before changing semantics. Account deletion/restore, scoped guest capability, raw retention and authoritative feature outboxes still require their durable adapters and deployed evidence. Do not treat fixture authority as real collection approval.
