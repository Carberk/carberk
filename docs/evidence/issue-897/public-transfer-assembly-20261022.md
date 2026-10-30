# Public-transfer source assembly, 2026-10-22

Root inspected the completed bounded #914 public-transfer implementation and assembled it into the sole #897 integration PR904. This is a source checkpoint, not full public-transfer or release acceptance.

## Provenance and inspection

Writer reservation `3fe5b573851f1f5254c97aa178b05623b9f5b2f1` is retained. RED `5e98a7225bc5e879c5c312c11a8dbaa0c8b9d2c2`, source `c875c72dc0c5e7c7a68f87a8d9d2e03d84421510` and final receipt `778cbad03f8e0614c86494c1a92430cb1757ae9a` were cherry-picked with provenance as `caff1aab`, `b3f1acfa` and `be5eb07e`. Root's earlier hosted-result receipt `5da1a41c` is included. Writer is terminal/acknowledged with no children or pending questions; its pushed clean checkout and scaffold remain preserved.

Root read the full source/migration/test diff and [writer handoff](../issue-914/public-transfer-source-20261022-5638f592.md), including the original engineering brief. Inspection covered Identity-owned nonacting publisher eligibility, the whole sorted User union before Business/Listing/order locks, discovery rechecks, consumed retries, current B publishing power, immutable A history, transition invalidation and the removal of application and SQL no-proof fallbacks. No fabricated publisher Session or new diagnostic staff grant is introduced. Remaining matrix evidence is explicitly open below; inspection is not independent final review.

All 55 writer artifact hashes match. All 4,168 base paths and modes remain; 4,155 are byte-identical and 13 changed. All six existing private-continuity domain files and eight protected reset source/test files are unchanged. Only public-transfer P1 and the related legacy report fixture file changed among 101 existing E2E files. The sole original P1 body change uses Normal for B's evidence-free finding under the existing required-evidence rule; every original assertion remains. Root corrected the new helper comment to describe that accurately. Legacy fixtures now capture classified own-visit material and obtain real reviewer proofs while retaining snapshot, own-observation, no-copy, uniqueness, disclosure and PostgreSQL contention assertions.

## Combined local verification

Root runtime source is `be5eb07e4603db17164b5be37a73fc3e42bacef6`, tree `bb2df2c6f942d450b2e6279e26800be86043648f`; subsequent changes are this receipt and the comment clarification only. Local commands use the documented unreachable offline database URL and start no services or Docker.

| Gate | Root result |
| --- | --- |
| Focused private/pair/publisher domain specs | Fresh 124/124 PASS, seven files |
| `pnpm test:unit` | 10/10 tasks PASS, all cached; root script tests ran |
| `pnpm typecheck` | 11/11 PASS, all cached |
| API `tsc --noEmit`, `tsc6 --noEmit`, lint and build | Fresh PASS |
| Agent docs, runtime imports, glossary, whitespace | PASS |
| `node --test scripts/staging-clean-reset.test.mjs` | 20/20 PASS |
| All migrations applied in memory with existing PGlite | 68/68 PASS; four new public functions present; no hosted PostgreSQL verdict |
| Actual import-only declaration collection | 121/121 writer declarations match, retaining original116 plus5; legacy15/15 match. No setup/hooks/test bodies run |

Artifacts: `/tmp/carberk-resume-20261021/public-root-*`. Exact SHA256 values are in `public-root-hashes.json`; writer commands/hashes/preservation manifests remain in `/tmp/issue-914-public-source-5638f592/`. The migration log SHA256 is `6501bc3f5faa413b3b3c47f165475ee17a9bc56af1bae781796e9aaeada022b4`; focused domain log `81b92c78d365863b7f7fa8d579cfc37de1e954929e4222d1c16059fe0485d571`.

## Hosted frontier and next work

The last published candidate `51d4acd4884b914a0e2988be0586290921d9e4b8` completed PR Checks39855441279 with API3316PASS/4FAIL, worker373/373 and DB392/392 PASS. Corrected-mixed HTTP4/4 and consumed-private-erasure1/1 execute their full bodies successfully. The four remaining failures are public issuance403vs201 and the unchanged Support barrier plus two suspended-PUT reset assertions. [Full hosted receipt and raw hashes](51d4-hosted-continuity-results-20261022.md). No CI timeout, retry, concurrency, guard or assertion-tail change was made.

The new candidate's public P1, five fresh HTTP cases, converted legacy cases and SQL runtime acceptance are UNKNOWN until hosted execution. P1 alone cannot close public transfer. Next bounded work supplies explicit public mutation/authority and real locked race/lifecycle coverage: same-business/different employee; changed Listing identity/id/seller; missing, stale, wrong and automatic proofs; mixed/private audience refusals; B publisher loss after consumption; Listing/member/Business/User changes and restores; transactional consume/publication races; rollback/uniqueness; and A erasure with surviving different-commissioner B. Existing evidence/provenance/right bindings and retained-root policy remain required.

Founder questions about same-visit method transitions, minimal staff-handoff foundation and live Play metadata remain pending. Broader automatic issuer and multiple-root policies remain explicit specification decisions. Staff UI/design, enforceable reset execution/storage exclusion, approved reference reconstruction, independent fixed-SHA review, native/browser/deployed/operations acceptance, latest-main staging restoration and exact signed `com.auto_tm.ynamly` artifact remain release gates.

No reset, deployment, merge, promotion, store action, launch, Railway retry or quota probe occurred. Prelaunch data disposability removes historical preservation work only; product security and acceptance stay required. PR904 remains draft with auto-merge off and watched during active continuation.
