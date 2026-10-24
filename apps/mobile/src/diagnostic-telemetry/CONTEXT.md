# Synthetic diagnostic capture

This module prepares explicit controlled JS diagnostic capture through the first-party relay. It does not install or initialize a native SDK, attach global error listeners or compose itself into the app. `SyntheticDiagnosticCapture` defaults closed and requires short-lived current synthetic Session admission with matching generation before and after bounded HTTP delivery. Reset aborts old delivery; credentials stay outside event bodies. Offline failures drop this synthetic attempt without raw disk caching or UI failure.

`syntheticSdkAdapter` supplies a JS callback bridge and independently disables native initialization, NDK/tombstones, automatic integrations, logs, sessions, performance, replay, screenshots and hierarchy. Its callback always returns null to the SDK after passing the minimized event to the first-party sender, preventing SDK transport/cache adoption of the original event. Exact native SDK installation/build compatibility and native filtering remain unproven. This bridge does not claim offline native crash recovery or symbolication.

## Start here

- [Synthetic capture and reset](SyntheticDiagnosticCapture.ts)
- [SDK callback bridge](syntheticSdkAdapter.ts)
- [Real HTTP/MSW behavior](SyntheticDiagnosticCapture.spec.ts)
- [Shared minimized event builder](../../../../packages/contracts/src/schemas/diagnostic-telemetry.ts)
- [First-party relay boundary](../../../api/src/modules/telemetry-diagnostics/CONTEXT.md)
- [Native evidence gaps](../../../../docs/evidence/issue-919/native-diagnostics-research.md)

## Native source checkpoint

`modules/native-diagnostic-decoder` contains a pure Android API 31+ tombstone wire decoder, a dormant real `ApplicationExitInfo` platform reader with bounded selection/minimization, and authored Kotlin adversarial tests. Its internal Android factory explicitly reports unavailable because protected build and current actor authority are not composed. It is not registered or activated. The decoder only emits crashing-thread relative PCs plus aliases and verified ELF build IDs from an actual protected manifest. The strict native contract lives in `packages/contracts/src/schemas/native-diagnostic-telemetry.ts`; the existing JavaScript event schema remains unchanged. The dormant native source also contains a strict minimized one-slot codec, bounded storage with an Android private no-backup adapter, and a coordinator that serializes local lifecycle invalidation, cache commit and readout. Protected host authority and lifecycle wiring, durable epoch advancement, cache-to-network delivery, server/collector erasure, symbolication and runtime evidence remain later integration work. Internal fixture authority is not production proof; failed erasure closes the owner and requires the missing durable lifecycle fence across restart. Sentry remains absent and unqualified.
