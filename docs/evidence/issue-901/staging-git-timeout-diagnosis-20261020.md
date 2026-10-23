# Staging Git timeout diagnosis, 20 October 2026

Diagnosis-only checkpoint for #901 under #897. Base `5462352759a149a087a1c719c04696090655e433`; reserved and pushed branch `agent/issue-901-staging-git-timeout-20261020`. Sole writer reused the host's isolated worktree. No PR, source change, child agent, CI run or staging operation. Root assembles the checkpoint with `-x`.

## Hosted evidence

The prior [794ac50a checkpoint](../issue-897/checkpoint-794ac50a-20261020.md) predates the final frontend result. Job `118683953732` passed the frontend app suites, then root tests reported 423 tests, 420 passed, two failed, one skipped and zero cancelled. The failures were:

- `business deploy refuses changed owner during provider preflight before mutation`, test declaration at `scripts/staging-railway.test.mjs:629`, 60033.317294 ms.
- `business reset refuses owner changed during final runtime readiness before remote mutation`, declaration at line 674, 60036.660486 ms.

Both reported `Coordination Git operation failed` at `scripts/staging-ledger.mjs:22:44`. Local receipt `/tmp/carberk-next-release-20261020/794ac50a-frontend-118683953732.plain.log`, lines 16141–16177. Checkout configuration in the same receipt, line 45, reports `fetch-depth: 1`; line 60 reports Git 2.55.0. These two source files have no diff between hosted `794ac50a41836472ad0278f95f03d1e07ef80e43` and the supplied base.

## Offline reproduction

Only actual local Git repositories and the existing fake Railway HTTP/command boundary were used. Local runtime was Node v24.13.0 and Apple Git 2.54.0. The workflow selects Node 22 on Ubuntu, so this is not an exact hosted environment replay.

Run the following test command from this full checkout, optionally setting `GIT_TRACE2_EVENT` to an absolute `/tmp` filename:

```sh
node --test --test-name-pattern='business deploy refuses changed owner during provider preflight before mutation|business reset refuses owner changed during final runtime readiness before remote mutation' scripts/staging-railway.test.mjs
```

Result: both pass, zero failures or cancellations. The confirmation run took 9033.826583 ms, with cases at 5071.595125 and 3924.778209 ms. Trace `/tmp/issue-901-full-confirm-trace.json`.

Create a shallow local copy at the base and give it an unavailable local origin. The unavailable path must not exist. All paths below are local; no hosted fetch occurs:

```sh
git clone --quiet --depth=1 --no-local file:///Users/bagtyyar/.t3/worktrees/carberk/t3-43f6f3ee /tmp/issue-901-shallow-offline
git -C /tmp/issue-901-shallow-offline remote set-url origin /tmp/issue-901-unavailable-origin.git
cd /tmp/issue-901-shallow-offline
GIT_TRACE2_EVENT=/tmp/issue-901-shallow-git-trace.json node --test --test-name-pattern='business deploy refuses changed owner during provider preflight before mutation|business reset refuses owner changed during final runtime readiness before remote mutation' scripts/staging-railway.test.mjs
```

Result: exit 1, both cases fail in 56.320625 and 55.213917 ms, zero cancellations. Each reports the same generic error and `staging-ledger.mjs:22:44` stack location as hosted. This reproduces the error masking and fixture failure, not the 60-second stall.

Git Trace2 identifies the exact failed command in each local case, with its temporary object directory abbreviated here:

```text
git --git-dir <temporary-objects> fetch --no-tags /tmp/issue-901-unavailable-origin.git 5462352759a149a087a1c719c04696090655e433
error: '/tmp/issue-901-unavailable-origin.git' does not appear to be a git repository
error: Could not read from remote repository.
```

Restore only origin availability, then run the same named test command from that shallow copy:

```sh
git remote set-url origin /Users/bagtyyar/.t3/worktrees/carberk/t3-43f6f3ee
```

Result: exit 0, both pass, zero failures or cancellations, 8539.611833 ms total. Trace `/tmp/issue-901-shallow-local-trace.json`. The checkout remains shallow; fixture scratch storage can now obtain both required commits from the local full repository.

## What this establishes

