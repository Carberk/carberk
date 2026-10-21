# Diagnostics bootstrap contract for the first test slice

Design handoff for #901 under #897 / PR904. Base: `b1bb1b525713c238bc29db4ea8da5072d525940d`. Reservation branch: `agent/issue-901-diagnostics-bootstrap-contract-20261021`. This is a proposal for root approval. It does not authorize source, schema, fixture-controller, Railway, provider, or hosted activation.

## Slice boundary

The first owned slice is one synthetic template publication, one private intake, and reset. It uses `coordinator`, `reception-steward`, and `buyer-a` from the already selected reservation. It proves ordinary HTTP auth and the first diagnostic gate only. It does not allocate another reviewer, create reports, upload bytes, run workers, or activate a center.

The RED boundary is the ordinary `POST /api/v1/diagnostics/centers/:centerId/templates` request with expected version `0`. At the base, `diagnosticRuntime` rejects because `DIAGNOSTIC_SYNTHETIC_ENABLED` defaults false and admission is a configured UUID set (`apps/api/src/modules/diagnostics/infrastructure/diagnosticRuntime.ts:5-14`). `publishTemplate` reaches `DiagnosticAuthority.current` before center authority, so this refusal currently masks qualification. The first later source slice may add the reservation-aware admission below; the next slice may add this bootstrap contract. Do not insert center or qualification rows to make RED pass.

## Owned center identity and provenance

The center identity is deterministic and reservation-bound:

```
centerId = uuid("campaign897:diagnostics:center:<reservationId>:<candidate>")
centerCode = "campaign897-<reservationId>-<candidate[0:12]>-diagnostics"
```

`uuid` is the repository helper in `scripts/staging-remote.mjs:34-37`: SHA-256 of `<reservationId>:<label>`, take 32 hex digits, format with version nibble `4` and variant nibble `a` exactly as that helper does. Do not use a different UUID algorithm. Roster IDs use the full-v3 business profile derivation in `scripts/staging-campaign.mjs:238`, not the v1 alias derivation. `<reservationId>` is the fixed reservation identifier in the namespace manifest, and `<candidate>` is the full 40-hex serving commit. The writer must compare the computed pair with the stored row under a transaction lock. Any preexisting id or code, even an exact-looking pair, refuses unless the exact row is already journal-owned by this reservation and matches its last recorded hash. A match in another namespace never authorizes adoption. Lost fixture-response replay reads the existing journal and pair; it performs no insert or qualification extension. A row whose `operationalApproval` is non-null is foreign or operational and also refuses.

The row is synthetic preparation only: `names` contains bounded synthetic labels, `planCode` is `standard`, `operationalApproval` is `null`, and no real address, operator, legal approval, staff identity, or physical qualification is inferred. `synthetic=true` on the template and order remains the source-level marker (`packages/db/prisma/schema.prisma:1354-1366,1384-1418`). A synthetic center row never implies a real center approval.

## Fixed qualification tuples

The fixture owns exactly these center assignment tuples, each with a non-null future validity:

| alias | capability | center | qualification |
|---|---|---|---|
| `reception-steward` | `diagnostics.reception` | derived center | `qualifiedUntil = qualificationDeadline` |
| `reception-steward` | `diagnostics.templates` | derived center | `qualifiedUntil = qualificationDeadline` |

The current staging reservation has **no expiry** (`docs/agents/shared-staging-controls.md`, Authority and persistence). A nonexistent reservation expiry cannot supply authority. Proposed narrow new protected namespace binding: `{reservationId,candidate,centerId,issuedAt,qualificationDeadline,provenanceVersion}`. Sample PostgreSQL server UTC time after table locks and namespace fence; set `issuedAt` to that sample and `qualificationDeadline = issuedAt + interval '2 hours'`. Both qualification rows use that exact timestamp. Two hours is a proposed synthetic test execution window, not a real qualification or reservation lease duration, and requires root approval. No renewal or fallback is allowed. Expiry requires reset and a separately approved new reservation, never automatic reallocation.

Every admission must require the same full candidate, active `identities` manifest, intact binding/journal/function hashes, and server time strictly before that deadline. Reset closes admission before deleting rows, so lifecycle change invalidates the qualification immediately even before its deadline. `qualifiedUntil` must equal the binding deadline and remain later than server time at bootstrap and each use. API qualification checks must retain their current clock semantics; the SQL boundary independently checks PostgreSQL time. Missing or inconsistent time/binding refuses. The database column is nullable, but `DiagnosticAuthority.center` already requires `qualifiedUntil > this.runtime.now()` and rejects null/expired values (`apps/api/src/modules/diagnostics/infrastructure/DiagnosticAuthority.ts:20-28`; schema `packages/db/prisma/schema.prisma:1368-1382`). A candidate mismatch, `cleaning`/`disposed` lifecycle, missing roster user, suspended/deleting user, duplicate tuple, or foreign center reference refuses before any insert.

