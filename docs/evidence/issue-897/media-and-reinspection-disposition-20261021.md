# Media and reinspection design disposition, 2026-10-21

Root disposition for #897 / #901 / #914 / PR #904. Published candidate tree is `f3b0cf81`, commit `46f9ab8a`. Hosted media RED was confirmed at `0101654d` and again at `46f9ab8a`. The design checkpoints below retain their `-x` assembly provenance. Root holds this docs checkpoint for the next bounded source/test batch. Their presence is not source approval or release evidence.

## Image disposal

Checkpoint `b5f45bf43e1365f2b8ffce60b5f3656fa808cdfe`, assembled as `82b18c6f`, adds the [image-disposal proposal](../issue-901/full-v3-image-disposal-source-design-20261021.md).

The ordinary-path plan identifies the missing journal tables, upload edges, business publication/contact/audit guards, Sales removal, exact object intent and repeatable reset. Any source slice must preserve existing ownership/collision/current-candidate checks, the 128-record/2048-event caps and v1/v2 behavior. An allowed stranded-claim recovery transition must match the actual existing worker transition and retain ownership and lifecycle checks.

The plan does not establish a new producer fence. A refused presign can create placeholder objects before its database insert, leaving unknown keys. ADR-0088 explicitly accepts those empty, authority-free placeholders as a cost of interrupted initialization and excludes general orphan sweeping. The recorded conditional manifest still uses the accepted initialization-before-insert order, conditional `If-Match` writes, exact deletion and HEAD verification. Operator conversion uses the existing pause/drain procedure; it does not establish an `ISSUING` protocol for this release slice.

The prior note's statement that unknown orphan keys can be cleaned without listing is incorrect. No exact-key cleanup exists for keys that were never recorded, and no bucket listing is authorized. Its MinIO conditional-delete conclusion was incomplete, but no conditional DELETE is needed here. Keep the configured provider behavior UNKNOWN where it has not been proven. ADR-0088 already requires conditional PUT fencing and ordinary exact-manifest delete/HEAD proof; SDK fields alone cannot establish provider behavior.

An independent read-only design audit rejected the proposed `ISSUING` plus expiry amendment as a release prerequisite. A PUT admitted before expiry can pause and complete after reset; a clock margin does not fence that interleaving. The audit instead directs hosted tests around recorded uploads: pause a real generator PUT across retirement/reset, race worker recovery with reset, and retry cleanup after disposal. Those tests must exercise the existing recovery branches and keep credential forwarding narrow. The design audit did not approve source or release readiness. Keep initialization-before-record, conditional `If-Match` recorded writes and exact delete/HEAD. The remaining hosted races are recorded generator behavior, both recovery branches, reset retry, foreign preservation and digest checks.

The designer task is terminal. Opus media task `429` is cooling-down FAILED. Existing isolated Sol medium resume `release897-v3-media-ordinary-source-sol-20261021-r2` owns scripts source. Root's bounded next step remains source/test work against the inspected hosted RED, preserving the accepted recorded-object contract. No new architecture is approved.

## Diagnostic reinspection

Checkpoint `d5f4c26ed7a468ac678a70587f5f98fcd381790d`, assembled as `644f5901`, adds the [reinspection proposal](diagnostic-reinspection-contract-20261021.md). Existing domain behavior requires a different physical order and fresh observations. The persisted route is missing, and same-order database and evidence-walk assumptions block it.

The authorized test-only slice ran at the existing diagnostics HTTP/PostgreSQL/storage boundary. Use a finalized public predecessor and a new physically authorized order with matching VIN, the same Listing/commissioner, fresh consent, later observations and its own pinned template. Test a new draft with empty findings, ordinary save/review/release, immutable predecessor history, evidence isolation and current public availability. Existing correction/template assertions stay intact. Its hosted RED is now observed. Root owns the next bounded source step; the proposal does not become approved architecture.

The new route and request shape in the proposal are a bounded interface choice for this test slice. These choices do not decide manual or changed-identity continuity, transfer between public commissioners, predecessor-staff successor visibility, localized reader labels or the deployed lineage. All remain explicit requirements/decisions before final acceptance; the narrow positive test must not silently exclude them from the release.

The [hosted checkpoint](checkpoint-46f9ab8a-20261021.md) records actual RED, not a prediction: `DiagnosticReports.e2e.spec.ts:308` returns 404 instead of 201 after existing HTTP preparation. Eleven existing cases pass; the new case fails. Actor allocation is now mapping D, with public independent-reviewer reception/templates/reviewer grants and current center qualifications, separate from the technician author. Private X1 stays reception-steward and private audited self-review is unchanged. Coordinator grants, no self-grants or temporary management delegation; reception may self-assign order reviewer capability. Each alias is denied outside its explicit grants. This changes acceptance allocation only. Complete diagnostics fit remains unproven; qualification/bootstrap provenance and center/bootstrap/runtime/disposal architecture remain UNAPPROVED.

## Delivery state

The Opus media task has failed and the designer is terminal; the existing isolated Sol medium media resume owns scripts source. Root alone inspects, assembles and batches pushes. No new reviewers or CI reruns are requested. Root's final independent Standards and Spec reviewers are Sol high on one complete fixed SHA and have not yet been dispatched.

Hosted source receipt `bf2dbc57` remains historical GREEN. The newer media test candidate is not certified by it. Operational v3 activation, complete graph/race coverage, native/browser/deployed/ops acceptance and restoration, exact signed Android artifact and disclosures remain open. Hosted API receipt `46f9ab8a` records media journal ownership failure and exact-reset exit 1, plus reinspection 404; the exact reset cause is UNKNOWN. Preserve the 26 earlier full-v3 passing cases and 11 existing diagnostics passing cases. Preserve all founder-owned release gates.
