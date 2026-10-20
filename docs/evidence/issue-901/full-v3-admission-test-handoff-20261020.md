# Full-v3 admission test handoff

This is a test-only checkpoint for #901 under #897 and PR #904. Base `9f8b83cf`, root disposition in [the admission ownership plan](full-v3-admission-ownership-plan-20261020.md). The baseline contract follows design `bf25e015`. Branch `agent/issue-901-v3-admission-tests-20261020`.

Only `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` and this file changed. The spec diff only adds lines. All eight original cases and the S2 lifecycle case keep their assertions. No source, script, config, cap, lock, timeout or concurrency changed.

## Hosted starting point

API job `118661971095` at `9fb10b28` failed at spec line 235 (`/tmp/carberk-next-release-20261020/9fb10b28-api-118661971095.plain.log`, lines 1810 and 2393-2419). Ordinary admission returned 500 `Foreign campaign graph reference` instead of 201. Everything from that line on is **unreached**.

## Local spec helpers

- `elevatedStaff` signs in coordinator and support, elevates coordinator, grants the named capabilities to support, then elevates support.
- `admissionFor` and `recoveryFor` build synthetic bodies within the contract's bounds.
- `resetAfter` resets the named reservations in `finally`. A refusal there is a soft failure. This keeps a failed case's sign-in codes from counting against the shared loopback IP issuance budget (10 per hour).
- `businessState` reads a Dealership with its invitations, members and Dealership audits.

Every case runs inside `withKnownJobs`, so only learned job IDs are removed and no queue is enumerated or delivered externally.

## Main journey additions (all after line 235, so hosted-unreached)

- A full digest is unchanged across every refused step: 233, 237 + 238, 240, 243 and 245.
- After admission, the owned journal contains `dealerships {id: businessId}` and `dealership_invitations {id: invitationId}`.
- After redemption, the owner membership is `{role: owner, status: active}`.
- The Dealership audits are exactly, in order:
  - `BUSINESS_ADMITTED` by support, with `{mode: synthetic, evidence, reason, verifiedScope}`;
  - `BUSINESS_INVITATION_REDEEMED` by the owner, with `{invitationId, role: owner}`;
  - `BUSINESS_SETTINGS_CHANGED` by the owner, with `{fields: ["name"]}`.
- Before reset, those Dealership, invitation, member and three audit keys are all in `owned`.
- After the lost-receipt reset, the Dealership, invitation and member rows are absent. The three audits read back exactly `{actorId: null, targetType: SyntheticCampaign, targetId: <reservation>, details: {profile, disposition: redacted-synthetic-audit}}`, with no evidence, reason, token or settings text.

## New cases: reached and unknown assertions

| Case (reservation) | Reachable today (predicted, not run) | Unreached until admission is GREEN |
|---|---|---|
| Slug collision (`ac…`). A foreign Dealership is test-created with the admitted slug | Admission with that slug returns 409 `CONFLICT`. Admission with the root slug also returns 409. The foreign and root `businessState` are unchanged. support has no `BUSINESS_ADMITTED` audit. Digest unchanged. The only owned Dealership is the root. Exact reset leaves the foreign row unchanged | — |
| Foreign adoption through recovery (`ad…`). An ownerless foreign `recovery` Dealership | Recovery for roster `buyer-b` is refused (status ≥ 400; today 500 `Foreign campaign graph reference`). The foreign state is unchanged. `buyer-b` has no invitation. `measurement_state` is unchanged. Digest unchanged. Nothing foreign is owned. Exact reset | — |
| Second reservation (`ae…`, with `af…` admitting) | — | `af` admission returns 201 and journals the Dealership and invitation. `ae` recovery of that Dealership is refused (≥ 400). The `af` state and digest are unchanged, and `ae`'s digest is unchanged. `ae` owns nothing of it. After the `ae` reset, `af`'s digest and state are unchanged. The `af` reset disposes it |
| Stale candidate (`b0…`) | — | After admission, reset with a stale candidate gives `{code: 1, receipt: undefined}`. Fixture with a stale candidate gives `{code: 1, sqlCalls: 0}`. The digest and `businessState` are unchanged. A current reset disposes the Dealership |
| Baseline (`b1…`) | The case first asserts that `collector` and its test keys are absent. A foreign collector stops the case rather than being mutated | Details below this table |

Baseline case assertions, all after admission and so unreached:

1. **Pre-existing baseline.** Redemption returns **500**. `businessState` and the digest are unchanged. The whole `measurement_state` table (collector, baseline and an unrelated other-epoch baseline) is unchanged.
2. **Race at the row-lock boundary.** A test transaction holds `collector FOR UPDATE` and inserts the baseline. Once `pg_stat_activity` shows exactly one other backend in this database waiting on a `Lock` for a `measurement_state` query, it commits. That wait is bounded at 100 × 50 ms, with a 15 s transaction timeout. The concurrent redemption must then be refused exactly as in step 1. This relies on ordinary redemption's existing `collector FOR UPDATE` order (`PrismaBusinessRepository.ts:18-20`). If a source change refuses before that lock, the wait fails explicitly.
3. **Baseline absent.** Redemption returns 201 and the `measurement_state` table is unchanged; the collector and the unrelated baseline remain. The workspace is active with an owner.
4. **Unrelated ordinary deletion.** With the namespace live, the baseline is recreated. An unrelated `example.invalid` User signs in through ordinary OTP; the code is read from its own learned queue job. `DELETE /me` returns 204 and the baseline is deleted normally, with the collector and unrelated row unchanged. The reservation's digest is unchanged and nothing of that User is owned.
5. **Reset.** Exact reset, and `measurement_state` is unchanged by it.
6. **Cleanup in `finally`.** Only the global keys the case created are removed, plus that unrelated User and its own OTP rows.

All assertions are behavioral. None asserts a trigger, a lock name or a mechanism.

## Gaps and limits

- **Race scope.** Only the "baseline committed while redemption waits on the collector lock" interleaving is exercised. A baseline write committed after redemption has deleted, or one that never takes the collector lock, is not controlled. The guarantee is no broader than that case.
- **Non-reserved path.** A non-reserved *redemption* with a live namespace is not exercised. It needs a non-roster elevated founder, which would require Session or grant writes, and those are forbidden. Non-reserved baseline deletion is shown through account deletion only. `BusinessMembership.e2e.spec.ts:50` covers ordinary redemption without a namespace.
- **Candidate binding.** The runtime admission path takes no candidate input. The only supported boundary is the operator fixture/reset binding.
- **Expiry.** The S2 expired-elevation clock gap is retained from the [lifecycle handoff](full-v3-auth-lifecycle-test-handoff-20261020.md).
- **Status code.** The refusal status for foreign or cross-reservation adoption is asserted as ≥ 400, because the plan fixes no code. The baseline refusal is pinned at 500, per `bf25e015`.
- **Cost.** Each new case adds 2-4 sign-ins, which grows file runtime. It does not change the per-test 120 s timeout.

## Local verification (offline only)

| Command | Result |
|---|---|
| `pnpm -s typecheck` in `apps/api` (with `@auto-tm/db` already generated offline) | pass |
| `pnpm -s lint` in `apps/api` | pass |
| `AUTO_TM_TEST_DATABASES=off pnpm exec vitest list …/CampaignFullV3.e2e.spec.ts` | 14 cases (8 original + S2 + 5 new) |

No Docker, database, service-backed test, staging, CI, provider or issue/PR mutation was used. The hosted result is **UNKNOWN**.
