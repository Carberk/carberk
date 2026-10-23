# Public transfer P1 HTTP checkpoint

Test-only #914 P1 within selected #897 through Root's sole integration PR #904. Runtime is **UNKNOWN / UNREACHED**. Current source predicts issuance 403; the test requires 201. No hosted HTTP execution occurred, so this is not reached RED, acceptance GREEN or final Spec/security review.

## Reservation and scope

Supplied and inspected base `4d2dcb17bf85b254c070e9ef9be90cc9f7658508`, tree `d304ee08b601585c791f919e3507c4fda75c4bc1`. Reused isolated T3 worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-b0ffe887`. Reserved `agent/issue-914-public-transfer-http-red-20261022-codex` with `git switch -c`, then successfully pushed it with `git push -u origin` before edits. No children, other writers or issue PRs were created. Integration PR head `c4df4ad7` was left unchanged; no integration push or CI operation was performed. Final checkpoint head/tree are returned in the handoff, since this file cannot contain its own commit identity.

Only these new files are owned:

- `apps/api/src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts`
- `docs/evidence/issue-914/public-transfer-http-red-20261022.md`

Read AGENTS, context map, API/diagnostics overviews, coding workflow, run-issue/verification, worktree/domain/coding/runtime guidance, ADR-0108, glossary, #914 acceptance through `pnpm agent:github issue 914 --full`, the supplied preparation and `/tmp/issue-914-public-publisher-transaction-audit-20261022.md`. Inspected current intake, report, proof, public access/document routes and existing mixed/C1/C2/ordinary public fixtures. No implementation, overview, schema, contract, migration, dependency, configuration, CI, budget, timeout, retry, skip or existing positive/security body changed.

## Contract and setup gate

The one P1 journey uses distinct personal seller/commissioners SA/SB, distinct active Listings LA/LB, two independent arrived physical visits, equal retained `SYN-VIN-041` and consistent `SYN-CHASSIS-041`. Reviewer R has current qualification and independent assignments to both orders, distinct from linking technician T. Both visits record separate physical authorization and fresh publication consent through reception HTTP, followed by their own association-validating vehicle observation.

Cross-context prerequisites follow the convention documented in `apps/api/test/helpers/e2eSuite.ts`: persisted synthetic Users/current Sessions, staff grants/qualifications, catalog and personal Listings are inserted as explicitly attributed prerequisites. This does not simulate a Listing transfer operation. Current seller power is exercised by each seller's real intake request and unchanged active seller/Listing facts. Only clock/random/synthetic runtime admission are fixture-controlled; no production staff, identity, business or authorization port is faked. Diagnostic templates, orders, assignments, authorization, appointments, raw observations, provenance staging/upload, structured capture, draft/findings, submit/review, proof and reinspection all use real ordinary HTTP and real adapters when executed.

Required endpoint versions are literal: intake0, staff assignments1/2, physical3, publication4, confirmed5, arrived6, raw observation7, structured capture8. A releases at report version3 and retains its original raw/evidence/snapshot. B has no report. Each visit declares classified provenance before upload, with independently owned red/blue literal synthetic input tiles, literal sanitized WebP outputs, separate provenance IDs and B-specific rights attribution. Rights end at the declared ordinary future date `2026-12-01T00:00:00.000Z`; there is no new blanket retention policy.

Before requiring issuance201, the reviewer must receive the exact restricted comparison: immutable A report/version3/snapshot/raw7 and evidence pin, B order8/raw7/current evidence pin, generation1 on each, no corrections and the separate provenance records. Both downloads must match literal sanitized bytes, size and SHA-256. Both commissioners and an unrelated authenticated public reader must receive the complete private/no-store sanitized 403 contract for raw/structured/comparative material. Anonymous JWT rejection is not substituted for diagnostic authority evidence.

Only after that gate, R issues `comparative_attestation` through the existing strict request schema, naming the full PA/PB union, A report/version3, B version8, both raw IDs and T. Required response is exactly `{ proofId }` with status201. `PrismaDiagnosticContinuityProofs.issue` currently checks `privatePair`, which rejects public audiences before proof creation. That predicts 403 from inspection only. Setup, import or collection failures cannot establish criterion RED.

## Assertions after required issuance201

P1 requires one restricted proof, one issuance audit and no B report at issuance. Reviewer and technician reads must match the strict current proof DTO, including A/B exact pins, method/result, rationale, issuer/time and provenance union. Durable assertions cover stable existing audience, distinct historical commissioner, order/version and evidence/provenance pin facts. The future public publisher/Listing digest representation has deliberately not been invented here. Its strict durable contract remains a source-round gate.

T consumes the proof through ordinary HTTP into B's own version0 empty draft with B's date/mileage/template/raw/evidence pins, no copied findings, no report evidence or PDF artifacts. The proof names the consumed report/time. Issuance, consumption and report creation have exactly the expected three audits, with T owning consumption/creation. Exact retry returns the same draft without changing proof or audits; changed proof/reason conflicts without mutation. The proof remains readable and A's stored release/PDF intents/raw/evidence and historical commissioner remain unchanged.

A's commissioner/public view does not disclose the B draft successor. Neither seller can read draft reports through commissioner authority. B's seller receives no A report, PDF or restricted provenance authority through the link; B's report owns no A objects. Public B document/evidence routes do not expose A's identity tile or PDF intents. LA's independently public report/documents remain governed by LA's existing public availability. P1 does not incorrectly demand that publicly available A material become private merely because a link exists.

B then records its independent finding, submits and requires independent reviewer finalization. Its public availability identifies B on LB, its documents are B's own intents, and unchanged LA still identifies A. Withdrawing B returns LB availability404 and an empty batch projection, with no older badge restored. A's commissioner cannot see the withdrawn B successor through A. Both original commissioners, raw histories and order facts remain unchanged. The test does not require A to remain public after any future LA ownership/identity change.

## Fixture safety

The new file locally reuses the inspected mixed/C1/C2 safety contract rather than introducing a cleanup subsystem. IDs, compound assignments, grant keys, request keys, findings and exact object keys are registered before their requests/writes. Returned order/raw/proof/template IDs and PDF intents are retained at their response/read boundaries before dependent assertions.

Before any object or row mutation, teardown verifies registered descendants and bindings across orders, reports, proofs, PDF intents, raw/structured/provenance records, audits, assignments, Sessions and both seller Users. It includes cross-order successor/pin dependencies. Both Listings are checked for exact seller/catalog bindings and all relation counts, including SET NULL effects; unknown descendants refuse teardown. Catalog descendants are checked against the exact registered catalog children and Listings before deletion. Namespace discovery never authorizes deletion.

Only registered exact objects receive DELETE followed by required HEAD404. Any object error preserves database rows. Owned proof/report/PDF pins are removed before exactly fenced registered parent-order cascades. No immutable identity child is directly deleted while its order exists. Listings, catalog, Sessions/grants and Users leave only through the registered bindings and empty/known descendant checks. Unknown descendants are preserved with a teardown failure. There is no startup/global cleanup or bucket listing. The app binds explicit `127.0.0.1`; Date-only fake time is restored in nested finally cleanup. Teardown's hosted behavior remains unexecuted.

## Offline verification

Final test bytes passed these commands. Logs are local `/tmp/issue914-public-*` artifacts, not hosted evidence.

| Command | Result and log |
|---|---|
| `pnpm --filter @auto-tm/contracts build` | PASS, direct compilation; `contracts.log` |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build` | PASS, generation/compilation only, no service connection; `db.log` |
| `pnpm --filter @auto-tm/api typecheck` | PASS, configured TypeScript7 direct; `api-ts7.log` |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS, TypeScript6 direct; `api-ts6.log` |
| `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticPublicTransferProof.e2e.spec.ts --max-warnings 0` | PASS, direct focused lint; `lint.log` |
| `pnpm --filter @auto-tm/api build` | PASS, direct Nest build; `build.log` |
| `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue914-public-collection.mts --staticParse=false --json` | PASS, actual import collection106; `collection.json`, empty `collection.err` |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm test:unit` | PASS, 10 tasks, 9 cache replays; API fresh execution, 261 files, 2,438 passed, 2 existing skips; `unit-final.log` |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm typecheck` | PASS, 11 tasks, 10 cache replays; API fresh execution; `typecheck-final.log` |
| `pnpm test:agent-docs` | PASS, link/policy check and 8 tests; `docs.log`; repeated after this note |
| `pnpm check:runtime-imports` | PASS, db/contracts; `runtime.log` |
| `pnpm check:glossary` and `pnpm test:glossary` | PASS, 31 terms and 40 tests; `glossary.log`, `glossary-tests.log` |
| `python3 /tmp/issue914-public-preservation.py` | PASS, all base tracked bytes unchanged, collection106; `preservation.json` |
| `git diff --check` and staged scope inspection | PASS, only the two new owned files |

