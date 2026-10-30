# #897 regression assembly and release receipt, 2026-10-23

Bounded assembly for selected #897 through sole [PR904](https://github.com/Carberk/carberk/pull/904). This is a test/static-verification checkpoint and release continuation receipt, not source completion, final Standards/Spec review or release acceptance. Root alone assembles/publishes the integration candidate and updates #897/PR904. No selected product or security acceptance is waived.

## Assembly and preservation

Host checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-ee07f55b` started clean at `bc667b35a447e25256029b2a9cb06aab8a398afd`, tree `b51521aa68239f5ecc7f17751663d557ac2a102b`. Scaffold `t3/ee07f55b` remains at that base. Reserved/pushed `agent/issue-897-regression-assembly-20261023` before edits. Inspected and cherry-picked `b1c3b7c47bb6bf4ec3af8171630f56eea6231ac7` with `-x` as `d4449cae`; its [original writer evidence](no-observation-ownership-tests-20261023.md) is preserved unchanged, including the mistakenly prohibited dependency-build invocations. That writer's missing `DATABASE_URL` was a Prisma configuration error, not a host guard refusal. This assignment explicitly permits those configured builds and generation.

Exactly two new cases cover seller and VIN mutation then restoration with no A reobservation. Source inspection found no defect requiring changes to the added helper/tests. Each uses its own registered Listing, restores every original scalar including `updatedAt` in `finally` before B, preserves an earlier mutation failure if restoration also fails, and registers any unexpectedly returned proof before denial. Existing teardown checks registered rows, descendants and object keys before disposal and refuses unknown ownership. Failed restoration therefore retains its error and does not expand cleanup authority. A remains finalized with original raw/evidence/report/PDF pins; B gets ordinary independent observation, evidence and authorization. Neither proof nor future witness state is seeded.

Removing ONLY the contiguous added helper/two-test block reproduces the complete baseline suite byte for byte. Added block is 7,110 bytes / 94 lines, with two `it` declarations. Baseline SHA-256 `118594cb9a381cf845536120ecdb69f6eb6420470989a7891f88956388853fd0`; checkpoint SHA-256 `ff4d695564d6fde30ee14f7343fd44d5fb1f293a4b847367eaab3ad488b69f4b`. Every original positive201/negative body and all protected full-v3 tests remain unchanged. The complete tracked diff contains only that suite, the original evidence and this receipt. No production source, schema, migration, dependency/configuration or merged ADR change.

The two new403 cases are MASKED under the current default-closed public automatic admission in `ContinuityPair`. They establish neither runtime RED nor historical-ownership discrimination, even if they pass later. The unchanged positive201 remains genuine reached RED, including latest hosted evidence below. New-case runtime remains UNKNOWN until normal hosted disposable CI after Root's assembly.

## Allowed local verification

Logs and machine receipts are in `/tmp/issue-897-regression-assembly-20261023/`. Configuration inspected includes package scripts/build wrappers, Prisma config, API Vitest config and runtime boundaries. `packages/db` build runs only Prisma generation and TypeScript emit. Both builds used safe local placeholder `DATABASE_URL=postgresql://local_placeholder:local_placeholder@127.0.0.1:1/carberk_generation_only`; this config/generation value did not connect to a database. Initial pnpm commands populated missing local workspace dependencies from the existing store with zero downloads and no tracked dependency change.

| Command / evidence | Result and log |
| --- | --- |
| `pnpm --filter @auto-tm/contracts build` | PASS, `contracts-build.log` |
| `pnpm --filter @auto-tm/db build` | PASS, Prisma Client 7.8.0 generation plus emit, `db-build.log` |
| `pnpm --filter @auto-tm/api lint` | PASS, `api-lint.log` |
| `pnpm --filter @auto-tm/api typecheck` | PASS, TypeScript 7, `api-ts7.log` |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS, TypeScript 6, `api-ts6.log` |
| `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue-897-regression-assembly-20261023/collection.config.mts --staticParse=false --json` | PASS, import-only listing of 23 tests in this one suite, including the two additions, `collection.log` / `collection-summary.json` |
| `pnpm check:runtime-imports` | PASS, DB/contracts imports, `runtime-imports.log` |
| `pnpm check:agent-docs` | PASS, `agent-docs.log` |
| `pnpm check:glossary` | PASS, `glossary.log` |
| `git diff --check` and original-body comparison | PASS, `diff-check.log` / `preservation.json` |
| HTTP/PostgreSQL/storage execution of assembled checkpoint | UNKNOWN; normal hosted disposable CI remains required |

