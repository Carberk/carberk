# Full-v3 Support text source handoff, 2026-10-21

Implementation writer for #901 under #897 and PR #904. The host-created checkout was at exact base `4fc77bba3fc57ec678cc0946d76ee5e23a31ff80`. Branch `agent/issue-901-v3-support-text-source-20261021` was reserved and pushed at that base before any edit. Root alone assembles with `-x`, pushes integration and updates GitHub execution records. No PR, child agent or reviewer was used. The [test handoff](full-v3-support-text-test-handoff-20261020.md) and the [graph plan's final disposition](full-v3-service-history-graph-plan-20261020.md#final-bounded-disposition) govern scope.

## Reached RED

On `45a5be4c` (API `118967370288`, run `39521844904`), all original seventeen and all four coordinator cases passed. Support's first `POST /api/v1/services/conversations` returned 503 `COLLECTION_DISABLED`. Root's later run on `db44fcbf` (API `118974797009`, run `39524126985`) confirmed that this was the only remaining full-v3 failure, now at spec line 1355. The cause is the source gate: `serviceRuntime` admits only explicitly configured synthetic IDs. This writer did not rerun hosted suites.

## Design: server-bound admission plus journal ownership

The ordinary runtime gate is unchanged for everyone outside this authority. `SERVICE_SYNTHETIC_ENABLED`, `SERVICE_SYNTHETIC_USER_IDS`, providers and the roster are also unchanged. There is no environment bypass, client-selected reservation, seed or new operational entry point. The pattern reuses the existing SMS authority: a contract-hashed function in the reservation namespace, checked against manifest state, candidate and profile.

1. [Campaign admission](../../../apps/api/src/modules/service-messaging/infrastructure/campaignServiceAdmission.ts) is consulted only when the ordinary gate refuses, and only on Support text paths. It reads the principal's stored email. Unless that email matches the fixed v3 roster grammar and its candidate prefix matches the serving `AUTOTM_COMMIT_SHA`, admission stops there without taking locks. Production always refuses.
2. When the email does match, admission takes `ROW EXCLUSIVE` on the six text tables in reset's sorted order. It then takes the existing `hashtextextended(namespace,0)` fence. This follows reset's table-then-fence order, so no new deadlock order is introduced. Admission then requires `campaign_service_authority` to exist.
3. `"cf_<id>".campaign_service_authority(principal, session, conversation, peer, candidate)` is created by the v3 fixture. Its definition hash is stored in the new manifest column `service_contract_hash`. It returns true only when all of these hold:
   - the manifest is single, in `identities`, full-v3/delivery version 3, and bound to this exact reservation and candidate;
   - the fixed fifteen roster entries are present;
   - the User is live and journaled with its current row hash;
   - the Session is that User's, unexpired, and journaled with its current hash;
   - the conversation, when given, is a journaled Support conversation whose journaled Support case also has its current hash;
   - the peer, when given, is a journaled roster User;
   - the schema, journal, event, tracking and contract hashes are current.

   The app calls the authority first for the principal (refusal is `COLLECTION_DISABLED`), then for the conversation and peer (refusal is `NO_ACCESS`). Both checks complete before any write.
4. [PrismaServiceMessaging](../../../apps/api/src/modules/service-messaging/infrastructure/PrismaServiceMessaging.ts) opts in only for these paths: Support `open`, `mine`, `read`, text-only `send`, `assign` (target as peer) and `markRead`.
   - History, attachment stage/upload/file, push subscribe, Support commands, artifact/report paths and `queue` keep the ordinary gate. They never consult campaign admission.
   - Session, elevation, grant, assignment, privacy and idempotency checks are unchanged.
   - When a campaign customer already has a Support case, `open` returns it only if the authority proves that conversation is journaled. An unknown row is never adopted.