Mapping D remains fixed for later slices: public `independent-reviewer` gets reception/templates/reviewer qualifications and matching HTTP grants; public `technician` gets technician qualification/grant. Private `reception-steward` gets reception/templates and private `private-reviewer` gets technician/reviewer. Do not insert the later tuples in this first slice. Coordinator has no diagnostic qualification and no diagnostic self-grant. Order assignments remain separate ordinary writes.

This authority is narrower than a staff grant. Coordinator still grants `diagnostics.reception` and `diagnostics.templates` through ordinary HTTP after email OTP and TOTP elevation. The graph plan explicitly leaves center/qualification bootstrap UNAPPROVED and identifies this exact first slice as the bounded follow-up. That scope supports proposing synthetic qualifications, not claiming an existing operational issuer. Root must explicitly authorize the protected fixture transaction as issuer of these two test-only facts before source assignment. There is no existing production qualification issuance API. Provenance is recorded in the protected binding and bootstrap audits, never as real center approval. It must never create a Session, OTP, TOTP, capability grant, admin role, JWT, provider override, or global allow-list entry. `DiagnosticAuthority` continues to require the current user, current staff grant, current qualification, and (for order work) order assignment.

## Trusted admission

Follow the existing Support admission shape without copying its service allow-list. The diagnostics request enters the ordinary controller and authentication pipeline. Inside the owning transaction, a diagnostics admission helper derives the namespace from the stored roster email grammar and serving candidate, verifies the reservation manifest (`profile=campaign897-full-v3`, delivery version `3`, current candidate, lifecycle `identities`), takes reset-compatible sorted table locks before the bounded namespace advisory lock, and calls a reservation-owned SQL authority function. Its definition hash must match the manifest, as Support verifies `service_contract_hash`; missing, altered, or stale contracts refuse. The function must prove the subject's user id and Session belong to this reservation and candidate, then prove the exact center binding, qualification deadline, and any requested template/order graph are journal-owned before returning admission only for this diagnostics slice. The reception-candidate lookup cannot fake a Session with `sessionId:""`; replace that predicate with a transaction-local peer-ownership check under the caller's trusted admission, while retaining candidate grant and qualification checks. Neither an empty Session nor an email alone can admit an acting request. It must not widen `diagnosticRuntime.syntheticAllowed`, accept arbitrary configured UUIDs, or bypass ordinary grants and authorization. The Support analogue is `CampaignServiceAdmission.begin/admit` (`apps/api/src/modules/service-messaging/infrastructure/campaignServiceAdmission.ts:12-49`).

The exact grant route is `POST /api/v1/staff/grants` with `{targetUserId, capability, grant:true, reason}`; coordinator needs current `staff.manage`, matching live Session and TOTP elevation and cannot target itself (`PrismaStaffAuthority.ts:25-49`, `staffPolicy.ts`). Reception independently enrolls/elevates through normal TOTP. No auth expiry is edited. HTTP behavior is therefore: ordinary signed-in coordinator grants; ordinary signed-in reception publishes; ordinary signed-in buyer creates the private intake. Wrong reservation, wrong candidate, wrong alias/capability, unqualified staff, missing Session, foreign center/template, and stale validity all refuse with no diagnostics or journal writes. Reception auto-assignment must use the existing query predicates for active grant, non-revoked assignment, future qualification, and synthetic admission (`PrismaDiagnosticIntake.ts:61-78`).

## First-test literal ledger

Literal first-test ledger uses the graph plan's measured simple-auth cost, S=3/K=2/G=2. Baseline is 21 bootstrap records/events. Three fresh email sign-ins add 6 records/12 events, two first TOTP enrollments add 22 records/26 events, and two HTTP grants add 4 records/4 events. Auth subtotal is **53 records / 63 events / 3 deliveries**. Diagnostics below adds **11 records / 11 insert events**, giving **64 records / 74 events** pre-reset. The existing coordinator bootstrap grants remain unchanged; no diagnostic capability is bootstrapped.

Namespace provenance/binding records are control metadata, outside public application record accounting, and still require schema/contract fingerprinting. No omitted public audit may be hidden there.