`businessLifecycle` at lines 300–306 fetches the current candidate and retained schema baseline into a fresh scratch repository for every case. A full checkout uses `process.cwd()` as the source. A shallow checkout uses its configured origin URL. Thus these otherwise fake-provider tests perform hosted Git fetches under the hosted checkout configuration. The first fetch can fail before the lifecycle fixture returns and before either test installs its owner-change callback or reaches its rejection assertion.

`GitLedger.git` replaces every `execFile` error with the same constant message. It discards command identity, exit code, signal, killed status and stderr. Its configured timeout is 60000 ms. The two hosted durations are consistent with this timeout, but the surviving receipt does not prove which command timed out or even retain the underlying child-process error category. The source has many Git calls, including parallel migration blob reads, so duration alone cannot identify one.

Ranked hypotheses after constructing the local feedback loop:

1. A per-case origin fetch stalled. Prediction: unavailable origin breaks shallow fixture setup with this generic error, and restoring only origin availability makes it pass. The offline differential confirms this mechanism, not its occurrence in the hosted job.
2. A temporary-ledger Git operation stalled later. Prediction: a command trace would identify a local ledger command rather than the initial origin fetch. No such hosted trace was retained. Local named cases and ledger tests pass.
3. Runner contention or a child-process stall consumed the timeout. Prediction: process timing/resource evidence would show a stalled operation despite an available origin. No hosted process/resource evidence was retained. No concurrency or timeout change was tested.

No repair is justified from this evidence alone. In particular, the offline unavailable-origin failure is deliberately induced and is not a regression test proving a fix for the hosted timeout. No guards, assertions, concurrency, timeout, campaign or remote-program files were changed. Historical pending-promise cancellation remains separate and unproven; it was not investigated here.

## Checks and remaining evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Exercise the two original cases with actual local Git | Full and shallow/local-origin runs above | Pass |
| Identify underlying Git command/error safely in a local reproduction | Shallow/unavailable-local-origin Trace2 | Pass |
| Preserve ledger contention and committed-byte behavior | `node --test scripts/staging-ledger.test.mjs`, 5/5, zero cancellations, 740.098833 ms | Pass |
| Identify exact hosted failing operation and root cause | Hosted receipt lacks command and child error metadata | Unknown |
| Prove a bounded source repair RED to GREEN | No hosted-cause reproduction; no repair attempted | Not established |

Next diagnostic evidence, if separately authorized, should preserve a fixed operation label and safe exit/signal/killed metadata at the Git boundary, or capture a restricted Git command trace on the hosted candidate. Do not dump raw command arguments, URLs, environment, stderr or an unsanitized `Error.cause`, which may carry credentials. A trace of these local fixture repositories is safe; that does not make arbitrary production Git traces safe. No hosted rerun, timeout increase, network retry or operational mutation is requested by this checkpoint.

Only this handoff document changes. Repository-wide checks and hosted acceptance were not rerun for a diagnosis-only artifact. The root integration owner retains review, assembly and any later hosted diagnostic decision.

## Authorized diagnostic source checkpoint

Root accepted diagnosis commit `288c494f5b70de4a80ad5e5086cd5a8d571fd570` and then authorized one separate diagnostic source checkpoint on the same branch/worktree. Hosted cause remains **UNKNOWN**. This change improves future failure evidence; it is not a timeout repair or proof of a hosted cause.

`GitLedger.git` now retains the existing error prefix and adds only an allowlisted operation, bounded numeric exit status, allowlisted signal and boolean killed status. Example from an actual failed local fetch:

```text
Coordination Git operation failed: operation=fetch exit=128 signal=none killed=false
```

Operation labels are `ls-remote`, `fetch`, `show`, `ls-tree`, `hash-object`, `mktree`, `commit-tree`, `push` and `rev-parse`; all other command names become `unknown`. Exit status is an integer from 0 through 255 or `unknown`, including for every string-valued error code. Signals are `SIGTERM`, `SIGKILL`, `SIGINT`, `SIGHUP`, `SIGQUIT`, `SIGABRT`, `SIGSEGV`, `SIGPIPE` or `SIGBUS`; absent signals become `none`, all others `unknown`. Killed status is true only for the boolean `true`.