5. [staging-campaign.mjs](../../../scripts/staging-campaign.mjs) extends tracking in v3 only to `support_cases`, `service_conversations`, `service_messages`, `service_outbox`, `service_read_states` and `service_audits`.
   - `service_read_states` uses the composite key `{conversationId,userId}` in the trigger, integrity and preflight.
   - Service rows resolve ownership and parent edges through a service-specific map. `conversationId` maps to `service_conversations`, `supportCaseId` and the scalar `resourceId` map to `support_cases`, and the remaining principals map to `users`. History, attachment and source-listing edges are never owned.
   - Ownership persists by journaled key after any scalar is cleared.
   - A new guard allows only the write shapes below; anything else raises `Unsupported campaign service`.

| Table | Allowed write shape |
| --- | --- |
| `support_cases` | Open synthetic roster case, never closed, no source listing. Updates keep customer/mode/createdAt; assignee changes only to a roster User with version +1. |
| `service_conversations` | Support only, epoch 0, never erased. Updates change only `lastSequence` by +1. |
| `service_messages` | Insert only: text, no attachment, sequence equals the conversation's sequence, sender kind matches customer/staff. |
| `service_outbox` | Insert only: undelivered, attempts 0, epoch 0, `message` or `handover` event. |
| `service_read_states` | Roster reader; updates only advance `lastSequence`. |
| `service_audits` | Insert only: Support purpose, roster actor and optional roster target, listed text actions. Each audit's resource must be an owned case. |

Deletes of these tables while the reservation is in `identities` are refused. Foreign inbound edges in either direction raise `Foreign campaign graph reference` and roll the whole command back.

Integrity adds a service contract check and an untracked inventory for cases, messages, read states and audits linked to roster Users. Preflight adds a scalar `service_audits.resourceId/targetStaffId` foreign-reference refusal.

Reset still sets the cleaning fence first. It then redacts retained service audits, deletes owned rows in FK order and verifies terminal state:

- **Retained audits.** Before any parent deletion, it applies the approved contract to retained `service_audits`: `actorId`, `reason` and `targetStaffId` are cleared to NULL, and `resourceId` becomes `'redacted-synthetic-service'`. ID, action, purpose, assignment version and createdAt are kept. Redacting first means no SET NULL cascade fires.
- **Cleaning-trigger exception.** The cleaning trigger accepts only that exact redaction shape, and only under reset's table locks.
- **Deletion order.** `service_read_states`, `service_outbox`, `service_messages`, `service_conversations`, `support_cases`, then the existing order.
- **Terminal checks.** Disposal and terminal checks now permit both retained audit families. A new terminal check refuses any changed or missing retained service-audit disposition. A lost-response or repeated reset re-verifies this without writes.

## Producers and fences

- **DeliverServicePush.** No source change was needed for the text-only scope. Push is admitted only for allow-listed customers, and campaign customers are never in that list. Even if they were, the trigger now refuses any owned outbox UPDATE. After disposal, an event the worker had already selected rereads as absent under its row lock, and the worker never inserts.
- **ExpireServiceContent.** It purges only Support cases closed for 90 days. Closure is refused by the app (commands are closed) and by the trigger (`status='open'` and no `closedAt`). Its erase, delete and audit-update writes are refused while the reservation is in `identities`, and every owned write is refused after disposal.
- **Not touched.** AdvanceHistoryOrders, History, attachments and shared schedulers/jobs are unchanged. No guessed job deletion was added.

## Criterion evidence

| Obligation | Evidence | Status |
| --- | --- | --- |
| C1 Support text open/message/assignment/note/notice/reply/read state/idempotency | Admission and gating specs; generated v3 guard/authority; unchanged ordinary HTTP case | Offline GREEN; hosted UNKNOWN |
| C5 buyer A/B HTTP boundary | Same-reservation graph admission, then the unchanged `assertServiceAccess` returns `NO_ACCESS`; `mine` filters by customer | Source-backed; hosted UNKNOWN |
| Foreign reservation assignment refuses atomically | Graph authority is false for the foreign conversation, so `NO_ACCESS` 403 precedes the first audit write | Unit GREEN; hosted UNKNOWN |
| Changed candidate | Admission refuses a mismatched serving candidate; the operator path is unchanged | Unit GREEN |
| C6 bounded reset/retention | Generated reset redaction, FK order, terminal checks; node tests | Offline GREEN; SQL unexecuted |
| v1/v2 unchanged | Generated SQL and receipts are byte-identical for fresh fixture, existing-fixture retry and reset | Offline proven |
| 78/100 → 178 and 25/27 → 52 | The admission writes nothing; the guard permits exactly the handoff's predicted writes; reset adds one event per key | Prediction |