Temporary listing config restricts `include` to this suite and sets `globalSetup: []`, `setupFiles: []`, one worker and API root. Listing imports/discovers tests only; no test hooks, bodies or services ran. No Docker, local services, e2e execution, credentials/provider/quota lookup, Railway attempt, reset/deploy, native interaction, mobile build/signing or store operation occurred. No host guard refusal occurred. Any actual refusal remains terminal without another-tool workaround. Docs: not applicable, internal test assembly/evidence only. No changed ownership or implementation boundary requires a context-map, overview or glossary edit. Documentation is exempt from behavioral RED; checks and source/log inspection provide its evidence.

## Latest complete hosted evidence

Source `1d8128d56c1064c027b693f541187466d44b77e0` differs from `0aaff93731cd9b1a5a6c9ab6e76527b236dddda2` only in docs. [Run39897093363/API120229988882](https://github.com/Carberk/carberk/actions/runs/39897093363/job/120229988882) completed with API 338 files PASS / 2 files FAIL, 3,353 tests PASS / 6 testcases FAIL, duration 853.42 seconds. Worker passed 57 files / 373 tests. [AggregatePR120234238128](https://github.com/Carberk/carberk/actions/runs/39897093363/job/120234238128) fails only API; lane/static/DB/frontend PASS, docs SKIP in full lane. [Image runtime39897093407](https://github.com/Carberk/carberk/actions/runs/39897093407) PASS.

The same six known failed testcases remain: public automatic403 versus required201; draft B and finalized B after A-only account erasure, with restricted JSON/PDF leakage, post-I/O fencing and safe-replacement failures; Support selected-worker barrier at `CampaignFullV3.e2e.spec.ts:2299`; publish and attach PUT barriers at line3288. Multiple soft assertions in the erasure cases are not additional testcases. No new source regression is established.

Raw API `/tmp/carberk-resume-20261021/1d8128-api.log` SHA-256 was independently matched to `e7e40ad90161ccaf950f75c268dc55048af6a473b692a1213fee9f0b5ce4b305`. Aggregate log is `1d8128-pr.log`; metadata `1d8128-pr-checks.json` in the same directory confirms completed failure and lane outcomes. These completed results concern that source SHA, not execution of this new test checkpoint.

## Founder endpoint and release constraints

Founder said on 2026-10-23: "$chief-of-staff okay chief of staff resume the goal then untill we have ready aab to test and emulator open to test on our staging enviorenment you and me no automatic emulator check until i say so. if we confirm eveything is fine we will upload to playstore".

Continue autonomous implementation, review, backend readiness and artifact preparation. Do NOT run automated emulator/native device interaction or verification until the founder explicitly authorizes it. Open the emulator only for joint testing at readiness. Joint human acceptance remains required. Play upload, submission and public launch require subsequent joint confirmation and applicable release gates; do not upload now. Every new agent brief must carry this constraint.

Inspected `apps/mobile/eas.json`, `app.config.js` and the mobile/Expo guide. Current staging profile is internal APK, `tm.auto.app`, EAS `preview` environment and staging web URL. Production is store AAB, `com.auto_tm.ynamly`, EAS `production` environment and production web URL. Plan a signed AAB plus an installable staging companion, recording exact source/tree, profile, version/code, artifact SHA-256, API/socket/media/web origins and signing certificate. Disclose package/certificate differences; the staging APK is not literally the production artifact. This receipt changes no profile/build/signing and does not establish a production artifact pointed at staging. Such a claim requires explicit configuration and verification in later authorized work.

The [fresh signing receipt](play-signing-metadata-recovery-20261021.md#fresh-eas-recovery-2026-10-23-utc) records highest observed EAS build code11 and upload certificate SHA-256 `03:42:47:59:8E:01:10:F4:F9:13:3D:6A:AC:83:C0:FD:6A:78:BA:4E:4E:E6:7B:6F:77:1A:80:5C:E0:D9:06:D9`. The all-track Play maximum and Google's app-signing SHA-256 remain UNKNOWN. No key export, signing test or Play acceptance is inferred.

Three scoped Railway refusals remain terminal. The new staging request does not authorize retry, bypass or account-wide credential probing. Existing reset authority and protected-state constraints still apply; no live reset/deploy was done. Staging identity/readiness, reference inventory/recreation and quiescence remain UNKNOWN/pending. Preserve the [reference-inventory delta](../issue-901/prelaunch-reference-inventory-delta-20261021.md), protected receipts/configuration, approved overlays/templates and disposal/recreation obligations.

## Ordered continuation

1. Root inspects/assembles this verified test checkpoint, preserves all original oracles and obtains hosted runtime evidence on the assembled SHA. Do not classify the new negatives as reached RED.
2. Next source milestone is unchanged-public automatic continuity ownership facts, relevant irreversible A AND B history/witness, security/SQL/lock correctness and component erasure, under the [contract handoff](public-automatic-contract-handoff-20261023.md), [Root disposition](public-automatic-contract-disposition-20261023.md) and [independent critique](public-automatic-ownership-contract-review-20261022.md). Preserve original pins, complete histories, benign reobservation, separate temporary eligibility/unused-proof invalidation and consumed B independence. Map exact subjects, rights, deletion owner, expiry and proof copies before collection; uncovered rights block that collection. Require real SQL/adversarial/concurrency and erasure evidence, not a lock-order assertion or mutable-value/raw-count shortcut. No broader issuer or multiple-root policy is selected.
3. Complete privacy-safe lineage lifecycle, including draft/finalized B survival, A-only erasure, JSON/PDF disclosure, post-I/O fencing and safe artifact replacement. Complete protected reset correctness, including Support and publish/attach barriers, without altering protected test oracles.
4. Deliver approved [#923 foundation/handoff](staff-foundation-disposition-20261022.md#founder-approval-recorded-2026-10-23-utc) and [same-visit recording correction](founder-recording-correction-approval-20261023.md), preserving originals/date/mileage and restricted evidence rights. Foundation precedes dependent visual implementation. Then complete all selected UI/product/security acceptance; no scope reduction or new architecture policy is implied.
5. Run full applicable CI and independent fixed-SHA Standards/Spec review, fix findings and repeat affected verification. Preserve all remaining selected #897 acceptance and required native evidence under the founder's authorization gate.
6. Establish scoped staging identity/readiness and inventory, reference recreation, quiescent guarded reset/restoration and backend acceptance under existing authority. Terminal Railway refusals remain in force; missing authority/evidence cannot be replaced with another route.
7. Prepare provenance-recorded signed AAB and staging companion under later authorized build/signing work, then open the emulator for joint human staging acceptance when ready and authorized. Subsequent joint confirmation and release gates precede any Play upload/submission/public launch.

This branch/worktree is retained for Root's handoff and eventual lifecycle cleanup. No competing issue/PR execution comments, issue creation, integration-branch push, PR creation or final review claim.

The [selected #897 scope](https://github.com/Carberk/carberk/issues/897) still includes existing sign-in, search/Listings, selling/Photos, chat/push, account controls, moderation/legal/backend reliability; dealer/showroom ownership and revocation; tester-only video and complete media cleanup; privacy-safe Listing views; diagnostics; Vehicle History and separate Support; bounded admin with TK/RU/EN; analytics/observability/hosting and data deletion; guarded fixtures/reset/recovery/restoration. Audience isolation, current permissions, consent, immutable history, evidence/provider rights and human-owned activation prerequisites remain required across these outcomes. The queue above orders blockers and acceptance; it does not replace the criterion-level selected scope with diagnostics alone.
