# Issue 905 rights and guest erasure evidence

This checkpoint records software behavior only; it is not legal or deployment approval.

- Guest erasure is exposed through `POST /api/v1/measurement/erase-guest` with the scoped `mg_` capability. Invalid or missing credentials are rejected without revealing identity.
- `PrismaMeasurementStore.eraseGuest` deletes the hash-matched guest principal and cascades visits, raw records and staged outbox facts. It is safe when collection is disabled.
- Account deletion removes account principals and linked current guest visits; core account recovery does not restore measurement identities.
- Restore requires a fresh collector epoch; old principal maps are erased before serving.
- Existing focused evidence: `BootstrapMeasurement.spec.ts`, `MeasurementController.spec.ts`, `PrismaMeasurementStore.e2e.spec.ts`.

Remaining activation evidence is outside this software checkpoint: localized privacy notices, lawful-basis/transfer/retention matrix, rights-owner sign-off, and deployed restore/deletion replay.