| operation | owned rows | audit/event rows | retained at reset |
|---|---:|---:|---|
| center bootstrap | 1 `diagnostic_centers` | 1 `diagnostic_audits` (`CENTER_SYNTHETIC_BOOTSTRAPPED`) | no, unless retention decision below is approved |
| two qualification tuples | 2 `diagnostic_center_assignments` | 2 `diagnostic_audits` (`CENTER_QUALIFICATION_SYNTHETIC`) | no, unless retention decision below is approved |
| coordinator HTTP grants | 2 new `staff_grants` rows | 2 new `audit_logs` grant audits, included in auth subtotal | existing campaign redaction/tombstone policy |
| template v1 publish | 1 `diagnostic_template_versions` | 1 `diagnostic_audits` (`TEMPLATE_PUBLISHED`) | no |
| buyer-a private intake | 1 `inspection_orders`, 1 `diagnostic_order_assignments` | 1 `diagnostic_audits` (`INTAKE_CREATED`) | no |
| duplicate same request key | 0 | 0 | n/a |

Proposed bootstrap audit shape is exact: `actorId=null`, `orderId=null`, `centerId=derived center`; one `CENTER_SYNTHETIC_BOOTSTRAPPED` and two `CENTER_QUALIFICATION_SYNTHETIC` rows. Details allow only `{profile:"campaign897-full-v3",provenance:"synthetic-test-only-v1"}` for center, plus `{capability,userId}` for each qualification. User references must match the fixed roster tuple. No reason text, contacts, credentials or operational claims. Center and qualification audit IDs use `uuid("campaign897:diagnostics:audit:<kind>:<capability-or-center>:<candidate>")`; assignment IDs use `uuid("campaign897:diagnostics:qualification:reception-steward:<capability>:<candidate>")`. Bootstrap inserts and audit pairing commit atomically; audit failure rolls back all bootstrap writes.

The first request key is `uuid("campaign897:diagnostics:intake:issue901-private-intake-v1:<candidate>")`, using the exact reservation-prefixed `scripts/staging-remote.mjs` helper above. `issue901-private-intake-v1` is a derivation label, never the wire value. `DiagnosticCreateSchema.requestKey` remains UUID-validated. Use the identical derived UUID for the first, duplicate, and changed-payload requests. A changed payload with that key must return the existing order only when center, template, audience and listing match; otherwise it returns the existing idempotency conflict (`PrismaDiagnosticIntake.ts:55-64`). The private order has no publication authorization and no listing requirement. No evidence, report, PDF, storage object, worker row, or provider call exists in this slice.

## Reset, audit disposition, and unresolved decision

Reset must use sorted `SHARE ROW EXCLUSIVE` table locks before the namespace fence with existing 5s lock/20s statement bounds, verify schema/journal/event hashes and scan all incoming FK references including external schemas. Reject any report, evidence or artifact under this center/order because they are outside this slice. Then verify the exact candidate and row ownership, then delete children in this order: `diagnostic_order_assignments`; `diagnostic_audits` for owned orders; `inspection_orders`; `diagnostic_template_versions`; remaining owned `diagnostic_audits` for the center; `diagnostic_center_assignments`; `diagnostic_centers`. This order follows the current restrictive foreign keys (`packages/db/prisma/schema.prisma:1354-1462`; migration `packages/db/prisma/migrations/20261015070000_diagnostic_intake/migration.sql:77-159`). A foreign order, audit, template, assignment, or center reference causes refusal and preserves the foreign graph.

Current schema cannot retain a diagnostic audit after deleting its center or order: both `centerId` and (when present) `orderId` are restrictive foreign keys, while `actorId` is `SET NULL`. Therefore this slice proposes **no retained `diagnostic_audits` rows**. Bootstrap audit cost is the three rows above, and they are deleted with the owned graph. The governing choice remains open: if #901 requires retained redacted diagnostic audit tombstones, root must approve a schema/retention design that gives them a durable parent or nullable center reference. Do not silently retain them, repurpose `operationalApproval`, or claim a legal retention period. Existing campaign `audit_logs` and OTP delivery tombstones keep their own redaction and retention rules.

After deletion, the reset receipt must show the derived center, its two assignments, template, order, order assignment, and all five diagnostic audits absent; the reservation manifest is `disposed` and its journal retains exact historical key/event accounting and terminal hashes; deleted keys still count. Application retained rows are exactly **4 redacted `audit_logs`**: the 2 existing coordinator bootstrap audits (`staff.manage`, `founder.control`) and the 2 HTTP diagnostic grant audits, with existing campaign actor-null/`SyntheticCampaign` disposition. All 11 diagnostic rows and the remaining auth rows follow the existing campaign reset deletion/redaction procedure. Preserve the 3 email delivery tombstones and namespace terminal receipt under existing rules; these are not new application rows. No diagnostic audits remain. Reset mutation/event counts must be measured by the existing campaign tracker, including deleted keys and audit redaction; do not claim a guessed total. This exact ledger excludes extra refresh, resend, denied-auth attempt, revocation or cleanup work. Full scope fit stays UNKNOWN.

