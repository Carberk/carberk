# Suspended account restore no-op correction

Resumes recovered account checkpoint `03714cb16fa6fecf67e318f51c27da927b906951`, tree `c011e1645f3a4a6b334bcf7a0dffa24ddf56fd0e`, with account implementation base `25e6cd92739b6f8427e7addb34d16838a6662155`. The prior writer's usage limit interrupted its final handoff after a clean push and offline checks. It did not remove the implementation or its parent disposition. The [account source checkpoint](b1-account-source-20261024.md) remains the historical account delivery record. This is a bounded correction to its accepted ACCOUNT-NOOP-ENQUIRY-001 mismatch, not full account or candidate acceptance.

## Effective SQL change

The forward `20261024120000_diagnostic_account_noop_enquiry` wraps the effective enquiry-effect constructor. It first constructs the entire existing effect array. Only `account_restore` with an exactly equal complete protected User expected/next tuple marks that User's already discovered conversation/audit pairs optional. Every row, generated audit ID, tuple, absent key, reference, order and limit remains in discovery and locks. Schedule/moderation and changed restore targets remain mandatory. The existing completion function still permits only the exact complete pair or the wholly unchanged conversation with absent audit. Partial/mismatched effects still refuse.

Tuple equality cannot establish whether an actual UPDATE OF occurred. The existing real User requeue trigger remains the writer and now checks every recorded enquiry effect for that User against its exact final tuple before returning. Thus even a same-value UPDATE OF requires every conversation and audit. Suppressing both writes, one conversation or the audits cannot use the no-event alternative. The readiness predicate also requires the real enabled AFTER ROW User trigger, its function and exact two UPDATE OF columns. Disabled or replaced event coverage refuses preparation. No event marker, artificial User/Listing write, receipt mutation, policy bypass or new framework was added. The existing member optional-pair behavior is unchanged.

## Authored regression and attack coverage

The original direct-UoW suspended no-op case in `PrismaAccountRestoreUnitOfWork.e2e.spec.ts` is byte-for-byte unchanged, including its historical KNOWN KERNEL MISMATCH label and literal untouched expectations. That label describes its original checkpoint; the new migration is intended to resolve it. It has not run.

Nine new kernel SQL scenarios cover untouched restore, actual same-value UPDATE OF, actual changed restore, complete/one-conversation/audit suppression, disabled real trigger, and caller-forged conversation/audit writes. They check sorted lock keys, both membership and assignee-only Businesses, exact audit projections, foreign conversation/audit retention, unchanged User/Listing/member state where applicable, rollback and receipt absence. The existing genuine consumed proof/report account scenario now also exercises direct no-op restore and same-value UPDATE OF over a persisted Business assignment, preserving the consumed binding, report retry fields, raw records, anchors and foreign Listing. Its existing assertions remain.

These are authored SQL cases, ZERO executed. Fault-injection DDL exists only inside the authored disposable SQL suite. No E2E module was imported or run. Offline tests do not certify PostgreSQL catalog planning, trigger order, snapshots, application-role execution or concurrency.

## Permitted offline evidence

- Configured contracts and DB builds passed. Prisma generation/validation used only the unreachable `postgresql://offline:offline@127.0.0.1:1/offline` config, without connecting.
- Configured DB unit tests passed: 119 Vitest cases and five offline process-lifetime cases. The configured exclusions omit E2E files and SQL tests.
- Configured focused API unit tests passed: 53 cases across AccountTransactions, DeleteMe, RecoverAccount, ConfirmAccountDeletion and PrismaSessionRepository.
- Both configured DB/API compilers passed, including compilation of authored E2E sources without importing or executing them. DB/API lint passed with zero warnings.
- Diagnostic/campaign/Business schema-profile invariants passed. The prior User INSERT test is pinned to its historical schema inventory; the new test owns the new additive snapshot and verifies exact mirror/checksum and rejection of an omitted addition.
- Installed pglast parsed five top-level statements, two PL/pgSQL bodies and one SQL body. This is grammar only.
- Runtime imports, documentation links, glossary and whitespace/preservation checks passed. The initial runtime-import attempt preceded completion of the DB build and failed on missing ignored dist output; its log remains beside the passing rerun. The first new profile test failed on the not-yet-created migration file. That is setup evidence, not a behavioral SQL red run. SQL red/green execution is prohibited in this task.

Exact commands, logs, hashes, final commit/tree, pushed checkpoint and recovered full account scope are returned in `/tmp/897-b1-account-noop-enquiry-correction-20261024-handoff.md`. The copied 42-log account recovery and its parent receipt remain untouched.

## Remaining obligations

Parent owns source review/disposition and assembly into sole PR904. The account caller checkpoint still requires hosted real SQL/role/trigger/lock/concurrency proof, including its complete schedule/restore graph, rollback, enquiry, consumed/foreign retention, restore race and deletion/bootstrap scenarios. The accepted lock-wait loser `diagnostic_source_graph_changed` safe refusal remains unchanged, with no retry.

The full caller/admission objective remains the existing six groups: effective DB protocol; remaining Session refresh/expiry/logout, TOTP, staff, User purge and Business; Listing/publication/admin complete transactions; diagnostic intake/capture/grants/bindings/reports/proofs/material and read prefixes; service/measurement/video/worker erasure and expiry union; supported fixtures/bootstrap and matched guard/anchor/application/SQL automatic admission. Ordinary authenticated automatic 201 requires genuine user-ended grants before BOTH first captures. No-grant/legacy/late/erased grant, both-side ABA, consent, independent comparative, foreign/erasure/consumed retry minima, absent-key/phantom/cascade and receipt attacks remain required. Activation and acceptance await the full assembled candidate and parent-owned evidence.

No existing migration or retained SQL changed. Source aliases, configuration, five-second assertions and B5 pins remain unchanged. B5 observation UNUSED, cause UNKNOWN, historical remedy cap exhausted. Founder removed only the implementation retry cap; operational gates remain. No SQL/HTTP/E2E/service/Docker/native/browser/device/CI/collector/deployment/reset/reseed/bootstrap/signing/store/merge/Railway action occurred. Docs: not applicable, internal SQL/source correction using existing operations and installed tooling, with no dependency or external-service change.
