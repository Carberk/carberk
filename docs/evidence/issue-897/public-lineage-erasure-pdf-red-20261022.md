# Public lineage erasure PDF RED receipt

Base: `6ffc3262fb77ce76a23852c0529fc874297b985d`
Writer branch: `agent/issue-914-public-lineage-erasure-20261022`

This checkpoint is test-only. It adds the hosted HTTP/PostgreSQL/worker acceptance extension to `DiagnosticPublicTransferProof.e2e.spec.ts`. The case covers different-commissioner B after A-only purge, public JSON, public document list/download, all `tk`/`ru`/`en` locales, generated B artifacts, storage-I/O erasure ordering, immutable pre-erasure bytes and descriptor preservation. The worker subprocess refuses non-hosted or base-database execution before mutation.

The new PDF assertion has not run against hosted services. It decodes the production renderer's embedded font maps and text operators, then checks that a newly generated B PDF has B's id/findings/date/mileage/template and no erased A report id or protected A material. The existing renderer prints `report.successorOf`, so disclosure is predicted by source inspection, but setup and the criterion must still be reached in hosted execution.

JSON RED was already reached by hosted API run `39863960597` on prior exact head `64f96fd`; the current source still spreads B's immutable snapshot predecessor into the public DTO. No local services, Docker, destructive target suite, deployment or production edit was run in this slice. Root must run the hosted test-only checkpoint and record the exact reached PDF RED before any production correction.

Pre-erasure issued bytes remain immutable by contract. The acceptance case records their descriptor and exact bytes and requires current public access to withhold a historical copy that contains erased A material. It does not rewrite B's snapshot or silently replace issued bytes.

## Verification and handoff

Reservation pushed at `6ffc3262fb77ce76a23852c0529fc874297b985d`, tree `fdd320a67eb2b8a565479a469949a20951807050`. Reused the clean host-isolated worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-a496671e`, initially on scaffold `t3/a496671e`. No children or separate PR. Root owns the Listing-restoration, missing-proof403 and changed-commissioner fixture repairs and reauthorization helper. This diff does not edit those cases.

| Criterion | Evidence | Result |
|---|---|---|
| Public JSON hides erased A | Prior hosted run `39863960597`; extended lifecycle assertions | established RED, new checkpoint execution pending |
| Newly generated TK/RU/EN PDFs hide A | Actual `DiagnosticArtifactWorker.generate(id)` with PostgreSQL and private S3, followed by HTTP downloads and decoded text | hosted execution pending, no reached RED claimed |
| Pre-erasure artifact and I/O race | Finalized phase generates/downloads EN before erasure; real storage read triggers product purge before response authorization | hosted execution pending |
| B continuity and own material | Existing erasure, reset protection, identity pins, exact retry, writes, release/withdrawal checks retained; added snapshot/descriptor/byte checks | hosted execution pending |
| Compiler/lint/build | Fresh API and worker TS7/TS6, full affected lint and Nest builds | pass |
| Affected non-container unit tests | `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api --filter @auto-tm/worker test:unit` | API 2552 passed, 2 skipped; worker 292 passed |
| Repository typecheck | `pnpm typecheck` | 11 tasks pass, 10 cached; affected API/worker also checked directly |
| Repository unit gate | `AUTO_TM_TEST_DATABASES=off pnpm test:unit` | blocked by unrelated native-session process fixture, port 64997 unavailable, expected `/served bundle lacks/` |
| Import/runtime/docs | `pnpm check:runtime-imports`, `pnpm check:agent-docs`, `pnpm check:glossary`, `git diff --check` | pass |

The decoder was exercised without services against the existing issued `short-tk.pdf`, `short-ru.pdf` and `short-en.pdf` fixtures in `docs/evidence/issue-916/pdf`, recovering literal report id, date and mileage. Both cooked subprocess scripts parse without execution. These checks validate test mechanics and are not PDF erasure RED. Existing worker renderer unit coverage remains unchanged. No production correction, new renderer version, generation admission, schema or retention policy was selected.

The draft phase generates all three locale artifacts after erasure. The finalized phase generates EN before erasure and RU/TK afterward, preserving the original EN descriptor and stored bytes. Privacy assertions use `expect.soft`, which still fails the case, so a JSON or historical-download failure does not prevent the same hosted run reaching new PDF text assertions. All fixture/reset/isolation checks remain hard assertions.

Root owns hosted execution and integration. The current `2bdd88a1` PR Checks run `39866884699` was still live at the bounded read; final publication is held under Root's instruction until terminal. This receipt is an awaiting-RED checkpoint, not an implementation completion claim.

Docs: internal lifecycle/test changes using existing dependencies and installed `pdf-lib` types; no dependency, external service or API contract change. Existing overview ownership and boundaries were inspected and remain unchanged.
