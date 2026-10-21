# Full-v3 recorded media runtime race tests, 2026-10-21

Test-only handoff for #901 / #897 / PR #904. Base is exactly `bd7b74a35605cfa823caa45f6ce26ed1250a0b52`. Branch `agent/issue-901-v3-media-runtime-races-20261021` reuses host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-3fc210e2`, whose untouched scaffold was `t3/3fc210e2` at that base. The handoff commit identifies the head. No PR or GitHub item was changed by this writer.

Two initial HTTPS reservation pushes hit their 45-second limits before any edit. Root then confirmed the ref absent, created the reservation through GitHub's git/refs API at the exact base, and independently read it back. The supplied receipt `/tmp/carberk-next-release-20261021/media-races-reservation-verified.json` contains that exact OID. Work resumed only after this recovery. There was no host guard refusal. Final checkpoint publication uses at most one 45-second push with `http.lowSpeedLimit=1000` and `http.lowSpeedTime=20`; a timeout leaves publication UNKNOWN and preserves the local commit.

Only `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` and this note change. All 70 original statements inside the suite, including its 28 cases and all helpers, remain byte-identical. Imports gain S3 PUT/GET, Node Readable and the existing generator token. One additive parameterized declaration supplies publish and attach cases, for 30 intended runtime cases. Caps remain 128 records / 2048 events; existing test, hook, SQL-child and conditional-storage request timeouts and runner concurrency remain unchanged. No source, schema, production protocol, auth bootstrap or application graph is inserted by this test. Test-owned catalog setup follows the existing media case and is removed only when exact-reference checks permit it.

## Runtime assertions prepared

Both cases use ordinary generated email sign-in, staff TOTP/grants, business admission/redemption, protected generated contact SMS, conditional-v1 presigns, returned signed client headers, real publication/attachment and real Sharp generation. Foreign control stock is published ordinarily in another reservation. No repository module is mocked.

At the existing generator's S3 boundary, each actual recorded conditional PUT receives a streamed copy of its real generated buffer. The first body segment is consumed by the SDK before the barrier signals; the remaining segment waits. The command retains its actual ETag condition, cache metadata and existing abort signal. This extends the real-storage pattern in `ConditionalImageStorage.e2e.spec.ts`, rather than replacing the generator or claim implementation. Original transport is restored in `finally`, after the pending ordinary request settles.

The test checks persisted PREPARING state and target identity, refuses reset with unchanged primary graph/journal, and preserves the foreign graph, digest and SHA-256 of every exact foreign object. It invokes production `PrismaRetiredUploadLedger.retireExpiredPreparations` with its existing `now` argument, one millisecond after the stored deadline, with limit 3:

- Publish has three claims against a new, absent Listing ID. Recovery returns all three uploads to AVAILABLE, clears claim authority and creates no cleanup work.
- Attach has one claim against its ordinarily published Listing. Recovery retires it, clears token/deadline, retains target identity and creates exact-manifest PENDING cleanup work.

Reset must finish exact disposal while each PUT remains suspended, with no PUT timeout accepted as a race result. Every known owned key must answer HEAD 404 before release. Resumed generator writes must fail with actual storage 404/409/412, the ordinary request must fail, and the keys must remain absent. Terminal manifest/records/events digest and the complete object ledger, including absent flags, must stay unchanged.

Attach also exercises the real cleanup job after disposal. Its exact production work remains after upload/user deletion. A controlled external S3 DeleteObject outage records PENDING attempt 1 and the literal 60-second backoff. A subsequent real S3 sweep, using the existing explicit time input after that deadline, records DONE attempt 2. It re-proves exact absence, disposed rows, terminal digest/object ledger stability and foreign graph/byte preservation. Both cases retry exact reset and then dispose the control separately.

API `rootDir` rejects direct worker-source imports. The additive worker transport instead follows existing `processEmail`: a bounded child in `apps/worker`, `tsx/cjs` with the worker tsconfig, production Prisma recovery/cleanup/storage classes and the existing disposable environment. Only the S3 outage boundary changes. No copied recovery SQL, compiler-config change or product authority is introduced. The child does not create a queue worker or claim any jobs. Root should review this new test transport and streaming boundary before assembly; existing transport helpers are untouched.

Finally always releases the stream, settles the request, restores transport, resets only learned reservation IDs, checks known SMS job IDs and uses the unchanged `withKnownJobs` exact-ID cleanup. Exact learned keys alone are HEADed/deleted. No queue enumeration, bucket/prefix listing or general orphan sweep exists. ADR-0088's accepted empty unrecorded placeholders remain outside this evidence. No ISSUING/expiry amendment is approved or implemented.

## Literal ledger prepared before mutations

Counts are retained `campaign_records` / `campaign_events`, not computed expected counts from current rows. Each explicit application, recovery, reset and cleanup mutation has its literal prior checkpoint. Existing compound authentication helpers retain their own assertions and are bracketed by literal phase checkpoints. Counts below are predictions checked by the new tests, not observed runtime receipts.

