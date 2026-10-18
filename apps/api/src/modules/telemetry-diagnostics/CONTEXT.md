# Diagnostic telemetry

This context owns the controlled synthetic diagnostic relay. It is separate from vehicle Diagnostic reports and product measurement. `POST /api/v1/diagnostic-telemetry/events` requires an exact admitted synthetic Session and current elevated `analytics.investigate` authority. Admission expires within one day, matches the exact candidate release/build and permits only declared artifact filenames. Production collection is refused by configuration. The module must be composed by the API root; its flag defaults closed.

The shared event builder constructs a new minimal event before transport. SDK messages, user/context, requests, headers, breadcrumbs, variables, raw paths and attachments never enter it. The relay forwards only the strict event to a configured HTTPS GlitchTip store endpoint, without browser authorization, Session or client IP. It bounds body/receipt size, concurrency, request time and per-process synthetic event rate. It has no durable retry queue. Collector failures remain separate from core API error-rate denominators.

This provides a synthetic JS/server transport path. It does not establish actual GlitchTip receipt, symbolication, collector storage/resource behavior or native crash delivery. Native envelopes bypass JavaScript filtering and remain inadmissible. Real collection additionally requires region/purpose admission, durable deletion/late-envelope fences and selective collector/cache/backup deletion evidence. An environment flag cannot substitute for those controls.

## Start here

- [Strict wire contract and builder](../../../../../packages/contracts/src/schemas/diagnostic-telemetry.ts)
- [Admission and bounded relay](application/SyntheticDiagnosticRelay.ts), [real HTTP transport tests](application/SyntheticDiagnosticRelay.spec.ts)
- [Collector transport](infrastructure/GlitchTipDiagnosticTransport.ts) and [configuration](infrastructure/diagnosticTelemetryConfig.ts)
- [HTTP boundary](presentation/TelemetryDiagnosticsController.ts) and [module composition](telemetry-diagnostics.module.ts)
- [Mobile synthetic SDK bridge](../../../../mobile/src/diagnostic-telemetry/CONTEXT.md)
