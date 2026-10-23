# Classified forward ownership capture receipt

Bounded implementation for selected #897/#914, sole [PR904](https://github.com/Carberk/carberk/pull/904). Source is pushed for parent assembly. This is not independent review, hosted SQL acceptance, automatic admission, #923 completion or release acceptance.

## Checkpoints and authority

| Item | Exact value |
| --- | --- |
| Owned worktree | `/Users/bagtyyar/.t3/worktrees/carberk/t3-aaa070dd` |
| Scaffold | `t3/aaa070dd` |
| Reserved and pushed branch | `agent/issue-914-classified-forward-capture-20261023` |
| Supplied base | `464f79c0ea024aa45e36a34b0b444bed38646b06` |
| Supplied base tree | `aa84596bb6acdf0e8b5f5fe530cb91523ff6431d` |
| Pushed behavioral RED before source | `c0b5b8e85c7ab1efc1c65cdf9e0ab5c09f93631e` |
| Pushed implementation checkpoint | `6f17e48170b784fb47e1f9e7e6075754e2c87752` |
| Implementation tree | `a2d7e257d5e7ce7142dbbd2d52855dafe0f779f2` |
| Pushed source plus hosted test completion | `38330289b7e7e9e0aa1414a3b9196ff021abcc0b` |
| Source plus tests tree | `8161461060c2da34db4dc461a8b3a20eb7bc2221` |

Governing source brief and matrix were read with `git show a36890cda876907f49122aa536d77a5cccd135b8:docs/evidence/issue-897/public-automatic-classified-capture-slice-plan-20261023.md`. That plan and the in-flight assembly branch were not merged. ADR-0108, feature 50, flow 66, the public automatic contract disposition, independent ownership contract review, domain checkpoint and supported recording-correction approval remain governing. AGENTS, CONTEXT, coding workflow/run-issue, domain/standards/runtime guidance and the database-migrations skill were read before source work.

No new PR, nested agent, integration push, deployment, Railway call, reset, local service, Docker, credentials probe, CI poll or device action occurred. PR904 is linked to this thread and is not watched. Parent owns assembly, independent Standards/Spec review and hosted acceptance.

## Delivered behavior and evidence boundary

The optional strict `ownershipClassification: { rights: DiagnosticIdentityRights }` envelope is separate from `observedVehicle`. Intake parses it before retaining ownership. Available components contain only the server-resolved Listing/digest/seller/commissioner/Business/membership tuple, fixed scope, rights and declaration attribution/time bound to the same raw/order/version transaction. Ordinary authorized observations without a declaration still succeed and store an unavailable component without ownership content. Missing or inactive Business membership stays unavailable. Observation requires no extra current publisher eligibility check.

Tests use explicit SYNTHETIC source-specific declarations covering historical seller, commissioner and member linkage through an authorized end. No documented real-source basis/end was supplied for historical third-party copying. A rights-shaped envelope alone proves no actual right. Ordinary real-service activation gates remain CLOSED. There is no new TTL, hold or permanent personal-hash tombstone.