Caps are unchanged: 128 records, 2048 events, cleanup headroom, and the 5s/20s limits. Admission's own lock wait is `SET LOCAL lock_timeout='5s'`.

## TDD and offline receipts

RED, recorded before production code:

- `campaignServiceAdmission.spec.ts` failed because the module was missing.
- `PrismaServiceMessaging.campaign.spec.ts` failed two cases (open and `markRead`) with `COLLECTION_DISABLED`, matching the hosted failure. Three preservation cases already passed at base: closed paths, ordinary path and refusal.
- The `mine` case was added after review of the GET list path and failed with `COLLECTION_DISABLED`.
- The two new v3 cases in `scripts/staging-campaign.test.mjs` failed: no service trigger, and no redaction.

GREEN:

- `vitest run`: the two new specs, `serviceRuntime.spec.ts` and the service-messaging domain specs, 7 files and 39 tests, run with `AUTO_TM_TEST_DATABASES=off`.
- `node --test scripts/staging-campaign.test.mjs scripts/staging-control.test.mjs`: 47/47.
- `pnpm --filter @auto-tm/api typecheck` (TypeScript 7) and `exec tsc6 --noEmit`: 0 errors.
- `eslint src/modules/service-messaging --max-warnings 0`: clean.
- `node scripts/check-agent-docs.mjs`, `node --check scripts/staging-campaign.mjs` and `git diff --check`: pass.
- `vitest list` still collects the unchanged Support case.

Prerequisites were `pnpm install --offline --frozen-lockfile --ignore-scripts`, the contracts build, and an offline db generate with an unreachable `DATABASE_URL`. The module-wide run additionally hit two infrastructure-only e2e failures: Redis was absent and MinIO refused the connection. Those are not offline unit evidence.

Generated comparison: `/tmp/issue901-support-generated-comparison.mjs` evaluates the base and current scripts in a VM with stubbed SQL. v1 and v2 match byte for byte. The v3 fixture has 70 added or changed lines and 13 removed; reset has 80 and 29. v3 receipts are identical. Paren balance was checked for the trigger, the authority and the cleaning clause. Captures are `/tmp/issue901-support-v3-generated.sql` and `/tmp/issue901-support-v3-reset-generated.sql`. No SQL was executed, so PL/pgSQL and SQL-function compilation are unproven.

Docs: the service-messaging [CONTEXT](../../../apps/api/src/modules/service-messaging/CONTEXT.md) records the new boundary. No external dependency changed.

## Limitations and activation gaps

- The SQL is unexecuted. The authority's SQL-function validation, the `$3::text` null parameters from Prisma and the `ROW EXCLUSIVE` lock privilege are unproven until hosted readback.
- The spec's literal event counts (78/100, 178 after reset; 25/27, 52 after reset) are predictions. A disagreement means app behavior differs from the handoff's budget, not a reason to loosen the guards.
- **Closed, explicit gaps.** Support close, reopen, category and investigation commands; close/reopen versus 90-day purge; account deletion and restoration; and the staff `queue` all stay closed for campaign principals. The queue is closed because it is a global LIMIT-50 scan.
- **Also closed.** Source-listing Support, attachments and private bytes, push subscriptions and device delivery, and all of History.
- **Push head-of-line risk.** When push is globally enabled for other synthetic IDs, undelivered campaign outbox rows stay among the oldest 50 candidates until reset. They are never effected, but this needs measuring before broad activation.
- **No process-boundary candidate test.** The spec exercises a changed candidate only at the operator; runtime candidate change has no sanctioned process-boundary test.
- **Already-selected-event race.** Exercising this against reset remains unproven at runtime. The source shows only reread-and-absent behavior.
- **No change to.** Schema or migrations, the spec, contact or coordinator code, CLI/controller/Railway v3 activation, or live collection.

Stop at the pushed checkpoint. Root runs the unchanged Support case on an assembled candidate.
