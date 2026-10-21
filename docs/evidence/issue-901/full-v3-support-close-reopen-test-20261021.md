# Full-v3 Support close/reopen test handoff, 2026-10-21

Test writer for the bounded #901/#911 slice under #897 / PR #904. Exact supplied base is `b1bb1b525713c238bc29db4ea8da5072d525940d`. Host scaffold `t3/83f589ec` started there, clean. Reserved and pushed `agent/issue-901-v3-support-close-reopen-tests-20261021` at that exact base before edits, reusing the host isolated worktree. Root owns integration, hosted RED and GitHub execution records. No second worktree, agent, reviewer or PR was created.

Only `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` and this evidence note change. The existing 27 cases, helpers, assertions and counts remain byte-identical. One case is added, giving 28 cases. Product source, schema, fixtures, configuration and auth providers remain unchanged.

Read AGENTS, context map, coding workflow, run-issue and verification, standards, domain/runtime/lifecycle guidance, glossary, API/Identity/Service Messaging overviews, [Support specification](../../prd/features/54-support.md), [service/history graph plan](full-v3-service-history-graph-plan-20261020.md), [Support text source handoff](full-v3-support-text-source-20261021.md), and current HTTP/domain implementation and tests. Root reports earlier Support text GREEN on source `33451283`, hosted candidates `bf2dbc57` and `46f9ab8a`. This writer did not reproduce those runs.

## Prepared behavior and first barrier

The case uses ordinary generated email sign-in and the protected OTP worker/sink, existing `elevatedStaff`, coordinator HTTP grants and current TOTP elevation. Five primary actors sign in: coordinator, support, buyer-a, buyer-b and history-fulfiller. The latter receives only the existing `support.operations` capability and normal TOTP setup, providing a distinct current assignee without a new alias. No provider override, direct auth/assignment/expiry mutation, fixed OTP, fake JWT or case timestamp mutation is used.

Primary reservation is `f3` repeated 16 times; foreign control is `f4` repeated 16 times. Setup creates Support through source admission, sends a customer request and assigns support. The first new command is `POST /api/v1/services/conversations/:id/support` with `close_resolved` while response debt exists. Intended ordinary result is 400 `INVALID_MESSAGE`, atomically preserving the graph/journal. Current `supportCommand` calls `locked` without its text admission flag, so `campaignScope(text=false)` supplies no admission and `actor` should refuse with 503 `COLLECTION_DISABLED` first. Auth, grants, elevation, admission and the literal 76-record/96-event precondition must succeed before that RED counts. A failure in that setup is not this behavioral RED. Hosted RED remains root-owned and UNKNOWN here.

Downstream assertions cover customer/outsider/unassigned staff closure and reopen denial; information-request debt clearance; immediate awaiting closure refusal without notice/message/outbox/sequence writes; meaningful reply; customer-visible resolution notice with reason and exact retry; resolved closure without an implicit notice; customer reply reopening the same case and clearing closedAt; oldest debt preserved on another reply; ordinary handover; former assignee denial; current assignee manual reopen preserving debt; closure refusal while debt remains; current assignee reply/closure/manual reopen without manufacturing debt. All foreign command refusals and both reservations' snapshots remain exact.

The ordinary `close_resolved` command has no client-message idempotency contract and emits no message. The test does not invent either. The explicit resolution notice uses the existing message client ID contract: same message and outbox on retry, with one additional authorized `SERVICE_SEND` audit. Successful 14-day `close_awaiting` notice/idempotency remains unproven because no sanctioned elapsed-time setup is available in this bounded no-time-travel slice. Its immediate refusal is asserted. Investigation is not a prerequisite for resolved closure and is not exercised. Category changes are excluded.

## Predicted literal ledger

These are source-derived predictions, not runtime measurements. Caps stay fixed at 128 records / 2048 events. Each primary sign-in costs 2 records / 4 events and one delivery. Each first TOTP enrollment costs 11 / 13. Each normal coordinator grant costs 2 / 2. Failed commands roll back the access audit and add zero. Customer GET/open reuse adds zero. No service worker, subscriptions, read state or private bytes are created.