No arguments, URLs, output, environment or original error/cause are attached. Success results and rejection behavior remain unchanged; compare-and-swap still returns false on push failure and retains uncertainty about remote completion. No retries, timeout, buffer limit, concurrency or guard changes. `scripts/staging-railway.test.mjs`, `staging-campaign.mjs` and `staging-remote.mjs` are unchanged.

Test-first evidence on Node v24.13.0 and Apple Git 2.54.0:

- RED before source edits: `node --test --test-name-pattern='Git failures identify safe operations' scripts/staging-ledger.test.mjs` exited 1, one failed, zero cancelled, 60.342709 ms. The actual message was the old generic prefix; expected safe fetch metadata was absent.
- GREEN after source edits: `node --test scripts/staging-ledger.test.mjs` exited 0, 6/6 passed, zero cancelled, 766.089125 ms. The five existing tests remain unchanged. The new test executes actual Git against an unavailable local path containing a secret-like sentinel, then executes an unknown command containing that sentinel. It asserts literal messages, no sentinel or temporary root in the stack, and only `message`/`stack` own properties. The unknown command reports `operation=unknown exit=1 signal=none killed=false`.
- The unchanged two named cases, using the exact named-case command above, exited 0, 2/2 passed, zero cancelled, 7765.978625 ms. Case durations were 4326.130833 and 3402.069416 ms.
- `git diff --check` and `node scripts/check-agent-docs.mjs` passed.

No forced timeout or signal test was run; the local regression exercises ordinary exit failures and redaction. The signal/unknown-code classifications were inspected in source. No services, real network, staging mutation, CI run, broad suite or duplicate agents. Root owns later batch assembly and any hosted diagnostic run. The new metadata cannot recover information discarded by job `118683953732` and makes no claim about that job's underlying failure.

## Bounded immutable-object test cache checkpoint

Sole writer reserved and pushed `agent/issue-901-staging-git-cache-fix-20261020` before edits. The host scaffold `t3/24b58ac4` began at `960bf2c3`, which contains the supplied root `2a09bb80`, published `d397c8b7` candidate and diagnostic `f39ef45b`. No PR or children. Root owns assembly with membership source, coordinator and contact work. Only `scripts/staging-railway.test.mjs` and this append change in this delivery.

### Updated hosted evidence and uncertainty

Read the existing local receipt `/tmp/carberk-next-release-20261020/d397/frontend.plain.log` for frontend job `118701135688` on `d397c8b7`. No hosted job was started. Exact receipt lines are:

| Test | Declaration | Receipt lines | Duration in ms |
| --- | --- | --- | --- |
| business reset refuses partial probe and retains the exact operation | 423:3 | 15968–15981 | 60082.265476 |
| business reset refuses audits probe and retains the exact operation | 423:3 | 15990–16003 | 60070.416174 |
| business restoration refuses missing durable disposal before any main deployment | 437:3 | 16060–16073 | 60029.919996 |
| business initial reset refuses operation binding changed during final attestation before remote mutation | 614:1 | 16287–16300 | 60056.079199 |

The error at lines 15975, 15997, 16067 and 16294 is exactly:

```text
Coordination Git operation failed: operation=fetch exit=unknown signal=SIGTERM killed=true
```

Summary lines 17102–17109 report 424 tests, 419 pass, 4 fail, zero cancelled, 1 skipped, 624179.999053 ms. The metadata proves a fetch was SIGTERM-killed around 60 seconds. It does **not** identify the remote or which fetch site failed. There are immutable-source and mutable-ledger fetch sites. None of the four failures is proven to be an origin fetch. The separate API membership-source RED remains outside this writer's scope.

### Reproduction and regression

The new named case `business lifecycle reuses immutable shallow origin objects after first acquisition with isolated ledgers` uses actual Git and the actual `businessLifecycle`. It seeds a local bare origin with the real candidate and retained baseline, clones a depth-one checkout, completes the first lifecycle, renames that origin away, and creates a second lifecycle. It verifies exact candidate and baseline commit identities and equal tree identities, distinct ledger directories/remotes, and independent reservation ownership after mutating the first reservation. Its seed uses the normal object source so the regression also works when the outer test file itself runs from shallow CI.

