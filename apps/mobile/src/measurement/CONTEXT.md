# First-party client delivery

[MeasurementQueue](MeasurementQueue.ts) validates client-owned events, enforces bounded buffering/retry and separates actor generations. [MeasurementHttpSender](MeasurementHttpSender.ts) resolves credentials only when delivering and sends solely to the supplied first-party API origin. Time, randomness, storage and network are injected boundaries. Tokens and raw account/install values never belong in event envelopes.

These modules are not installed in the app's feature/startup paths. An authority-aware host must supply current purpose eligibility, persisted storage, separately issued guest/account measurement identity and lifecycle revocation. Changing generation clears the local buffer; durable server deletion fences remain necessary for old queues and backup restores. Public Listing-view identity/timers remain separate.

The [shared dictionary](../../../../packages/contracts/src/schemas/measurement.ts) owns allowed names and payloads; [the specification](../../../../docs/prd/ops/85-launch-analytics-plan.md) owns intended semantics. Client calls cannot assert committed server outcomes. Core UI actions must never await queue flush.
