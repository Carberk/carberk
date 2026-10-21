# Full-v3 contact-phone source handoff

Implementation writer for #901 under #897/PR904. Exact supplied base `de85955a479bdb88f4488d4cb0560a62f8fc04c0`; host checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-0d584abb`. Scaffold `t3/0d584abb` remains at that base. Reserved and pushed `agent/issue-901-v3-contact-phone-source-20261020` before edits. The inherited coordinator implementation, including both deferred promotion triggers, is preserved. No edits to `CampaignFullV3.e2e.spec.ts` or any other writer's handoff.

Pushed offline RED checkpoint `db4be8cc`. Pushed implementation checkpoint `bfcd83cfa9f675895907ceb35e0791cc46c5b377`. The final handoff checkpoint includes this document and the response-privacy fix described below. Root owns assembly, the unchanged hosted test, independent reviews and acceptance. No PR, child, service, database, Docker, integration suite, CI, staging, provider operation or operational configuration change was started. Git reservation/checkpoint pushes were the authorized remote writes.

## Reached evidence

Root supplied hosted contact RED on `9b2938e186d2b1eb2cbeabeaba7c585fd1d96c6f`, API run `118721265076`, `/tmp/carberk-next-release-20261020/9b2938e1/api.plain.log`, lines 2469–2492, 2546–2563 and 2755 onward. Ordinary contact request at spec line 1170 expected 200 and received 500, `Unsupported campaign OTP`. Setup reached the admitted active Owner. All seventeen original cases, including membership/reset, passed. This writer did not rerun that hosted execution. Generated SMS, verification, reuse, collision refusal and contact reset were masked behind the request failure; none is reported as hosted GREEN here.

First actual offline RED: before production edits, ran `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/infrastructure/HttpOtpSenderAdapter.spec.ts -t 'refuses missing internal'`. One test failed because `send` resolved instead of refusing missing metadata, eleven skipped. Committed and pushed that failing test. The same control is GREEN in the final focused suite. Later storage-boundary controls supplement this RED; they do not establish additional hosted REDs or PostgreSQL behavior.

A second test-first slice found that the ordinary test-mode response could expose a campaign code. Before changing that response, ran `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/application/IssueContactPhoneCode.spec.ts -t 'keeps campaign codes private'`: one failed because `testCode` was present, six skipped. Pushed failing-test checkpoint `63892e50`. The fix emits `testCode` only for ordinary admission; campaign codes remain protected even if ordinary test mode is enabled. The same test is GREEN in the final suite.

## Implemented source contract

