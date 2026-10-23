# Hosted checkpoint aa7ae0c8

Candidate `aa7ae0c8b346a25e281ee1137f1eb3ce28a5c04c`, tree `9c446e06981944db76e76212316ddcf4f3a3d577`, main `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. This records bounded verification for #897/#901 under draft PR #904, not release acceptance.

[PR Checks 39436318449](https://github.com/Carberk/carberk/actions/runs/39436318449) completed: lane, static, DB and frontend passed; docs skipped; API and aggregate pr failed. [Runtime 39436318426](https://github.com/Carberk/carberk/actions/runs/39436318426) passed.

## API

Job `118674322364`: 311/312 files and 3002/3006 tests passed. Worker 356/356. `CampaignFullV3.e2e.spec.ts` passed 10/14.

- The added S2 lifecycle case passed refresh preservation of the elevation deadline, ordinary TOTP re-elevation, backup-code consumption and reuse refusal, grant revocation and re-grant, exact per-table auth/delivery disposal, lost-response reset retry and post-reset auth refusal. It does not prove expired elevation or fresh-Session behavior.
- Foreign/root slug collision and pre-existing foreign Dealership recovery/adoption refusal passed, including rollback. The seven earlier bounded profile/disposal/collision/capacity cases also passed.
- Four cases stop at admission setup, expected HTTP201 but received500: main journey at line261, cross-reservation admitted Dealership at558, stale-candidate admitted Dealership at587, shared-baseline preservation at617. Server output reports `Foreign campaign graph reference`.
- Redemption, settings, admitted-graph disposal, and baseline preservation/absence/race success assertions remain unreached. Passing setup refusals do not certify those behaviors.

Raw and plain logs remain at `/tmp/carberk-next-release-20261020/aa7ae0c8-api-118674322364.{raw,plain}.log`. Plain lines2435–2450 give full-v3 outcomes,2454–2538 failures,2541–2542 totals. Hosted job logs are the durable receipt; this file preserves the result and limits if host temporary files disappear.

## DB

Job `118674322790` passed the configured actual-hook offline regression5/5, then the real DB suite33 files/326 tests, with zero unhandled errors. This supplies hosted GREEN for the client-lifetime repair in [the DB diagnosis](db-teardown-57p01-20261020.md). The original `67733dbd` termination initiator remains UNKNOWN.

Logs: `/tmp/carberk-next-release-20261020/aa7ae0c8-db-118674322790.{raw,plain}.log`, offline cases269–303 and totals596–597.

## Next bounded work

Admission creation has a sole source writer. Redemption/settings and the shared-baseline guard remain closed pending reached evidence. Returned moderation command tests are assembled locally as `10aaf5bb`, from `b866ef0f`, with hosted behavior still UNKNOWN. The staff expiry design is assembled as `7fb9d0b8`, from `ff9a6496`; its sole test writer will exercise a Date-only backward window through ordinary auth. That is controlled-clock proof, not wall-clock or production-JWT acceptance.

Independent Standards and Spec review remains required for all changes after `0fdf8836`. Full owned graph, operational v3 entry points, native/browser/deployed acceptance and restoration, signing/disclosures and human-owned activation gates remain open. No protected merge, production promotion or store submission is authorized by this result.
