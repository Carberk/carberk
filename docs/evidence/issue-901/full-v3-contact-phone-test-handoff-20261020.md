# Full-v3 contact-phone test handoff

Test-only checkpoint for #901/#897/PR904 from `2a09bb807390a533eab74bcd81e1069e6408378a`, containing `81dbadeb` and the assembled contact design. Reserved and pushed `agent/issue-901-v3-contact-phone-tests-20261020` before edits in the host-provided isolated checkout. Scaffold `t3/2718f16c` remains at that base. Only `CampaignFullV3.e2e.spec.ts` and this handoff are owned. No PR or child agents. Root owns assembly with the next eligible source checkpoint; published d397 is unchanged.

The [selected proof plan](full-v3-contact-phone-proof-plan-20261020.md) owns the contract, including its deployment gate for pre-preparation ordinary producers. This preparation makes no full isolation or activation claim.

## Prepared first lifecycle

One new case follows all 21 earlier cases. The entire earlier case/helper block is byte-identical to the base. Nest composition adds the real ListingsModule, normal ConfigModule root and EventEmitterModule root. The narrowly documented import-lint exception permits test composition across the Identity boundary; no production import rule changed. Existing providers, guards, transport evidence harness, timeouts and concurrency remain. No provider overrides, generated JWTs, seeded auth/proof, fixed code or test-code mode.

Reservation `e1` uses literal design destination `+99367752052`, checked against the selected SHA-256 derivation. Three ordinary email sign-ins, coordinator/support TOTP, founder admission and buyer-a Owner redemption precede contact issuance. The current-business endpoint must prove active Owner membership first. Existing global-baseline refusal remains effective; this test never edits measurement state to make redemption pass.

The contact request requires HTTP 200, `code_sent`, a full UUID, positive cooldown and absent `testCode`. On a failed response the journal, ordinary auth/personal proofs/audits/global snapshot and destination OTP absence must remain unchanged. Assuming setup succeeds, d397's predicted first behavioral failure is `Unsupported campaign OTP` at this 200 assertion. A 404, composition error or admission/redemption/auth failure is setup failure. No behavioral RED was executed here.

After source support, the test reads only `cf_<exact reservation>.campaign_sms_sink` by full returned request ID. It matches the actual rendered six-digit code to the ordinary OTP's SHA-256 hash, verifies through the ordinary contact endpoint, and checks consumption, seven-day reuse and only the admitted Dealership contact fields changing. It covers a nonmember staff refusal, wrong-business refusal, a deterministically different wrong code with four attempts left, replay refusal and confirmed reuse without a new delivery. An active foreign Dealership update into the bound destination must roll back without adoption. A separate foreign control survives all operations.

Reset discards its successful response, proves exact owned graph/request and sink absence, compares retained binding/ledger byte-for-byte, and retries without journal changes. The retained rows must have no `message` or `code` fields. A fresh unrelated Dealership ID may reuse the phone after terminal disposal and must survive the old reservation's retry. This is scalar storage reuse, not seeded phone authentication or contact proof. All foreign fixture writes/removals are exact IDs.

Returned SMS request IDs are captured before assertions. Finally cleanup unions those with the exact protected namespace SMS ledger, including requests whose HTTP response was lost. No queue enumeration, log-code recovery or email relabeling. Exact email-queue job lookups assert SMS request IDs have no jobs. Synchronous SMS creates no new queue or tombstone. Existing email cleanup retains its known-ID job/tombstone contract.

The provisional protected SQL projection follows the approved design: binding `reservation_id,candidate,destination`; ledger `request_id,destination,code_hash,issue_row_hash`; sink `request_id,message` with rendered text. These are test contract requirements, not a claim those tables exist at d397. Full binding/ledger JSON equality after reset preserves every additional private hash/identity field. Root must reconcile concrete column names with the eligible typed source checkpoint before hosted execution. No carrier implementation is fabricated here.

## Source-derived bounded counts

Assume fresh successful ordinary sign-ins, first TOTP enrollment for each staff actor, one admission/redemption, no current-epoch inventory baseline, one contact issuance, one wrong attempt, one consume and no expiry/resend or concurrent mutation. Counts are predictions, not hosted readback.

- Application graph before contact: 56 records. Bootstrap 21, coordinator sign-in/TOTP 13, support sign-in/TOTP/grant 15, buyer-a sign-in 2, admission 3 and redemption 2 new keys.
- Before contact: 68 events. Bootstrap 21, three sign-ins 12, two first TOTP flows 26, grant 2, admission 3 and redemption 4.
- Contact adds one OTP record and four events: INSERT, wrong-attempt UPDATE, consume UPDATE, Dealership UPDATE. The case asserts the exact +1/+4 deltas. Clean happy path without the wrong attempt adds three events.
- Before reset: 57 records, 72 events. Five audits remain redacted. Reset deletes 52 other rows and redacts five audits, predicting 129 terminal events. Idempotent retry adds zero.
- Protected storage adds one binding and one SMS ledger/sink, outside application counts. Terminal retains binding, ledger, hashes and journals, with zero rendered SMS sink records. Three email deliveries keep their separate exact ledgers and permanent dedup tombstones. No contact audit, personal proof, auth row, SMS job or object is added.
- 23 ordinary HTTP requests, three existing email worker processes, one fixture and three reset invocations including finally cleanup. No new process type, service, cap, lock timeout or concurrency setting.

Limits remain 128 records/2048 events. The design's main journey floor 61, or 74 with its separate membership slice, is conditional and does not establish full-B capacity. Those journey totals are not this isolated case's totals.

## Offline evidence and next gates

Passed offline contracts and DB builds. The initial API typecheck lacked built workspace outputs; the initial DB build required DATABASE_URL. An inert loopback port-1 placeholder allowed Prisma generation/build without a database connection. No services, DB queries, Docker, CI, Railway or staging were used.

Passed API TypeScript 7 and TypeScript 6 checks, focused ESLint with zero warnings, `AUTO_TM_TEST_DATABASES=off` Vitest collection, agent-doc checks and whitespace checks. Collection reports 22 `it` cases plus Vitest's existing static `NestTest.createTestingModule` pseudo-entry. It does not execute hooks or prove runtime composition. Original 21-case block comparison passed.

Docs: no external lookup needed. This reuses checked-in HTTP, ORM and transport conventions without changing dependencies or service contracts. Owning contexts were inspected; their implementation ownership has not changed.

All service-backed results remain UNKNOWN. Next tests include strict derivation-input and candidate-change refusal, preexisting collision inventories and two-connection interleavings, Sales issue/verify refusal through ordinary membership setup, wrong-purpose proof, expiry/resend and suspended/deleting/stale-session paths. The scalar active collision and terminal reuse prepared here do not establish those broader matrices.

Do not add sender/reset or delayed-carrier race tests until the required discriminated reserve-to-send source contract exists. Then prove exact retained routing, sender revalidation, lost sink response, sender-first/reset-first order, malformed carrier and post-disposal refusal through real providers and sanctioned storage scheduling. No late sender race was attempted here. Pre-preparation ordinary-producer draining or separately authorized admission fencing remains a deployment gate, outside this checkpoint. Hosted GREEN and deployed acceptance are never inferred. Stop after commit/push; root chooses the next batch.
