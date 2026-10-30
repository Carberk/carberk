# Public-transfer matrix assembly, 2026-10-22

This checkpoint extends #914 acceptance coverage through sole integration PR #904. It does not establish release readiness, independent review, or hosted matrix acceptance.

## Assembly and contract reconciliation

The Codex writer completed from reservation `080252b5adee20e27f86e1fb76bbcef76808feae`. Its pushed checkpoint `f856be6421ff9188c7f8dd1c448ac758ad0a4419`, tree `7de6522dc016aebaa5aed5047b7cdd93146035e0`, changes only `DiagnosticPublicTransferProof.e2e.spec.ts`. Root inspected the complete diff and cherry-picked it with provenance as `eeaa540a17bce04598777b05bb3ece436c2a039c`. All six prior public cases retain their bodies. Fixture cleanup now accounts for precisely registered erased ownership and audits. No production, migration, reset or CI file changed in the writer checkpoint.

Root commit `aeeb6131` fixes two integration mismatches exposed by exact candidate `080252b5`:

- The approved Prisma schema hash already existed, but its migration inventory and checksum allowlist omitted `20261022180000_diagnostic_public_continuity`. The migration SHA256 is `32fe0a8cb64aaaf187390b5c6a2fa72fe6a260547602ffdf572959409ea68a3f`. The existing assembled-schema restoration test failed with `Schema snapshot and migration inventory mismatch` before the correction and passes after it. No SQL or reset guard changed.
- The legacy private issuance suite still expected both-public comparative issuance to fail. ADR-0108 and the shared issuance endpoint now admit that journey. Both mixed-audience cases still assert generic refusal and unchanged state. The both-public case now checks real proof issuance/read, one issuance audit, unchanged orders/reports/representations and no successor. This explicitly replaces the obsolete refusal assertion; it is not claimed as unchanged coverage.

## Exact predecessor hosted result

PR Checks `39859347160` on `080252b5` completed FAILURE. Lane, static and DB passed; docs skipped. Separate image runtime `39859347173` passed. DB job `120105827300` passed 392 tests in 41 files. API job `120105827227` passed 3340 tests and failed four: the obsolete both-public refusal plus the protected Support reset barrier and two suspended-PUT reset assertions. Public-transfer six tests, legacy reports 15, corrected mixed four, and consumed-private-erasure one passed. Frontend job `120105827233` failed 26 tests rooted in the missing migration inventory entry.

Raw logs are retained in `/tmp/carberk-resume-20261021/`. API SHA256 `8d6356b0af8b6e2b1fdbba2647a4cc2721b9d09b2c4183e7f4bef94af43873df`; frontend `b07703bf1c114a9f9924196707befde1073b060d34c1500e9116163e0d6ad049`; DB `b5f3d5064fce8b5769189df6c03826c5d3c86165092dd6c3d74086410f8bffc2`.

## Root verification and limits

Runtime source/test checkpoint `eeaa540a17bce04598777b05bb3ece436c2a039c`, tree `17ff9c224c968fdc956071bfa42988082715603a`:

| Gate | Result |
| --- | --- |
| `pnpm test:root` | 597 passed, one skipped, zero failed |
| `pnpm test:unit` | 10/10 tasks passed, nine cached; changed API task executed |
| `pnpm typecheck` | 11/11 passed, ten cached; changed API task executed using configured TS7 |
| Direct API TS6, lint, build | Fresh pass |
| Schema ledger and automatic VIN schema checks | Seven passed |
| Agent docs, glossary, runtime imports, whitespace | Pass |
| Actual import collection with `--staticParse=false`, setup/global hooks disabled | 133 cases, including 18 public cases; no hooks or test bodies run |

The prior 121-case collection differs only by 12 new public cases and the documented three legacy audience names/contract reconciliation. Root rejected a default static list as execution/import evidence. Writer's final 11-entry hash manifest matches, including the assembled source. Its earlier 29-entry manifest has one stale collection hash; the final manifest supersedes that collection entry. Earlier source digest also predates the final test refinement and is not used as the final source digest.

The new tests cover different employees in one business, changed Listing id/identity/seller, permanent mutation/restore invalidation, missing/wrong/automatic proof refusal, actual observed PostgreSQL consume/publication contention, and A-only product/worker erasure with surviving different-commissioner B. Their hosted HTTP/PostgreSQL/storage bodies remain UNKNOWN until this candidate runs.

Source inspection identifies a possible remaining erasure disclosure: `PrismaDiagnosticPublic.read` spreads the immutable B snapshot, including its stored `successorOf` reference to A. The new lifecycle case requires anonymous B output to omit the erased A id. Obtain reached hosted RED before the bounded projection correction; preserve stored snapshots and B usability.

## Remaining release gates

The protected Support barrier and both suspended-PUT assertions remain unchanged, with their existing budgets and ordering requirements. Public automatic admission needs immutable unchanged-ownership evidence and a positive journey; comparing mutable current Listings is insufficient. Broader automatic issuer/multiple-root policy, same-visit method transitions, staff foundation approval and live Play metadata remain unresolved as recorded in #897 execution state.

Enforceable reset quiescence/storage drain, exact environment/reference inventory and reproducible approved edits, clean reseed acceptance, independent fixed-SHA Standards/Spec review, native/browser/deployed/operations acceptance, latest-main restoration and the exact signed `com.auto_tm.ynamly` artifact remain required. No reset, deployment, merge, promotion, store action, launch, Railway retry or quota probe occurred.