| Criterion | Offline evidence | Hosted disposable evidence and status |
| --- | --- | --- |
| Classified first personal/Business capture | Focused real intake/controller with DB-boundary fake passes | New HTTP/SQL cases configured; NOT RUN |
| Ordinary observation without envelope, no retained ownership tuple | Focused PASS; existing observation tests unchanged | New HTTP case configured; NOT RUN |
| Unauthenticated/unassigned refusal without writes | Existing authorization behavior preserved | New case requires existing unauthenticated 401 and unauthorized 403; NOT RUN. The plan's unauthenticated 403 wording does not change the existing JWT contract |
| Strict extra/null/malformed envelope and expired rights refuse atomically | Focused PASS for transport/expiry boundaries | New HTTP cases check order/version/raw/audit unchanged; NOT RUN |
| Missing/inactive membership is unavailable, never personal null | Focused PASS | Missing and suspended membership cases configured; NOT RUN |
| Same-visit classified reobservation preserves original anchor | Component appends under existing order/version serialization | New personal/Business HTTP cases check original raw/component equality; NOT RUN |
| Earlier unavailable/missing raw cannot be repaired by later capture | Focused PASS | HTTP later-classification and SQL no-op raw UPDATE attacks configured; NOT RUN |
| Preserve hash v1, date, mileage, original DTO and raw/report pins | Focused PASS; hash/DTO code excludes classification | New HTTP hash/DTO and lifecycle pin checks configured; NOT RUN |
| Reject forged tuple/digest/member/nulls/raw/order/version and rights rewrite | Static schema inventory checks PASS, not SQL execution | New INSERT/UPDATE attacks configured, including receipt tampering and erased resurrection; NOT RUN |
| Component rights end fences reads before cleanup | Restricted SQL projection added; no product/proof reader consumes it yet | Exact end boundary, actual artifact worker and repeat cleanup configured; NOT RUN |
| Historical seller erasure after Listing replacement preserves unrelated C evidence | Searchable historical subject discovery and component-only redaction added | New direct disposal and actual purge cases configured; NOT RUN |
| Replaced member linkage erasure and recorder/declarer detachment | Prefix/disposal source inspected | New lifecycle cases configured; NOT RUN |
| Issuer erasure and consumed proof payload deletion | Disposal discovers issuer and legacy proof subject bindings | New actual purge cases configured; NOT RUN |
| Consumed B exact retry, changed proof rejection, ordinary writes/release/public read | Existing minimal report retry binding untouched | New comparative lifecycle pairs explicitly classify only their own observations; NOT RUN |
| Complete capture/disposal lock discovery and revalidation | Source reasoning below; no DB-boundary fake proves SQL locking | Both winner orderings and forced concurrent waits NOT PROVEN; focused race cases remain to be added/executed in hosted acceptance |
| Original automatic positive201 | Original test unchanged; automatic adapter/admission unchanged | Historical required positive remains RED/closed. No rerun or automatic GREEN claimed; restored-A negatives remain masked |

Focused tests compose the real identity participant lock adapter with intake but fake the database boundary. They establish application behavior, not PostgreSQL triggers, transaction atomicity or lock scheduling. The new hosted suite uses the configured disposable API DB/Redis/storage lane, HTTP-produced diagnostic observations, explicit SQL integrity attacks, and a fenced child-worker transport for actual artifact/purge lifecycle calls. It was compiled/linted, never executed here. Hosted fixture behavior also remains unverified.

## Migration and locking reasoning

One new forward migration, `20261023090000_diagnostic_ownership_components`, adds strict searchable columns and rights JSON. Existing migrations are unchanged. The retained SQL copy, schema hash/inventory and exact reset table/trigger manifest are mechanically updated. No historical ownership content is backfilled.

Component INSERT requires a current raw created in the same transaction, matching order/version/current observation, persisted source tuple and active required membership. Every nullable admission predicate uses an explicit true test. Rights validate against the existing strict vocabulary and their declared end. Available tuples and rights cannot be rewritten; unavailable/erased components cannot resurrect. Erasure clears source IDs, digest, membership linkage, identifying declaration content and attribution. The raw FK/order/version plus nonpersonal state remain.

The raw's nullable server-only `ownershipCaptureTransaction` authenticates forward insertion. PostgreSQL `xmin` alone is inadequate because a permitted later no-op UPDATE changes it. A BEFORE trigger assigns the receipt only on raw INSERT, refuses caller changes, and clears it on raw erasure. Historical raws remain NULL. This trigger changes only its own raw row. It is transaction metadata, not an ownership-history witness, and writes no User, Business, Listing or order.

Capture reuses `DiagnosticPublicBindings.lock`: discover actor/current public commissioner/current seller and Business, acquire sorted User then Business, Listing share locks, order update locks, and revalidate before capture. Membership authority is resolved under that prefix without calling publisher `bind` as observation admission.

Disposal discovers historical seller/commissioner and current subjects, declaration/recorder/staff subjects, current and retained Business/Listing references, connected predecessor/successor orders, reports and proofs. Legacy proof bindings contribute subjects even when no ownership component exists. It then locks sorted User → Business → Listing → whole order set → reports → proofs and revalidates the discovered target JSON before redaction. Expiry selects at most 100 components but never truncates their connected lock graph. Changed discovery refuses instead of acquiring more upstream locks behind an order.

