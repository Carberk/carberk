# #914 consumed private-link worker erasure test slice

This checkpoint adds one fresh test-only acceptance case in `DiagnosticConsumedPrivateLinkErasure.e2e.spec.ts`. It creates A and B through HTTP with the same synthetic commissioner and distinct manual chassis material. A's declared identity rights end at `2026-10-21T12:05:00.000Z`; B remains valid through the existing December right. The case stages, uploads and captures both materials, releases A, observes A's three pending PDF intents, issues and consumes one comparative proof into B's empty draft, and proves exact retry plus an ordinary B finding write.

Before invoking `DiagnosticArtifactWorker.cleanup()` the same bounded Node/tsx subprocess verifies the injected per-pool database URL and `current_database()`, rejects the base database, requires hosted disposable PostgreSQL and local MinIO with the `diagnostic-test-private` bucket, and requires an explicit serial no-HTTP/no-processor premise. It reads every row without filters from `diagnosticReportRecord`, `diagnosticEvidence`, `diagnosticPdfArtifact`, `diagnosticIdentityEvidence`, `diagnosticIdentityProvenance`, and `diagnosticContinuityProof`, then compares those rows to the HTTP-created manifest. Any foreign, missing, or changed row refuses before mutation. The subprocess invokes the production worker once at the exact expiry.

The post-cleanup assertions require the consumed proof to be deleted, A structured payload to be cleared with generation incremented, A's provenance row to be retired and its exact object to return 404, and B's evidence, provenance, bytes, reports, PDFs, retry, finding write, and audit cardinality to remain intact. Restricted reads return private/no-store `DIAGNOSTIC_NO_ACCESS` at the boundary while B reads continue to work. The test has no SQL rights shortening, seeded proof/report/pin/consumption, worker private-method call, alternate database retry, or production change.

Offline verification on this writer branch:

- `pnpm --filter @auto-tm/contracts build` passed with inert `DATABASE_URL`.
- `pnpm --filter @auto-tm/db build` passed with inert `DATABASE_URL`.
- `pnpm --filter @auto-tm/api exec tsc --noEmit` passed after those package builds.
- Focused ESLint passed for the new spec.
- `pnpm --filter @auto-tm/api exec vitest list src/modules/diagnostics/presentation/DiagnosticConsumedPrivateLinkErasure.e2e.spec.ts` listed one test. No runtime test was executed. The ordinary Vitest collection cannot run without the hosted database/Redis/MinIO setup; hosted execution is owned by Root.

No hosted runtime result is claimed here. If the exclusive-pool or manifest prerequisite is unavailable, the test fails closed before worker mutation and the result is missing acceptance evidence, not product RED.