- Full-v3 derives `+9936` plus seven zero-padded decimal digits from the entire SHA-256 ASCII digest of `campaign897-contact-phone-v1:<reservation>:<full candidate>`, modulo 10000000. Existing strict lowercase reservation/candidate validation precedes derivation. The design's `e1`/`a` vector produces `+99367752052`. There is no reroll, global registry or public phone receipt.
- Only fresh full-v3 DDL adds `campaign_sms_binding`, `campaign_sms_ledger`, `campaign_sms_sink` and the fixed `campaign_sms_authority(text,text,text,text)` read contract. Binding begins with exact reservation/candidate/destination and null business/Owner. First admitted contact INSERT fills those IDs once from the adopted active synthetic business and redeemed buyer-a Owner. Ledger retains full ordinary request ID, reservation, full candidate, destination, business, Owner, stored purpose, generated-code SHA-256 and original issue-row MD5. Sink stores only full request ID and approved rendered text, FK-bound to the ledger. No Prisma schema or migration changed; old/missing contracts refuse without upgrade.
- Manifest hashes bind SMS binding/ledger data, SMS table columns/constraints and the authority function definition. Existing journal/event/tracking hashes remain effective. Delivery inventory accounts separately for email and SMS and rejects unaccounted OTP records. Active/cleaning scalar inventories reject foreign phone references; disposed inventories do not demand permanent global absence of this destination.
- Preparation inventories User phone, every-purpose OTP phone/destination, personal verified phones, Dealership contact and Listing contact at the derived destination under existing graph table locks. Each v3 trigger checks OLD and NEW phone references before the foreign-row early return. Foreign matching references refuse without adoption, deletion or a second namespace fence. Personal proof, phone Sign-in Methods, Listing reuse and all other OTP purposes remain closed. Prepared-unused receipts do not establish global exclusivity; another active namespace's trigger refuses colliding use.
- `OtpRequestRepository.reserve` now returns required `smsDelivery`: `{kind:'ordinary'}` or `{kind:'campaign',reservationId,candidate,namespace,requestId}`. It clears transaction-local `carberk.campaign_sms_binding` before INSERT. Only the validated/journaled contact INSERT trigger sets its exact marker. Repository decoding rejects malformed/extra fields, nonmatching identity/request/channel, missing authority and lookup errors, then validates the exact durable function/binding/hash in the same transaction. Only a successful unmarked INSERT returns ordinary admission.
- `IssueContactPhoneCode`, `RequestOtp`, `RequestSignInMethodChange` and `RequestAccountDeletion` forward their own reserve result directly in required `OtpSms.smsDelivery`. HTTP inputs/responses do not carry it. Other purposes receive no campaign phone permission. The shared in-memory repository fake and four existing expected SMS values mechanically follow this internal port change.
- `HttpOtpSenderAdapter` strictly validates carrier keys/grammar, full request, contact purpose, mock driver and serving `AUTOTM_COMMIT_SHA`. It derives the namespace solely from that carrier, takes the existing single namespace advisory fence, checks the function's retained hash outside the function as well, then revalidates full lifecycle/candidate/binding/current OTP and business/User journal hashes, active Owner, code hash, issue hash, attempts and expiry. It writes the protected rendered sink synchronously and requires byte-identical content on retry. Missing namespace, changed/deleted/terminal authority and storage errors propagate without logger/provider fallback. Ordinary delivery requires a matching live unused request, using injected time; missing requests are never permission to log/send.
- Existing destination-then-IP reservation locks, sorted graph/incoming-FK locks before namespace, source lock settings and fixed 128/2048/128 budgets are preserved. Sender takes no explicit public table lock or row lock after its fence; authority reads use MVCC, and writes touch only the private sink. No retry or timeout policy was added.
- Business confirmation permits only contactPhone/contactConfirmedAt/automatic updatedAt changes on the admitted active bound business after a journal-owned consumed matching contact OTP. Ordinary application/context/Owner checks and consumption-before-proof remain. No contact audit is invented. A v3-only `campaign_events.contact_phone` boolean marks this existing UPDATE event so Dealership version inventory counts contact changes independently of real membership/settings audits, including later reconfirmation. It does not add an event or application record. Wrong-attempt and consume updates may change only attempts/verifiedAt/automatic updatedAt; code, destination, purpose and bindings remain fixed.
- Reset still commits cleaning under existing locks before delivery cleanup, keeps email exact-ID queue/tombstone semantics, and deletes SMS sink rows before graph deletion. Terminal binding, ledger, hashes and journals remain; rendered text/code does not. Repeated/lost-response reset validates terminal authority without blocking fresh unrelated phone reuse. A delayed campaign carrier remains routed to its terminal namespace and refuses, even after OTP/User disposal. No SMS job, queue receipt, dedup tombstone, personal proof, Session, role, grant or authentication bypass is added.

The Identity overview now names the required internal carrier, synchronous sink and activation limit. Listings/worker ownership and their overviews remain accurate. No package export/import boundary or runtime package contract changed.

## Exact offline checks

All listed checks passed in this owned checkout unless a prior failed attempt is explicitly described above or below.

