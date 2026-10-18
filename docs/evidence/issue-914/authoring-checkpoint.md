# Diagnostic authoring checkpoint

The pinned-scope domain regression at `60eed1b5` exposed five missing validations: unknown checks, measurement requirements, duplicate assessments, absent panel assessments and unqualified source history. The same tests pass after the domain change in `b7d59b63`.

Report authoring/review now uses current Session, capability, center qualification and explicit order assignment inside the owning transaction. Optimistic versions prevent silent draft overwrites. Finalization saves an immutable report/template snapshot and three durable per-locale PDF intents. Reader release does not imply a downloadable PDF exists. Corrections retain date/mileage/findings and original audience; withdrawal retains the released snapshot.

Evidence writes commit an exact immutable object intent before network storage. The image boundary validates declared versus decoded format, strips metadata by fresh WebP encoding, and limits input bytes/pixels. Object reads verify exact bytes, SHA and current authority again after storage I/O. No storage key or public/signed URL leaves the API. Replaced/explicitly abandoned evidence receives exact cleanup intent.

Verification:

- Domain and actual image/S3 boundary tests: 26 passed in `/tmp/carberk-diagnostic-evidence-unit-20261017.log`.
- API TypeScript and affected lint pass. Database generate/build succeeds with inert codegen URL, not a database connection or migration execution.
- Nineteen retained-schema/staging-control tests passed in `/tmp/carberk-diagnostic-profile-20261017.log`.
- `DiagnosticReports.e2e.spec.ts` prepares full HTTP/PostgreSQL/private-storage tests for concurrent draft edits, private release while PDFs are pending, current revocation, immutable corrections/withdrawal and sanitized protected evidence. Hosted execution is required; no local Docker or deployed acceptance occurred.

Still missing: durable write/cleanup leases and abandoned-upload maintenance; complete authoring/review/reader UI and five-view diagrams; stored PDF renderer/worker/readback; public-only reader/projection and neutral Results/detail actions; native/browser/deployed isolation and actual export proof. This checkpoint does not establish #914–916 completion or operational center approval.

Docs: internal-only report workflow, not applicable. Storage/image APIs use the installed AWS SDK v3 and sharp interfaces, verified by TypeScript and actual image/network-boundary tests; no dependency upgrade was made here. Dedicated diagnostic buckets remain unprovisioned and synthetic intake remains disabled by default.