The temporary collection config names only the seven continuity suites and sets `globalSetup: []` and `setupFiles: []`. Vitest actually imports with `--staticParse=false`; no setup/global hooks/test bodies execute. Counts: comparative issuance99, automatic1, consumed-erasure1, mixed2, C1 manual-correction1, C2 VIN-correction1, new P1 public-transfer1, total106. These are collected cases, not executed acceptance tests. Repository unit gates exclude E2E bodies.

`pnpm agent:github` bootstrapped the worktree dependencies from the content-addressable store: 2,034 packages reused, zero downloaded. Shared-package builds were direct. Final API compiler/lint/build and collection were direct, and the repository gates distinguish fresh API work from cached sibling output above. Inspection corrected draft commissioner-read and absent-availability expectations before handoff; no runtime failure was observed or classified.

Docs: no external documentation lookup was needed; existing Nest/Prisma/Vitest/storage patterns were reused without a dependency, external interface or service change. No ownership or shipped implementation fact changed, so the diagnostics overview and glossary remain byte-identical.

All **4,138** base tracked paths are byte-identical, verified against Git blobs with direct file-byte comparison. All **195** protected paths matching `CampaignFullV3|reset|guard|budget|prisma/schema|/migrations/|packages/contracts/|.github/` remain unchanged. Sorted `path SHA256\n` protected-manifest SHA-256 is `b7df2ef47c2bc74de2ed53431dfae073fe13832f6b69475beaeec48e1905f003`. Existing105 continuity case bodies and budgets are untouched.

