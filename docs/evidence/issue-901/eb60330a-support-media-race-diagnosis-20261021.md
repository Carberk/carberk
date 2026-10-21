# eb60330a Support and media race diagnosis, 2026-10-21

Bounded source/log research for #901 / #897, sole draft PR904. No production or test changes. Root owns execution records, bootstrap repair, integration and any subsequent runtime assignment.

## Provenance and limits

- Published failing candidate `eb60330a91d19faf84ce91a5b05e6e815449bac2`, supplied hosted run `39580237134`, API job `119155875762`.
- Owned checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-c327d804`, scaffold `t3/issue-901-support-media-race-diagnosis`, base `ca264c50f9cb89ade76065a0b83ec29a7deb88d3`, base tree `019a445f3d2dc38f6cd6244a0be870ce6fc1f150`. Its only changes beyond the published candidate are two #914 concurrency-test commits affecting `DiagnosticReports.e2e.spec.ts` and its evidence note. The identity spec, retention boundary, conditional storage and reset sources inspected here are unchanged from eb60330a.
- Reserved `agent/issue-901-eb60330a-race-diagnosis-20261021` at that exact base with a successful bounded push before this edit. The containing documentation commit identifies the resulting head/tree. Only this new note is delivered.
- Existing files `/tmp/carberk-next-release-20261021/eb60330a-api.raw.log` and `.plain.log`, 2980 lines each. Independently verified raw SHA-256 `bd576105b99116a082cfe805d7b785e017f13a8307559f8e7650eba86614e32d`; plain SHA-256 `797dceca3124ca68bfd266ed88531da06adc2f8119e700b89c8431c9c87a3133`.
- Supplied aggregate context: other applicable lanes pass, docs SKIP, only API fails; worker 56/56 files and 364/364 tests. API totals at plain lines 2696–2697 are 314/316 files and 3054/3058 tests; identity full-v3 is 31/34. Existing diagnostics 13/13 pass. The new bootstrap 403 has a separate source owner and is excluded here.

The user restricts this assignment to existing logs and source. Accordingly, the diagnosing-bugs skill's reproduction, instrumentation and fix phases are not executed. No new red/green feedback loop or deterministic reproduction is claimed. Docs: internal evidence only, no dependency/API change or network documentation lookup. Version-specific transport facts below come from cached package source matching the lockfile, read without installing or executing it.

Prior decisions retained: [Support resolver](full-v3-support-worker-resolver-selection-20261021.md), [race plan](full-v3-support-retention-next-race-test-plan-20261021.md), [owned-worker handoff](full-v3-support-owned-worker-race-tests-20261021.md), [fence-key repair](support-fence-key-source-20261021.md), [media race handoff and failed attempts](full-v3-media-runtime-races-test-20261021.md), [held timing assembly](../issue-897/held-media-diagnostic-assembly-20261021.md), [disposal design](full-v3-image-disposal-source-design-20261021.md) and [producer design](full-v3-image-producer-fence-design-20261021.md). The proposed ISSUING/expiry amendment is not implemented or authorized by this diagnosis. Earlier regclass/setup and reservation-ID failures are already resolved; neither explains these reached failures.

## 1. Selected Support worker after reset

**Classification: confirmed test orchestration/transaction-lifetime mismatch; terminal ordering and product behavior remain UNKNOWN.** This is more specific than a generic selector timeout. It does not establish a Support authority defect.

Failure anchors: plain 2659–2673, helper at `CampaignFullV3.e2e.spec.ts:2052–2058`, actual caller **2235**, not the case declaration. Plain 2531–2532 contains only a generic owned-worker Error with empty SQL/driver codes. The log does not identify its database cause or provide the reset result.

The current [identity spec](../../../apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts), lines 2208–2239, establishes these reached phases by awaited control flow:

1. Holder takes a service-audit relation lock and session namespace lock. Reset's tagged backend is observed waiting for the relation at 2216.
2. The tagged worker is observed behind that reset backend on its real service table-lock statement at 2220. In [CampaignSupportRetention](../../../apps/worker/src/jobs/CampaignSupportRetention.ts), lines 31–42, unlocked ownership discovery precedes this transaction's table locks, namespace lock, locked rediscovery and authority call. Thus the initial selection/discovery boundary was reached.
3. Releasing the holder's relation lock lets that reset backend visibly wait on the session namespace holder at 2223. The second gate is then observed queued behind that backend at 2228.
4. The session lock is released. The test awaits the **entire operator reset result** at 2231 and successfully checks gate acquisition at 2232. It then fails waiting at 2235 for the worker's namespace wait while holding the relation lock.

The critical distinction is which reset transaction was observed. [businessMain](../../../scripts/staging-campaign.mjs), lines 1138–1144, first runs a separate `BEGIN; lock; integrity; COMMIT`, then reads state, then opens the cleaning transaction. That first integrity transaction is the first reset table waiter selected by this test. The shared lock fragment at 763–771 reacquires table locks and a **transaction-scoped** namespace lock for every locked SQL phase. [remoteMain](../../../scripts/staging-remote.mjs), lines 24–31, spawns a SQL child per call; the [disposable transport](../../../scripts/testing/query-disposable-postgres.cjs), lines 6–19, creates and closes a fresh Client per child. One tagged operator operation is not one backend or one transaction.

Consequently, the queued gate acquires the namespace after the initial integrity transaction commits, **before terminal disposal**. While the gate remains held, later reset phases cannot acquire the same namespace; if the worker has acquired its tables, those also block reset. Yet the test awaits the whole reset before releasing the gate at 2238. This cannot prove the intended successful reset-before-worker order. The reset success assertions at 2239 are still unreached. The source comment claiming a tombstoned resource at 2233 is not observed disposal evidence.

The single `until = Date.now() + 3500` at 2213 spans all observations plus the awaited full reset. Once elapsed, 2235's helper executes zero observation queries and throws the same message as a repeatedly unmatched selector. Its exact remaining budget, worker transaction expiry, reset code/SQLSTATE and instantaneous lock graph are absent. Source proves the gate/phase mismatch, not which timeout fired first in this run. Earlier successful observations must not be erased by the final message's phrase "no ordering evidence"; terminal ordering specifically is unproved.

**Smallest next assignment:** one test-only Support orchestration owner must distinguish the initial integrity, cleaning and terminal disposal transactions before designing the tombstone barrier. Add bounded sanitized phase/SQL-ordinal timing and reset outcome fields at the existing test transport, plus remaining observation budget and lock kinds/modes at the failing wait. Do not record SQL text, IDs or connection data. Require a plan that observes a genuinely disposed namespace without holding a gate needed by reset's remaining phases, while retaining the selected-before-reset, durable-claim, zero-storage, exact journal and late-worker assertions. No production authority repair, larger timeout or weaker selector/oracle is justified by this failure.

## 2–3. Recorded publish and attach generators

**Classification: both confirmed existing product request-deadline aborts while the test holds each stream, during a longer exact reset.** The shared immediate failure mechanism is proved for these two cases. The cause of reset's internal duration remains UNKNOWN; there is no evidence that all three failures share one cause.

Failure anchors: plain 2674–2694, unchanged spec assertion at 3216. Structured timing JSON is at plain **2572** for publish and **2598** for attach, diagnostic `media-runtime-race-timing-v1`, `dropped: 0` in both. The following values are monotonic milliseconds relative to each case's trace origin, not the buffered log timestamps. No actual object identifiers are reproduced.

| Observed phase | Publish | Attach |
|---|---:|---:|
| Held sends, count | 19774.159–19778.057, 3 | 20501.189, 1 |
| First body segments consumed | 19775.852–19778.900 | 20501.875 |
| Refused reset start → end | 19788.871 → 20736.202 | 20510.502 → 21464.109 |
| Refused reset duration | 947.322 | 953.600 |
| Recovery start → end | 20789.148 → 22099.251 | 21511.466 → 22717.438 |
| Recovery duration | 1310.096 | 1205.966 |
| Exact reset start → end | 22148.079 → 36020.190 | 22758.635 → 37493.978 |
| Exact reset duration | 13872.113 | 14735.339 |
| Held aborts | 29774.435–29777.809 | 30500.907 |
| Held settlements | 29775.571–29778.048 | 30501.557 |
| Pre-release verification HEADs | 15, all 404 | 20, all 404 |
| Stream release in failure cleanup | 36090.318 | 37570.261 |

Every held send begins with `aborted: false`; every held settlement is `AbortError`, `status: null`, `aborted: true`. Send-to-abort is approximately 10000 ms in all four sends. Abort callbacks occur on schedule within about a millisecond, rather than being deferred until reset returns. No held send reports fulfillment or storage 404/409/412. Publish aborts about 7.626 seconds after exact reset starts; attach about 7.742 seconds after it starts. Reset finishes roughly 6.24 / 6.99 seconds after the first abort. Post-reset test HEAD work totals only 20.265 / 29.436 ms; it cannot explain these aborts because it starts afterward.

The spec at 3113–3150 preserves each real generator command's `IfMatch`, metadata and abort signal, substitutes a partial `Readable`, and holds its remainder until `resume`. `completedBeforeRelease` becomes true whenever a held send settles before release, including rejection. The barrier means SDK partial-body consumption, not provider acceptance of If-Match. Source at 3162–3203 and the reached assertions prove real PREPARING claims, unchanged state after refused reset, real expired-preparation recovery to AVAILABLE for publish or RETIRED plus pending cleanup for attach, then successful exact reset. Before the 3216 failure, terminal journal counts, disposed rows, object-ledger absent flags and all exact-owned HEAD 404 assertions passed. The later resumed-write status, terminal stability, post-reset foreign-byte preservation and attach cleanup retry assertions remain unreached. Finally cleanup is not substitute acceptance evidence.

### Deadline and transport source

[ConditionalImageStorage](../../../apps/api/src/modules/listings/infrastructure/ConditionalImageStorage.ts), lines 7 and 50–57, creates the actual **per-write `AbortSignal.timeout(10000)`**. [SharpImageVariantGenerator](../../../apps/api/src/modules/listings/infrastructure/SharpImageVariantGenerator.ts), lines 125–139, calls that conditional writer for variants. The test forwards the same options to its S3 client at 3140. This is the product's existing request deadline operating on a test-held body, not a cancellation emitted by reset or recovery.

The lockfile pins `@aws-sdk/client-s3@3.1048.0` and `@smithy/node-http-handler@4.7.3`. Cached matching sources were read under `/Users/bagtyyar/Projects/carberk/node_modules/.pnpm/`, without writing to that checkout:

- S3 `dist-cjs/runtimeConfig.js:45` uses NodeHttpHandler. Handler `dist-cjs/index.js:406–434` passes through timeout settings and defaults agents to keepAlive with maxSockets 50. Its connection/request/socket timeout helpers at 44–145 default to zero when unspecified, not an implicit 10-second timeout. Default-mode settings in cached `@smithy/core@3.24.3`, `dist-cjs/submodules/client/index.js:839–865`, provide connection timeouts only.
- Handler `index.js:361–379` destroys the request and rejects `AbortError` on the passed signal. The observed hosted stack at plain 2549–2569 and 2586–2596 points to this handler's abort callback and Node's timeout machinery. These traces directly distinguish the observed signal abort from an SDK `TimeoutError` or a returned storage refusal.
- The test client at spec 3007–3008 sets `requestChecksumCalculation: WHEN_REQUIRED`, with no custom request handler or timeout. Streaming-body transport is real; it supplies no server-side predicate acknowledgement.
- [campaignObjectMain](../../../scripts/staging-campaign.mjs), lines 1316–1335, uses a separate S3 client, `maxAttempts: 1`, a 10-second signal per call, sequential deletes then HEAD verification. The successful reset includes that child's work plus SQL and queue disposal. [remoteMain](../../../scripts/staging-remote.mjs), lines 49–56, gives the child a 30-second process bound. These are distinct from the held producer's 10-second signal.

### What the evidence can and cannot choose

1. **Confirmed:** the held producer's deadline expires before reset finishes and before the test releases the body. Both cases therefore correctly fail the suspended-PUT oracle. Blocked-reset/recovery/setup work consumes about 2.3 seconds of that deadline before exact reset starts; exact reset itself lasts longer than the entire 10-second deadline.
2. **Leading unresolved hypothesis:** a reset DELETE waits behind an unfinished provider PUT and progresses after abort. The chronology is compatible, but no internal DELETE timing or provider lock acknowledgement was captured.
3. **Alternative unresolved hypothesis:** SQL, child startup, queue disposal, repeated terminal verification or other reset work consumes enough time independently of provider contention. The same aggregate reset interval includes all these phases. The traces cannot apportion it.
4. **Not supported for these sends:** independent SDK timeout, reset/recovery-issued cancellation, early conditional storage refusal, slow post-reset test HEADs, or a delayed abort callback. No product late-write defect or successful late-write fence is established.

**Smallest next assignment:** one bounded test/diagnostic owner should time the existing serialized reset transport's SQL, queue-child and object-child phases with fixed stage names and sanitized outcome fields. Distinguishing provider contention then needs exact-known-key DELETE start/end and internal HEAD start/end inside the existing object child, using synthetic key ordinals only. Preserve identical calls, ordering, signals, concurrency and both failing assertions. If this needs production transport edits or provider instrumentation, return that explicit scope requirement to root before implementation. Client timing alone cannot replace the missing provider evidence. Do not repeat the already-completed outer timing attempt or propose green through longer timeouts, early stream release, removed guards or a mirror unit test.

## Verification and handoff

Read-only inspection and JSON parsing only. SHA-256 verification, exact published/base source comparison, `node scripts/check-agent-docs.mjs` and `git diff --check` are the relevant checks for this documentation-only delivery. Their final results are recorded in the handoff. No runtime tests, Docker, services, network documentation, credential/provider/device/browser operations, CI reads/dispatch/polls/reruns, PR/issue operations or child agents ran. Only the explicitly requested branch reservation/checkpoint pushes use the remote.

The fence-key repair's passing retention/deadline and owned-worker cases, plus now-unmasked draft/contact/ordinary-media passes, remain criterion-level evidence for the published candidate. They do not make all Support/races/product complete. Runtime not rerun; source not GREEN. Root must keep the bootstrap source writer separate, dispatch any new diagnostic work explicitly, and assemble the one permitted note independently of the inherited #914 test commits.
