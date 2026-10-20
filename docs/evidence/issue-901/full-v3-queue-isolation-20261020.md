# Full-v3 acceptance queue isolation

Test-only checkpoint for #901 under #897 and sole integration PR #904. Base `4fdf3f2dcc8605d623a45bafdcf02ad4c17f8b20`; branch `agent/issue-901-v3-queue-isolation-20261020`. No production, helper, timeout or concurrency change.

## Hosted observation on the base

Root-supplied API job `117970728840` had four failures out of 2969 passes. Plain log lines 2382-2460 show:

- Main journey: ordinary `/auth/otp/verify` returned 500 rather than 201 at spec line 122. The logs establish the 500 only, not its root cause. Source blocks closed-v3 sessions, but no hosted stack ties this 500 to that block.
- Foreign-queue case: `reset` exited 1 rather than 0 at line 269. The log shows the exit code, not the refusal reason. The case then aborted and left its own request job and the deliberate foreign job waiting.
- Active-delivery case: the exact-claim assertion at line 314 claimed an earlier leaked job `fa403ec6…` instead of its own request.
- Changed-candidate case: the helper exited 1 at line 118 because its exact-ID claim met a job left by an earlier case.

Cross-case queue contamination explains why the last two cases failed their queue prerequisites. Their actual active-reset and changed-candidate behavior is UNKNOWN until isolated hosted execution reaches it.

## Change

`CampaignFullV3.e2e.spec.ts` adds `withKnownJobs`, which wraps the four queue-touching cases. Each job ID is recorded when it is learned:

- Every queue-creating OTP request records a valid returned `requestId` (non-empty string) through `learn` before any response assertion. This covers `signIn`, including its 201 status and `testCode` assertions, the foreign-case and active-case requests, and the two requests expected to return 500. An unexpected successful response therefore remains cleanable even when its status or `testCode` assertion fails. The original 201 and 500 status assertions follow the capture unchanged in value.
- The deliberate foreign job ID, recorded before `queue.add`.

No ID is learned by claiming a job, so a foreign or unknown claim never enters the removal set.

`finally` runs after the case's acceptance assertions, including failed ones. It removes only those exact IDs through `queue.getJob(id)?.remove()`, so an already-disposed job is a no-op. A removal failure is recorded with `expect.soft`, next to the original error rather than replacing or hiding it. In the active case, `worker.getNextJob` now runs inside the inner `try`, so `Worker.close` runs even when acquisition throws. The inner `finally` releases any job its token claimed, then closes the Worker, before the outer removal. A non-matching claimed job is released but never removed.

The change does not enumerate, drain or obliterate queues and does not remove unknown jobs. It weakens no assertion, including the exact NEXT-job and helper exact-ID checks. The foreign-job preservation assertion, late enqueue/mock-sink fences, line-280 foreign removal and v1/v2 specs are unchanged.

## Local verification

These commands ran offline. Prisma generation used the unreachable `127.0.0.1:1` placeholder, and no database, Redis, Docker or staging was contacted.

- `pnpm --filter @auto-tm/contracts build`, `pnpm --filter @auto-tm/db build`: PASS.
- `pnpm --filter @auto-tm/api typecheck`, `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: PASS.
- `pnpm --filter @auto-tm/api exec eslint <spec>`: PASS.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list --no-staticParse <spec>`: PASS; it collected eight tests and ran no hooks.
- `git diff --check`: PASS.

Logs are at `/tmp/issue901-qiso-*.log`. A root-requested correction re-ran the same offline contracts and DB builds, API typecheck and `tsc6`, focused lint, runtime collection (eight tests, no hooks) and diff check on the successor commit. All passed; logs are at `/tmp/issue901-qiso2-*.log`.

Hosted execution is still unknown. Root's single hosted lane must classify the first reached failure in each case. No result here establishes a behavior pass or a failure cause.