Purge invokes this explicit operation through a MATERIALIZED CTE before its original deleting-User lock and before existing account erasure writes. Expiry invokes it before existing identity retention cleanup. Component subject erasure does not erase unrelated commissioner C's raw evidence or pins. Derived proof rows are deleted even after consumption; B's independent opaque proof-id/orderVersion report retry binding survives. No proof ownership-copy fields were invented because no proof consumes this component yet.

This is source-level reasoning only. PostgreSQL execution, lock waits, deletion/discovery races and SQL/JavaScript digest parity require hosted proof. In particular, SQL VIN normalization uses existing `upper(btrim(vin))` conventions while JavaScript uses `trim().toUpperCase()`; arbitrary Unicode normalization parity is not established. No source-mutating ownership witness or order-writing trigger was added. Broader writer-prefix closure must precede that later milestone.

## Verification and preservation

The initial behavioral RED reached strict request rejection for a valid separately classified envelope, with 1 failed and 2 passed. It was pushed before implementation. The added test later moved from diagnostics infrastructure to identity infrastructure to compose the real participant adapter without a forbidden cross-context import. Final focused offline run passes 10 tests.

Configured offline checks passed: root unit 10/10 Turbo tasks; API 274 files with 2652 passed/2 skipped; worker 42 files/297 passed; contracts 23 files/571 passed; DB offline boundary 5 plus 12 files/119 passed; root typecheck 11/11 tasks; affected API/worker/contracts/DB lint; TypeScript 6 checks for those four packages; contracts and DB builds; API Nest build; runtime imports; root static 598 passed/1 skipped; final schema/reset static 38 passed; agent docs 8 passed. DB generation used placeholder DATABASE_URL/DIRECT_URL only, with no SQL connection. The final hosted-only test additions received API typecheck and focused lint; product source did not change after the root checks.

The first root unit run had five worker timeouts while other broad checks ran concurrently. No timeout budgets or tests changed. Standalone worker and the final root unit run passed. The failed run remains hashed alongside final evidence. An initial DB generation without placeholder URLs refused a missing DATABASE_URL, then passed with placeholders; no database was started or contacted.

Exact local log paths and SHA-256 values are in [the log manifest](classified-forward-capture-logs-20261023.sha256). Empty successful lint/compiler logs intentionally have the empty-file digest. These hashes identify local logs, not hosted artifacts. [The preservation record](classified-forward-capture-preservation-20261023.json) records all 636 existing test files byte-identical to the supplied base, with `changedExistingTests: []`, manifest digest `a66454287b04278564525b000247c51c3acbe2cc871b08da2eeecb238f29193f`. The original public automatic test digest remains `becd2da2a8bb494d0bfb9e57e05f1310e195d0c7b8c2f3cbaf36a07c6584451a`. The original required positive201 and existing fixtures received no implicit ownership classification/backfill. `SafeReplacementScheduling.spec.ts` is unchanged.

## Remaining mandatory gates and proposed overview delta

Parent must obtain hosted disposable HTTP/SQL/storage/lifecycle acceptance and forced lock-race evidence, then independent Standards/Spec review on the assembled candidate. No three-failure cap was exceeded or guard refusal bypassed. No live runtime or release claim is made.

Later automatic work still requires complete writer-prefix closure before any source-mutating order-writing trigger, irreversible visit-local ownership history for BOTH A and B, authenticated initialization/reset/repin guards, complete classified live raw histories with original report pins, SQL parity at issue/consume/report INSERT and reached automatic HTTP positive201. Mutable current Listing equality, raw counts and restored timestamps are not substitutes. The rejected mutable-Listing/raw-count shortcut remains absent. Real source-specific collection basis/end and actual source-right termination handling remain operational rights gates; a synthetic declaration cannot open them.

Proposed short diagnostics overview delta for parent: "Vehicle observation optionally accepts a separately classified ownership declaration. Forward raw-bound ownership components remain restricted, unavailable without a declaration or complete source membership, and unusable for automatic proof admission. Observation hashes and original report pins retain their current contract."

Proposed short worker overview delta for parent: "Identity maintenance expires classified ownership components at their own rights end. Account purge discovers historical seller/member subjects before redaction, clears affected derived proof payloads including consumed payloads, and preserves unrelated vehicle evidence plus minimal consumed-report retry bindings."

No shared CONTEXT/overview/specification file was edited. Parent should apply those short overview deltas during sole-PR assembly after review.
