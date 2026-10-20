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