RED checkpoint `f6c085ac` ran the named regression against the prior per-case source behavior: 1 failure, safe `operation=fetch exit=128 signal=none killed=false`, 5781.478083 ms total. Follow-up test setup checkpoint `7da5dd6d` also ran RED, 1 failure, 6160.243542 ms total. The first lifecycle returned before origin removal; the second could not fetch. Both checkpoints were pushed before implementing caching. This deterministically reproduces the repeated immutable-origin availability dependency. It does not reproduce a SIGTERM, a 60-second stall, or the hosted cause.

### Cache invariants

- One lazy acquisition promise per checkout source pins HEAD and the retained baseline. Both must be lowercase 40-character SHAs. Shallow acquisition performs one `fetch --no-tags` from configured origin with both exact SHA refspecs into a fresh bare object source. Each fetched object must resolve as exactly the requested commit. Explicit refs retain both objects and their complete ancestry.
- Every business lifecycle still initializes its own scratch ledger and bare lease remote and fetches both exact SHAs. Only the immutable source is shared. Mutable reservation refs, synthetic main commits, ledgers and remotes remain isolated. No production ledger code or safe diagnostic behavior changes.
- Full checkouts keep the checkout directory as their object source. Shallow checkouts use the cached local bare source after acquisition. No fetch is skipped in the business lifecycle; no timeout, retry, concurrency, assertion, service or runtime policy changes.
- Temporary cache roots use `mkdtemp` under the platform temp directory, with no fixed shared filesystem location. One module-scope `node:test` after hook removes them at test-file completion, including failed acquisition. A rejected acquisition promise stays rejected, with no retry. Cleanup must be registered at module scope: an imported `after()` called inside a test attaches to that active case. A small Node runtime probe confirmed that behavior before final verification.
- Cache Git failures use the existing safe `GitLedger.git` boundary. No remote URL, raw stderr, arguments, environment or error cause is added to errors. SIGKILL/process crash cleanup is outside the guarantees of test lifecycle hooks.

### Final checks and limits

On Node v24.13.0, Apple Git 2.54.0, ran this bounded command with the final code:

```sh
node --test --test-name-pattern='business lifecycle reuses immutable|business reset refuses (partial|audits) probe|business restoration refuses missing durable disposal|business initial reset refuses operation binding' scripts/staging-railway.test.mjs
```

- Full checkout: 5/5 pass, zero failures/cancellations/skips, 26805.856292 ms total.
- Real depth-one local checkout at `/tmp/issue-901-cache-final-shallow`, with the final test file copied into it: 5/5 pass, zero failures/cancellations/skips, 27226.945458 ms total. Its origin was this writer's full local checkout. The regression adds its own shallow checkout and temporary local origin.
- Local-only Trace2 receipt `/tmp/issue-901-cache-shallow-final-trace.json` identifies actual sources: 1 fetch from configured checkout origin, 1 acquisition from the regression's local origin, 14 fetches from local immutable caches, 62 from isolated lease remotes, zero other fetch sources. The 14 include the regression's two seed fetches from the outer cache and 12 immutable fetches into six real lifecycle ledgers. Both cache directories were absent after file completion. All observed source locations were local; no external Git/network calls occurred during these tests.
- `node --test scripts/staging-ledger.test.mjs`: 6/6 pass, zero failures/cancellations, 859.369833 ms. This includes safe diagnostic redaction, contention, restart and committed SQL byte identity.
- `pnpm check:agent-docs` and `git diff --check` passed. Diff inspection confirms all prior business assertions and staging-ledger files are unchanged. No overview ownership or module boundary changed. Docs: not applicable, internal test-infrastructure change with existing Node/Git APIs.

Hosted Ubuntu/Node 22, real external-origin acquisition, full root suite, API membership repair and hosted acceptance were not run. The new regression retains real application object history to exercise the existing lifecycle, rather than substituting miniature schema objects. It takes roughly 11–12 seconds locally; only the unavailable-origin dependency is deterministic. The first external acquisition may still stall or fail, and local ledger fetches may still fail. This cache removes an independently proven repeated immutable origin-fetch dependency and is **not a proven cure of the hosted timeout**. No services, Docker, DB, Railway or staging operations, broad suites, timeout repair or assertion weakening were performed.