## Handoff and remaining gates

| Acceptance criterion | Evidence | Result |
|---|---|---|
| P1 contract authored and imports with existing105 | New spec, strict ordinary HTTP assertions, import collection106 | PASS offline |
| Scope and preservation | Exact two-file addition, 4,138 byte comparisons, protected manifest | PASS |
| Configured offline compilation/unit/type/docs/runtime/glossary gates | Commands and logs above | PASS, cache distinction recorded |
| Actual raw7/capture8 and byte-download setup gate | Requires hosted disposable DB/storage/HTTP execution | BLOCKED, runtime UNKNOWN |
| Actual issuance201 versus current source-predicted403 | Requires setup to pass and assertion to be reached hosted | BLOCKED, no reached RED claimed |
| Consumption, publication, isolation and teardown runtime | Assertions after required201 | BLOCKED until source GREEN and hosted execution |
| Full public proof/source/security acceptance | Subsequent bounded source/security rounds | BLOCKED, outside P1 |

Root owns assembly into PR904, preserving its current running API CI, then hosted execution and reached-RED classification before source assignment. A genuine setup-complete issuance403 versus required201 must be observed before production changes. The future source owner selects and proves transaction-derived public bindings and current publisher authority; no caller-declared digest or fabricated commissioner Session is approved by this fixture.

Mandatory later coverage remains: full current publisher/Listing identity and ownership digests and strict durable contract; different current employees of one Dealership; same Listing and changed Listing identity cases; mixed-audience/different-private-commissioner and inconsistent-identity refusals; automatic-method and missing-proof refusal without the temporary fallback; permanent public source invalidation even after suspend/revoke/restore; post-link publisher loss before publication; direct SQL/schema-profile/lock/rollback/race acceptance; rights expiry/erasure with a surviving different-commissioner B; and conversion of existing public no-proof positives/races with their substantive assertions preserved. P1 does not prove any of these. Existing full-v3 release gates remain required.

No local services/Docker, live grants/provider discovery, credential/quota probes, Railway operation, reset/deploy, CI dispatch/rerun/cancel/poll, integration push, PR creation, external message, merge/promotion or store action occurred. Stop after the one verified writer checkpoint is pushed. This is a bounded test handoff, not issue closure or final delivery.
