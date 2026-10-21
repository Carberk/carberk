# Media and reinspection design disposition, 2026-10-21

Root disposition for #897 / #901 / #914 / PR #904. Published candidate remains `0101654de40ecaceae0254bb5ded01591db7968e`. The following design notes are assembled locally with `-x` provenance and held for the next source/test push. Their presence is not source approval or release evidence.

## Image disposal

Checkpoint `b5f45bf43e1365f2b8ffce60b5f3656fa808cdfe`, assembled as `82b18c6f`, adds the [image-disposal proposal](../issue-901/full-v3-image-disposal-source-design-20261021.md).

The ordinary-path plan identifies the missing journal tables, upload edges, business publication/contact/audit guards, Sales removal, exact object intent and repeatable reset. Any source slice must preserve existing ownership/collision/current-candidate checks, the 128-record/2048-event caps and v1/v2 behavior. An allowed stranded-claim recovery transition must match the actual existing worker transition and retain ownership and lifecycle checks.

The plan does not establish a new producer fence. A refused presign can create placeholder objects before its database insert, leaving unknown keys. ADR-0088 explicitly accepts those empty, authority-free placeholders as a cost of interrupted initialization and excludes general orphan sweeping. The recorded conditional manifest still uses the accepted initialization-before-insert order, conditional `If-Match` writes, exact deletion and HEAD verification. A late `IfNoneMatch` operator conversion remains an operational drain concern, not a reason to invent an unproven `ISSUING` protocol in this release slice.

The prior note's statement that unknown orphan keys can be cleaned without listing is incorrect. No exact-key cleanup exists for keys that were never recorded, and no bucket listing is authorized. Its MinIO conditional-delete conclusion was incomplete, but no conditional DELETE is needed here. Keep the configured provider behavior UNKNOWN where it has not been proven. ADR-0088 already requires conditional PUT fencing and ordinary exact-manifest delete/HEAD proof; SDK fields alone cannot establish provider behavior.

An independent read-only design audit rejected the proposed `ISSUING` plus expiry amendment as a release prerequisite. A PUT admitted before expiry can pause and complete after reset; a clock margin does not fence that interleaving. The audit instead directs hosted tests around recorded uploads: pause a real generator PUT across retirement/reset, race worker recovery with reset, and retry cleanup after disposal. Those tests must exercise the existing recovery branches and keep credential forwarding narrow. The design audit did not approve source or release readiness.

Follow-up `release897-media-producer-fence-design-20261021-r2` owns a concrete durable-intent, unfinished-producer and reset/worker fence proposal in an isolated checkout. It must preserve authority through the actual transport boundary and distinguish disposable CI credentials from explicitly configured deployed credentials. It changes one design note only. No media source writer is authorized before the actual hosted RED is inspected.

## Diagnostic reinspection

Checkpoint `d5f4c26ed7a468ac678a70587f5f98fcd381790d`, assembled as `644f5901`, adds the [reinspection proposal](diagnostic-reinspection-contract-20261021.md). Existing domain behavior requires a different physical order and fresh observations. The persisted route is missing, and same-order database and evidence-walk assumptions block it.

Authorize a test-only slice at the existing diagnostics HTTP/PostgreSQL/storage boundary. Use a finalized public predecessor and a new physically authorized order with matching VIN, the same Listing/commissioner, fresh consent, later observations and its own pinned template. Test a new draft with empty findings, ordinary save/review/release, immutable predecessor history, evidence isolation and current public availability. Existing correction/template assertions stay intact. No production schema or route implementation is authorized before its hosted RED.

The new route and request shape in the proposal are a bounded interface choice for this test slice. They do not decide manual or changed-identity continuity, transfer between public commissioners, predecessor-staff successor visibility, localized reader labels or the deployed lineage. All remain explicit requirements/decisions before final acceptance; the narrow positive test must not silently exclude them from the release.

Task `release897-diagnostic-reinspection-http-red-20261021-r1` owns that test and its evidence note. It does not edit the full-v3 suite, run local services or wait for CI. Actor mapping, qualification/bootstrap provenance and complete diagnostics capacity remain unresolved. Record estimates below 128 are lower bounds, not a demonstrated fit.

## Delivery state

Both active tasks use Opus 5.5 at medium effort in isolated host-created worktrees. Root alone inspects, assembles and batches pushes. No new reviewers or CI reruns are requested. Final independent Standards and Spec reviewers remain Sol 6.1 at high effort on one complete fixed SHA.

Hosted source receipt `bf2dbc57` remains historical GREEN. The newer media test candidate is not certified by it. Operational v3 activation, complete graph/race coverage, native/browser/deployed/ops acceptance and restoration, exact signed Android artifact and disclosures remain open. Preserve all founder-owned release gates.