| Common ordinary setup, per reservation | Records / events |
|---|---:|
| Seed | 21 / 21 |
| Two ordinary staff sign-ins, elevations and admission grant | 49 / 57 |
| Owner sign-in | 51 / 61 |
| Admission | 54 / 64 |
| Owner redemption | 56 / 68 |
| Contact request | 57 / 69 |
| Contact verification | 57 / 71 |
| Three presigns, individually | 58 / 72, 59 / 73, 60 / 74 |
| Full ordinary draft | 61 / 75 |
| Successful publication, when setting up stock | 66 / 87 |

| Case / reservation | Before ordinary race request | PREPARING / refused reset | Recovery | Before reset live rows | Terminal / all retries |
|---|---:|---:|---:|---:|---:|
| Publish primary `c3` repeated 16 | 61 / 75 | 61 / 78 | 61 / 81 | 61 | 61 / 142 |
| Publish control `c4` repeated 16 | 66 / 87 | 66 / 87 | 66 / 87 | 65 | 66 / 152 |
| Attach primary `c5` repeated 16 | 67 / 88 | 67 / 89 | 67 / 90 | 66 | 67 / 156 |
| Attach control `c6` repeated 16 | 66 / 87 | 66 / 87 | 66 / 87 | 65 | 66 / 152 |

Publish primary has 3 uploads / 15 keys and retains 5 redacted audit IDs. Attach primary first reaches ordinary stock at 66/87, then presigns a fourth upload to reach 67/88. It has 4 uploads / 20 keys and retains 6 redacted audit IDs. Each control has 3 uploads / 15 keys and retains 6 audit IDs. Publish case therefore owns 30 known keys total; attach owns 35. Each case has 6 known email request IDs, 2 separately learned SMS request IDs and 8 total OTP requests, within the unchanged loopback limit of 10. Cleanup work is produced by recovery, outside the campaign record/event ledger; its two attempts add no campaign events after disposal.

## Boundaries and remaining gaps

The first media admission assertion is the ordinary conditional presign and its journal-owned upload row. It repeats the existing candidate's unverified hosted media prerequisite. After ordinary preparation, the first new behavior is the real streamed generator barrier with PREPARING claims, then reset refusal. Catalog collisions, missing/non-hosted disposable services, import/child-runtime failures, ordinary auth/admission/contact failures, and literal setup count mismatches do not establish race RED.

The stream barrier proves the SDK consumed a partial request body; it does not provide a server-side acknowledgement that MinIO evaluated If-Match before reset. There is no provider predicate-evaluation acknowledgement seam in the existing harness. That stronger admission ordering remains UNKNOWN. If MinIO serializes DELETE behind the unfinished PUT, the existing 10-second abort can fire; `completedBeforeRelease` and the storage-status assertions deliberately fail rather than call that ordering proven. Neither timeout nor an expired signature is accepted as a fence. Do not invent provider authority or change production protocol to satisfy this test.

Hosted execution must establish whether the required cross-reset interleaving actually completes, both recovery transitions, post-disposal retries and foreign preservation. No behavior run, source verification, media GREEN, CI status or release readiness is claimed. Deployed provider/versioning proof, activation, full release acceptance and restoration remain root-owned gates.

## Offline commands and results

Bootstrap used `pnpm install --offline --frozen-lockfile --ignore-scripts`, exit 0 with 2034 cached packages and zero downloads. `pnpm --filter @auto-tm/contracts build` and `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build` passed. The latter only generates the ignored Prisma client and compiles; it connects to no service. No dependency or lockfile changes.

Initial focused lint flagged a duplicate SDK import, fixed by merging imports. Initial API compilers rejected cross-workspace worker imports and an inferred array type; these were fixed with the existing worker process pattern and explicit photo types. Final checks below all exited 0. Artifacts are recorded at `/tmp/issue-901-media-races-checks`:

- Offline syntax, `/tmp/issue-901-media-races-checks/syntax.cjs`: TypeScript 6 transpile diagnostics, emitted JS syntax and embedded worker-program syntax; also confirms all 70 original suite statements byte-identical.
- `pnpm --filter @auto-tm/api exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0`.
- `pnpm --filter @auto-tm/api typecheck`, TypeScript 7.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, TypeScript 6.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --staticParse`: static collection only. Vitest 5 does not expand this parameterized declaration and also statically misidentifies the existing Nest test builder; do not report its 30 listed rows as 30 executed or dynamically collected cases. Source has the unchanged 28 cases plus two intended parameter values.
- `pnpm check:agent-docs` and `git diff --check`.

Docs: internal-only changes use repository source, existing test patterns and installed package types. No dependency upgrade or new production API. No Docker, local services, integration behavior execution, Railway, spending, provider mutation, CI run/wait or other agents/reviewers were used.
