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