- `pnpm install --frozen-lockfile --offline`: 2034 packages reused, zero downloads.
- `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm --filter @auto-tm/db build`: generated Prisma and built the existing runtime package. The inert port-1 configuration satisfied generation only; no connection or SQL execution.
- `pnpm --filter @auto-tm/contracts build`: passed prerequisite build.
- `pnpm --filter @auto-tm/api typecheck`: TypeScript 7 passed.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: TypeScript 6 passed.
- `pnpm --filter @auto-tm/api build`: passed with Prisma and Clock injection in the sender.
- Focused ESLint on all fifteen changed/new TypeScript implementation/spec files, `--max-warnings 0`: passed.
- Focused offline Vitest command below: six files, 74/74 passed, zero skipped. Storage, time, delivery and logger are the only faked boundaries. Repository controls cover exact carrier, pooled-setting clearing, malformed markers, missing binding and lookup failure. Sender controls cover absent carrier/request, protected rendered output, identical/lost-response retry, conflicting locale/content, changed candidate/destination/request/code/purpose/namespace, gateway refusal and storage-reported terminal refusal. The four real issuance use cases preserve their existing ordinary controls and forward required metadata. The contact case also forwards an exact campaign carrier and proves response privacy with ordinary test mode enabled.
- `node --test scripts/staging-campaign.test.mjs scripts/staging-control.test.mjs`: 45/45 passed, zero skipped. These existing pure controls validate serialization and operational control behavior, not SQL execution.
- `node /tmp/issue901-contact-generated-comparison.mjs`: six v1/v2 fresh/retry/reset captures are byte-identical to exact base, including receipts. V3 generated output preserves both coordinator deferred triggers and candidate-bound promotion behavior. It contains all three literal phone vectors, rejects uppercase derivation inputs and changes the phone when the full candidate changes. Captured `/tmp/issue901-contact-v3-generated.sql` and `/tmp/issue901-contact-v3-reset-generated.sql` are SQL text only. No PostgreSQL parser/server was run.
- `node --check scripts/staging-campaign.mjs`, `pnpm check:agent-docs` and `git diff --check`: passed.

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run \
  src/modules/identity/infrastructure/PrismaOtpRequestRepository.spec.ts \
  src/modules/identity/infrastructure/HttpOtpSenderAdapter.spec.ts \
  src/modules/identity/application/IssueContactPhoneCode.spec.ts \
  src/modules/identity/application/RequestOtp.spec.ts \
  src/modules/identity/application/RequestSignInMethodChange.spec.ts \
  src/modules/identity/application/RequestAccountDeletion.spec.ts
```

One intermediate test run caught a local test-helper name collision; corrected before GREEN. The first caller regression run had four expected-object mismatches from the newly required metadata; those expectations now include ordinary admission. These were offline development failures, not newly reached lifecycle REDs. Source inspection caught automatic OTP `updatedAt` and pre-journal INSERT visibility requirements; mutation guards allow that automatic field and the trigger's scalar inventory exempts only its currently validated INSERT until it journals it.

Docs: not applicable to external lookup. This internal contract reuses checked-in Prisma transaction/raw-query, PostgreSQL trigger/fence, Nest injection and approved SMS-rendering conventions; no dependency or external service contract changed. Full repository/hosted gates belong to root; broad suites were not repeated here.

## Remaining gates and handoff

| Criterion | Evidence | Result |
|---|---|---|
| Missing carrier refuses without logging; exact internal metadata travels through issuance | Actual offline RED then focused real sender/repository/use-case controls | Offline pass |
| Deterministic vectors and v1/v2 preservation | Generated SQL/receipt comparison | Serialization pass only |
| SQL compilation, normal HTTP generation/sink/verify/reuse/refusal/reset and fresh-phone reuse | Unchanged hosted contact case on assembled final candidate | UNKNOWN, root-owned |
| Sender-first/reset-first ordering, two-connection collisions, malformed/missing storage and old-carrier refusal after real disposal | Real repository/adapter plus sanctioned SQL scheduling | UNKNOWN, B2/root-owned |
| Wider Sales/wrong-purpose/business, expiry/resend, suspension/deletion/stale-session and full joined journey matrices | Service-backed ordinary setup | UNKNOWN until reached |
| Pre-preparation ordinary sender drain or separately authorized admission fence | Operational readiness evidence | Activation gap, root-owned |

The new units do not prove the SQL function, triggers, database rollback or concurrent lock scheduling. A real sender-first/reset-first interleaving, missing/changed namespace behavior, exact retained metadata after reset, whole hosted suite and independent Standards/Spec reviews remain required. Source predicts progress through the prior 500 barrier; no hosted GREEN is claimed.

Pre-preparation ordinary producers remain a named activation gap. A live-row read has a check/send race and cannot fence an ordinary producer admitted before preparation. Root must bound/drain those producers before activation or authorize a separate justified admission fence. No permanent phone registry, universal isolation claim or operational change is substituted here.

Application count prediction remains one OTP record; INSERT, consume and business UPDATE events, plus the unchanged contact test's wrong-attempt UPDATE; reset adds one OTP DELETE. Protected SMS binding/ledger/sink counts are separate. Existing source caps, baseline guard and ordinary auth/context/throttle rules remain. No full-B capacity, deployed acceptance or complete metadata-erasure claim follows.

Stop at this pushed source handoff. Root runs the same hosted test on the assembled candidate, reconciles B2's real-carrier race tests and obtains final independent reviews. The inherited coordinator source and every unrelated checkout/ref remain preserved.