| Step | Added records/events | Cumulative records/events |
| --- | --- | --- |
| Bootstrap | 21 / 21 | 21 / 21 |
| Five ordinary sign-ins | 10 / 20 | 31 / 41 |
| Three first TOTP enrollments | 33 / 39 | 64 / 80 |
| Two coordinator grants | 4 / 4 | 68 / 84 |
| Support case/conversation open | 2 / 2 | 70 / 86 |
| Customer request | 3 / 5 | 73 / 91 |
| Initial assignment | 3 / 5 | 76 / 96 |
| Information request | 4 / 6 | 80 / 102 |
| Staff meaningful reply | 4 / 6 | 84 / 108 |
| Resolution notice | 4 / 6 | 88 / 114 |
| Exact notice retry access audit | 1 / 1 | 89 / 115 |
| Resolved closure | 2 / 3 | 91 / 118 |
| Customer reopening message | 3 / 5 | 94 / 123 |
| Additional customer message | 3 / 5 | 97 / 128 |
| Handover | 3 / 5 | 100 / 133 |
| Current assignee manual reopen with debt | 2 / 3 | 102 / 136 |
| Current assignee reply | 4 / 6 | 106 / 142 |
| Current assignee resolved closure | 2 / 3 | 108 / 145 |
| Current assignee manual reopen without debt | 2 / 3 | 110 / 148 |
| Reset, one terminal mutation per key | 0 / 110 | 110 / 258 |
| Same-reset retry | 0 / 0 | 110 / 258 |

Literal primary records: users 15, dealerships 1, dealership_members 1, staff_grants 4, audit_logs 4, otp_requests 5, sessions 5, totp_enrollments 3, totp_backup_codes 30, support_cases 1, service_conversations 1, service_messages 7, service_outbox 9, service_audits 24. Non-insert live events: OTP 10, Sessions 3, TOTP enrollment 3, Support case 13 and conversation 9 UPDATEs. Thus 110 INSERTs + 38 UPDATEs = 148. The Support case updates are seven sends, two assignments and four successful commands. Conversation updates are seven sends and two assignments.

The 24 service audits comprise SERVICE_ASSIGN 2, SERVICE_HANDOVER 2, SERVICE_NOTE 4, SERVICE_SEND 5, SUPPORT_CUSTOMER_MESSAGE 3, SUPPORT_REPLY 2, SUPPORT_REQUEST_INFORMATION 1, SUPPORT_NOTICE 1, SUPPORT_CLOSE_RESOLVED 2 and SUPPORT_REOPEN 2. The seven exact message IDs, nine exact outbox IDs and 24 exact service audit IDs, plus case and conversation IDs, account for all 42 service keys. Outbox sequences 2 and 8 are handovers; the other seven are customer-visible message events, all epoch 0. Response/notice privacy and notice reason are asserted. A mismatch must be traced to actual writes, never accommodated by loosening counts.

Reset retains exactly four redacted ordinary audits and 24 redacted service audits, deleting the other 82 keys. Shared `supportDisposed` verifies exact service audit IDs/action/purpose/version/timestamp retained while actor/reason/target are nulled and resourceId becomes `redacted-synthetic-service`; owned content/outbox/auth absent; five exact delivery jobs/sinks removed and permanent tombstones retained. Every journal key receives one terminal mutation; prior 148 events remain exact. Dropped reset response followed by retry returns the existing literal terminal receipt and leaves the entire terminal snapshot unchanged.

Foreign companion is 21/21 bootstrap + 2/4 sign-in + 2/2 open = 25/27, reaching 25/52 on its own reset. Its exact graph/journal remains unchanged through primary reset and terminal retry. Finally cleanup uses only the two known reservation IDs and jobs learned by existing helpers; no queue enumeration is added.

## Verification and remaining gates

Offline shared contract build and DB client generation/emit passed. The DB build used `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` and made no connection. Initial TypeScript 7 and TypeScript 6 checks found a nullable audit-version sort key; converting the comparator inputs to numbers corrected it. Focused lint passed before that correction. Static `vitest list` returned the 28 case names plus the existing Nest composition pseudo-entry; it did not execute hooks or tests. No local Docker/services/integration suite, Railway, CI dispatch/poll/wait or GitHub mutation was run.

Final verification results are recorded below before checkpoint. Docs: not applicable, internal test contract only; no dependency or external service change. Owning overviews remain accurate because this checkpoint enables no behavior.

Hosted behavior and count validation remain UNKNOWN until root runs this exact test checkpoint in the assembled candidate. Full #911 and release criteria remain incomplete: successful 14-day awaiting closure/notice retry, investigation and priority behavior, staffed-clock coverage, 90-day purge/reopen race and restart of retention after later closure, account deletion/restoration with content/storage erasure, reservation-aware worker/outbox/late-worker reset fences, attachments, History, push/reconnect/native account switching, and full retention architecture. This bounded reset case proves none of those gates by itself.

Final offline checks passed:

- `pnpm --filter @auto-tm/api typecheck`, TypeScript 7.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`, TypeScript 6.
- `pnpm --filter @auto-tm/api exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0`.
- `node scripts/check-agent-docs.mjs` and `git diff --check`.
- Python comparison against exact base after removing only the inserted block: byte-identical, 27 original cases and 28 resulting cases. No original assertion/count changed.

This is a prepared test checkpoint, not acceptance completion. No test hooks or behavior were executed. Root must diagnose any hosted count mismatch and retain the literal ledger, rather than reduce assertions or expand caps.