A lost reset response may be replayed observe-only. A stale candidate, changed reservation, or foreign reference must refuse before deletion.

## Decisions root must make

1. Approve the exact center id/code derivation and synthetic `operationalApproval=null` provenance.
2. Approve the new protected server-issued two-hour synthetic qualification binding, since reservations have no expiry. Approve lifecycle/candidate invalidation and refusal on expiry without renewal.
3. Approve deletion of all owned `diagnostic_audits` in this first slice, or supply a schema-backed retained-tombstone design. No legal retention duration is selected here.
4. Approve the trusted reservation-aware diagnostics admission seam and its SQL contract hash, with ordinary HTTP grants preserved.
5. Keep the fixed 128 record / 2048 event caps and `complete fit UNKNOWN`; later report, evidence, PDF, reinspection, and worker slices need their own measured ledgers.

## Source evidence

- Diagnostics ownership and separation: [`apps/api/src/modules/diagnostics/CONTEXT.md`](../../../apps/api/src/modules/diagnostics/CONTEXT.md).
- Existing allocation and first RED prediction: [`full-v3-diagnostics-graph-plan-20261020.md`](full-v3-diagnostics-graph-plan-20261020.md), allocation and first RED proposal.
- Fixed mapping D and unknown bootstrap cost: [`full-v3-diagnostics-capacity-disposition-20261021.md`](full-v3-diagnostics-capacity-disposition-20261021.md#L86-L101).
- Center, assignment, template, order, audit schema and FK behavior: [`packages/db/prisma/schema.prisma`](../../../packages/db/prisma/schema.prisma#L1354-L1462) and the intake migration.
- Current authority and intake checks: [`DiagnosticAuthority.ts`](../../../apps/api/src/modules/diagnostics/infrastructure/DiagnosticAuthority.ts#L16-L46) and [`PrismaDiagnosticIntake.ts`](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts#L55-L78).

## Handoff sequence and checks

Root approves or rejects the four architecture proposals before any test/source assignment. First add one hosted disposable-PostgreSQL test expecting HTTP 201 from the template request through ordinary authentication, with no application provider overrides and no test-inserted qualification. Record predicted base RED as 403 `DIAGNOSTIC_NO_ACCESS`, unchanged diagnostics/journal digest. No hosted run was performed here. Then separate bounded source slices add admission and negative contract checks; atomic synthetic center/qualification bootstrap and ownership tracking; ordinary template/intake adoption and exact reset. Each subsequent root-owned hosted run must show the next actual boundary. Do not weaken expected positive behavior to accept a refusal. Idempotent template replay reads owned `(centerId,version)` and paired audit rather than republishing, because publication uses expected-version conflict rather than a request key.

Offline verification: `git diff --check`, `pnpm check:agent-docs`, source/table/column inspection and single-path review. No runtime, integration, service, Docker, provider, CI or GitHub mutation was performed. The branch was created locally at the supplied base before editing; the requested pre-edit remote reservation push was missed. The later push has not produced a confirmed remote receipt, so neither remote reservation nor pushed checkpoint is claimed.

## Root disposition for the r2 test-only checkpoint

On 2026-10-21 root explicitly selected the center id/code and `operationalApproval=null`, exactly two reception-steward tuples, protected PostgreSQL-server-issued two-hour binding with lifecycle/candidate invalidation and no renewal, and trusted reservation-aware admission patterned on Support with ordinary auth/grants retained. Root selected exact deletion of all eleven diagnostic rows, including five diagnostic audits, with historical control journal/terminal proof retained. Existing four redacted application audits and delivery tombstone disposition remain. These selections supersede the open proposal language above for TEST EXPECTATIONS ONLY. They authorize no source/schema/fixture implementation before hosted RED and a separate source assignment. No real qualification, legal retention or live activation is claimed. Mapping D, caps 128/2048 and complete fit UNKNOWN remain fixed.

Root resolved the prior request-key mismatch as a routine test-contract correction. The UUID derivation above preserves the existing schema and ordinary idempotency comparison. The prior plain literal fails UUID validation; that evidence remains valid but is no longer a stop condition. The r2 writer reserves `agent/issue-901-diagnostics-bootstrap-tests-20261021-r2` at `c704d02a0880d9f8284c7354fefd9cacc3e3219c` before edits. Root owns hosted RED/GREEN, source assignments and sole PR904 assembly.
