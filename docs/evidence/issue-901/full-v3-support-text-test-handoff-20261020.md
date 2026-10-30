# Full-v3 Support text test handoff

Test-only slice for #901 under #897 / PR #904. Base `bef859ae95ecb419dccc70185020a6321e9a1014`. The host-owned isolated checkout started on scaffold `t3/71634815` at that SHA. Reserved and pushed `agent/issue-901-v3-support-text-tests-20261020` before edits. The root's current dispatch authorizes this slice after the prior writer vacated the spec. Only the spec and this handoff are owned.

## Literal budget recorded before flow edits

The [graph plan](full-v3-service-history-graph-plan-20261020.md#final-bounded-disposition), criterion index gap 2 and selected C1/C5/C6 govern this bounded contract. Counts below assume fresh ordinary email sign-ins, first TOTP enrollments, no resend/expiry/concurrency and no service worker execution. They are source-derived predictions, not runtime evidence.

Reservation `f1` has 78 application journal records and 100 events before reset. Bootstrap is 21/21. Four sign-ins add 8/16. Two first TOTP enrollments add 22/26. One normal coordinator grant adds 2/2. Two Support opens add 4/4. Customer message adds 3/5, assignment 3/5, private note 4/6, reply 4/6, staff GET 1/1, customer read-state insert 1/1, customer exact retry 0/0 and staff exact retry 1/1. One staff notice adds 4/6 so retention must clear a genuinely non-null audit reason. This refinement was budgeted before adding that notice. Customer GET/list/denial, idempotent open, changed-payload refusal and changed-candidate operator refusal add 0/0. Total 78/100. Reset deletes 64 keys and redacts 14 audits once, reaching 178 events. Repeat reset adds zero. Limits remain 128 records and 2048 events.

Literal per-table records: users 15, dealerships 1, dealership_members 1, staff_grants 3, audit_logs 3, otp_requests 4, sessions 4, totp_enrollments 2, totp_backup_codes 20, support_cases 2, service_conversations 2, service_messages 4, service_outbox 5, service_read_states 1, service_audits 11. These include retained/deleted keys forever, not only live rows.

The bounded foreign companion uses reservation `f2`: bootstrap 21/21, one ordinary buyer-a sign-in 2/4 and one Support open 2/2, totaling 25 records/27 events. A cross-reservation assignment by f1's normally granted Support actor must refuse atomically. Its unknown foreign case/conversation and complete f2 journal remain unchanged through f1 reset. f2 reset reaches 52 events and retains only its two bootstrap audits. No direct domain/auth/grant/session seeding supplies the foreign control.

Protected email delivery ledgers are four for f1 and one for f2, outside application record/event accounting. Reset removes their exact jobs and rendered sinks and retains existing permanent dedup tombstones. No service subscription/device, private bytes, History, capacity, payment, new queue, alias or capability is created.

## Prepared contract and first refusal

One new case follows the original 22. Their entire case/helper block is byte-identical to the base. The only shared composition change imports the real ServiceMessagingModule. It registers no queue or scheduler. The real private-store constructor creates an S3 client but sends no request; this text flow never calls storage. The gateway has no connected clients. Existing auth providers, guards, queue helpers, timeouts and concurrency remain intact. No provider override or runtime gate/environment mutation enables services.

Four f1 actors sign in through ordinary generated email OTP and the existing protected worker sink. Coordinator and support enroll/verify TOTP normally; the coordinator grants only existing `support.operations`. Buyer-a opens Support, sends, receives assignment, private note, notice and reply. The customer sees no private note or operator identity; note/notice preserve response debt and reply clears it. Customer read state and exact customer retry are journal-neutral on retry. The staff retry adds exactly one ordinary `SERVICE_SEND` access audit, with no duplicate message/outbox/sequence. Buyer-b opens a separate case, lists only that case, and cannot read, send or mark A's case read. This establishes an HTTP account boundary, not mobile cache/draft clearing.

Assuming the ordinary auth setup and 53-record/65-event precondition pass, the first reached new refusal is `POST /api/v1/services/conversations`: expected 201, source-backed prediction 503 with `COLLECTION_DISABLED`. `serviceRuntime` requires explicit synthetic enablement and admitted IDs, while the campaign profile supplies no service admission. No hosted RED was run here. If a host already supplies those globals, the required first-open journal assertion instead exposes untracked service rows; that is not safe campaign support. A bootstrap/auth/composition failure is setup failure, not this slice's behavioral RED. The inherited seed comment is historical and was preserved verbatim.

All downstream assertions are masked by that first refusal: exact two-case graph keys, composite read-state key, service audit IDs/actions/actors/versions, outbox keys/epochs, literal event mutation totals, changed-payload atomicity, foreign assignment refusal/preservation, changed-candidate operator refusal, deletion and retention. Changed candidate uses the actual fixture/reset boundary, because ordinary service HTTP has no candidate input. No HTTP candidate header or runtime isolation mechanism is invented.

Reset discards its first successful response, then verifies every owned content/auth row absent and exactly 14 retained audit keys live. For all eleven service audits it retains the exact ID, action, purpose, assignment version and createdAt, clears actorId/reason/targetStaffId, and uses non-identifying `resourceId = 'redacted-synthetic-service'`. The notice reason and handover target make nulling meaningful. This marker is the literal proposed test contract for the approved terminal-marker policy, not existing source behavior. Root must reconcile a different chosen marker explicitly before GREEN; setting resourceId null is schema-invalid. No new receipt column or schema behavior is assumed. Existing terminal receipt fields, journal keys/versions/hashes/events and retained email ledgers/tombstones establish the exact receipt semantics; a retry changes none of them.

Every journal key must have one INSERT followed by its actual UPDATEs and optional terminal DELETE, correct version/event count and current row hash or exact absence. Reset adds exactly one terminal event per key; earlier events remain byte-identical. The foreign reservation's complete graph/journal remains unchanged until its own reset. All helper SQL is read-only. The flow creates foreign state through ordinary OTP and Support HTTP only.

## Offline verification and handoff

Passed:

- `pnpm --filter @auto-tm/contracts build`
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`, generation/emit only, no database connection
- `pnpm --filter @auto-tm/api typecheck`, TypeScript 7
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, TypeScript 6
- `pnpm --filter @auto-tm/api exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0`
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`, 23 cases plus Vitest's existing static Nest composition pseudo-entry; no hooks/tests executed
- `node scripts/check-agent-docs.mjs`, `git diff --check`, and Python base comparison of the original 22-case/helper block

Initial API typecheck failed because workspace outputs were absent. Offline builds resolved that prerequisite. Both compilers then found two index-signature accesses in the new helper; these were corrected and both passed. Focused lint passed. Collection proves discoverability, not runtime composition or behavior.

Docs: no external lookup needed. Checked-in HTTP, Prisma, Nest composition and campaign journal conventions suffice; no dependency or service contract change. Owning overviews remain accurate and unchanged.

| Criterion | Prepared evidence | Result |
| --- | --- | --- |
| C1 bounded Support text/assignment/privacy/idempotency | New ordinary HTTP case and exact graph/accounting assertions | Offline checks pass; hosted behavior UNKNOWN |
| C5 account boundary | Buyer A/B list/read/write/read-state separation | HTTP assertions masked; native cache/draft proof deferred |
| C6 bounded synthetic reset | Retained exact redacted audits, exact content removal, repeatable receipt/journal, foreign preservation | Assertions masked; full C6 deferred |
| #901 foreign/current-candidate refusal | Cross-reservation assignment and actual changed-candidate operator commands | Assertions masked; broader collision/race matrix deferred |

Deferred: attachments, push/device delivery, already-selected outbox/late-worker barriers, deletion/restoration, controlled-clock close/reopen versus 90-day purge, foreign inbound scalar/FK collision matrix, runtime candidate change through a sanctioned process boundary, browser recovery, mobile drafts/caches and full History. No arbitrary timestamps, token/session/role/grant/domain seeds or fixed codes were used. No source, schema, staging, Docker, local database/integration/service tests, CI/provider operations, PR, children or GitHub execution metadata updates. Hosted RED and subsequent source GREEN belong to root. Stop at pushed handoff without waiting.
