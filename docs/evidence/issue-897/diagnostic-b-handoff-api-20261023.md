# B-owned continuity handoff API checkpoint — 2026-10-23

Bounded #923 implementation within founder-selected #897 and sole integration [PR #904](https://github.com/Carberk/carberk/pull/904). This is a source/offline milestone, not full #923 shipping or hosted acceptance. Authority is the final founder approval in [staff foundation disposition](staff-foundation-disposition-20261022.md), #923 and ADR-0108. No issuer/publisher powers or full pair-read access were added. #915 remains blocked.

Owned worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-806f5c0f`. Reserved/pushed branch: `agent/issue-923-b-handoff-api-20261023`. Host scaffold `t3/806f5c0f` stays at supplied base `7b70288d613c3d833feeda5070a2fe8f794c05d2`, tree `6d63a82b84f1565cd996a011fe12ff14e8a58962`. RED checkpoint `0f95f63d`; source GREEN checkpoint `966d3807753378aae8dbecd0d7cd854027d42eeb`, tree `dee0135dd85561f0169084e24c37974460b1e8d8`. The subsequent evidence-only checkpoint carries this receipt. No extra PR, integration push, nested agent, deployment, Railway attempt, reset, CI polling/rerun, credential/quota access, device/emulator/native build/signing or store action occurred. Only required contracts/DB package generation/build ran; no local services or disposable-service suites ran.

## Minimal field and actor matrix

| Surface | Current actor | Exact new fields |
|---|---|---|
| `GET orders/:id/continuity-handoffs` | Qualified, granted, live-Session technician currently assigned to B; each unused handle additionally selects that technician | Envelope `handoffs`, `result`, `nextCursor`, `scope: current_b_owned_handoffs`; each handle only `proofId`, `status: usable`, `expectedOrderVersion` |
| Existing B result in that envelope | Same current B authority; persisted B report author must equal actor, B report unerased and bound to a consumed proof | `result: { proofId, reportId }` or null; never reruns A admission |
| `POST orders/:id/continuity-handoffs/:proofId/consume` | Selected current B technician, with complete current locked pair/issuer admission for first use | Strict B-owned input `reportId`, `expectedOrderVersion`, `reason`; response only `{ reportId }` |
| Exact command retry | Same current B authority and original report author | Same proof/report/order-version/reason binding; changed binding conflicts; A binding resolved from persisted report under B lock |
| Restricted full proof, comparison, history, provenance | Existing independent A/B authority | No new fields or grants; full proof read implementation unchanged byte-for-byte |
| Dual-assigned reviewer without B technician capability | Existing issuance/full-read authority only | New B handoff route refuses; scoped eligible B technician naming remains the preceding slice |
| Another current B technician | B authority alone | Empty handoff/result projection for someone else's handle/result |
| Reception, commissioner, unrelated or stale staff | No new entitlement | Uniform denial; no private diagnostic reason |

A/customer/order/report identifiers, identity, evidence, reviewer notes, rationale, issuer, provenance, hashes, ownership digests and full pair contents never enter the new projection or command response. B's own order is the route scope, not a disclosed A label. Every response, including validation/authorization failure, is private/no-store. Strict contracts refuse A bindings and extra request fields.

## Source guards and behavior

[Proof persistence](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts) factors read-only admission out of existing consumption. Both old and new first-consumption paths use that same admission; consumption, B draft creation and audits remain in one transaction. Admission retains the complete actor/publisher User union, Business/Listing/order/report/proof locks, current actor and issuer Sessions/grants, issuer reviewer qualification and both assignments, B technician qualification/assignment, immutable pins, all bound generations/digests/material/rights, erasure, unused/invalidation state and uniqueness. It also validates the same pure domain reinspection transition before calling a handle usable. Private reasons from first admission become uniform unavailable on the B-only command. No schema, trigger, retention, automatic ownership policy or issuer change was needed.

Discovery scans at most 21 B/selected-technician proof rows, processes at most 20 and locks the complete page actor/order union before pair revalidation. It sorts by immutable id, anchors issuance time, and reuses authenticated encrypted fixed-size continuations, now separated by query kind. Actor, Session, B, query and 15-minute continuation expiry are bound. Continuation expiry is not a new material retention policy. Server restart/replica key changes require restarting traversal. Invalidated, expired, erased, consumed or otherwise unusable records are omitted without reasons; empty pages can continue. There is no count, exhaustion/global absence claim, protected cursor position or first-50 truncation.

Consumed result recovery reads only B's surviving report/proof pointer and authorship under current B authority. A's later rights/assignment/erasure changes and restricted proof deletion do not cause A admission to rerun. Exact retry reuses `reinspectionRetry`; only its internal predecessor type now permits a server-resolved severed pointer. The original HTTP contract still requires its original predecessor binding. Ordinary B writes/release and original report/proof field comparisons remain intact. The new command needs the caller's retained report id/version/reason for exact retry; this does not persist or recover an operation request identity.

## Behavioral evidence

| Criterion | Evidence | Result |
|---|---|---|
| Test-first minimal B discovery and command | RED `0f95f63d`: actual issuance/full proof setup succeeds; absent new GET/POST routes fail 404 versus 200/201 | RED preserved |
| Minimal B-only projection and consumption, current authority/material fences, historical versus usable, >50 traversal, strict input, B result survival | `DiagnosticContinuityHandoff.spec.ts`: real controller/application/persistence/Identity composition; DB-boundary fake only, Fastify injection with no listening service | 22 pass |
| Prior discovery behavior preserved | Same run includes unchanged `DiagnosticScopedDiscovery.spec.ts` | 18 pass |
| Contract strictness | New `diagnostics-handoff.spec.ts` within contracts unit suite | pass |
| Real disposable HTTP/SQL/storage journeys | Appended private proof journeys: B-only reload/full-read denial, concurrent exact consume/audits, current assignment/Session/grant/qualification/rights loss, historical invalidation and 61 ordinary proof issuances with bounded traversal. Appended public journey: A-only product account purge deletes restricted proof, B result/retry/write/release survive and current B revocation fences recovery | Configured, hosted UNKNOWN; not executed locally |
| Existing positive 201, retry, release, concurrency, SQL/audit rollback and erasure assertions | Prior private/public bodies/assertions preserved byte-for-byte; public fixture roster/type extended solely for isolated new erasure actor. No timeout, polling, rate or other test budgets changed | Source preservation verified; existing hosted statuses below |
| Combined non-service verification | `pnpm test:unit`, `pnpm typecheck`, affected API/contracts/DB lint, contracts/DB build, runtime-import and docs gates | pass |
| Hosted acceptance of this checkpoint | Needs integration owner's configured disposable-services run, independent review and subsequent acceptance gates | UNKNOWN; blocks shipping |

The shared DB fake supplies CRUD, staffing SELECT data, live nested Session/grant relations, Prisma null sentinels and ordinary insert defaults. It does not model row locks, rollback, invalidation/erasure triggers or SQL constraints. Offline outcomes are not SQL acceptance. Real concurrency and purge assertions are only in the configured disposable journeys.

## Supplied-base hosted discovery fixture correction

Parent supplied exact-base hosted RED: run `39911838576`, API job `120276522202`. Read `/tmp/carberk-resume-20261021/7b702-api.plain.log:3014-3045`. The new discovery journey fails in `visit` at line 149, before either discovery endpoint: expected `original.vin = syn-vin-041`, passed uppercase `SYN-VIN-041`. Only the two new journey arguments now use `original.vin!` / `successorObservation.vin!`; original helper assertions and all prior bodies are unchanged. No discovery HTTP GREEN is claimed.

Parent's supplied raw-log SHA256: `2628b84aa0b789847d20a9d066a3c117ef8d591c2f0f3398deaafcb2a29db763`. Independently hashed local **plain** log: `9d95c84b37c76e1c5e44cc6181213a2b3d8a6534b0cb03f9df08e41ea145a29e` (different artifact). Parent reports API 3424 pass / 5 fail: this fixture, automatic 403-versus-201, and three historical reset tails. Existing main private automatic case and finalized-B EN safe PDF passed. Those statuses describe the supplied base, not this checkpoint. Worker scheduling timeouts belong to the separately assigned fixer; this slice changes no worker source or budgets and initiated no rerun.

## Pending dependencies and next owner

Lost issuance-reply idempotence, server-persisted consumption request identity/recovery, admin current-session proxies/UI and full #923 delivery remain pending. Existing B result discovery is implemented; full reload/lost-reply operation recovery is not claimed. No privacy exception or invented persisted identity was introduced. Automatic 403-versus-201, historical reset tails, hosted results of this slice, independent Standards/Spec review, staging/deployed acceptance and #915 design gates remain separate blockers. The parallel read-only automatic-ownership investigation owns its own evidence doc and was not touched.

Integration owner should assemble this issue checkpoint into PR904 and obtain genuine configured disposable acceptance. This implementer stops at source/evidence handoff. Prior three Railway refusals remain terminal; no service launch or retry is authorized here. Docs: not applicable — internal repository business/transport refactor, no external dependency or API upgrade.

## Commands and log hashes

Logs live in `/tmp/issue-923-b-handoff/`. Root commands use `DATABASE_URL=postgresql://generation:generation@localhost:5432/generation` solely to satisfy build-time Prisma generation config; unit database execution is disabled by package configuration. No URL was used for runtime SQL.

- `pnpm --filter @auto-tm/api test:unit src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts` — expected failure: 2 absent-route cases. `red.log` SHA256 `5d7af03519746b937891e660c4dd1428907a7fbcb12b352d8eacde5a90ec6777`.

- `pnpm --filter @auto-tm/api test:unit src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts` — 40 pass. `green.log` SHA256 `d5fa9a4136987c66a2389dc522877a318307ad88d29ec2f348f939429df153c8`.

- `DATABASE_URL=<generation-only placeholder> pnpm test:unit` — 10/10 tasks pass; API 2641 pass / 2 preexisting skipped, contracts 571, DB 119, worker 297, mobile 3806, admin 330, web 184, SMS 3. `unit.log` SHA256 `4557b8568bcedeb1a301978764cb9889389d753fda8f97c05ca2d2e0d0627eb4`.

- `DATABASE_URL=<generation-only placeholder> pnpm typecheck` — 11/11 tasks pass. `typecheck.log` SHA256 `c2243194635b77b6c2ab084ca0485cdd038edab340e9a6ec12e6d55019066a21`.

- `pnpm --filter @auto-tm/contracts build` — pass. `contracts-build.log` SHA256 `b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616`.

- `DATABASE_URL=<generation-only placeholder> pnpm --filter @auto-tm/db build` — pass; generator/compiler only. `db-build.log` SHA256 `593080c0ef90ccf79c106825534d7e97fae08bbf1df8a843f154015dcacc4dd5`.

- `pnpm --filter @auto-tm/api lint` — pass. `api-lint.log` SHA256 `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632`.

- `pnpm --filter @auto-tm/db lint` — pass. `db-lint.log` SHA256 `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632`.

- `pnpm --filter @auto-tm/contracts lint` — pass. `contracts-lint.log` SHA256 `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632`.

- `pnpm check:runtime-imports` — pass. `runtime.log` SHA256 `2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97`.

Initial missing generation-environment failures, a DB lint/build filesystem race and a contracts import-order warning were corrected without changing budgets. Their original logs remain as `unit-missing-generation-env.log`, `typecheck-missing-generation-env.log`, `db-lint-build-race.log`, `contracts-lint-import-warning.log`; final passing logs above supersede them. `git diff --check` passed. Docs gate `pnpm check:agent-docs` passed; `docs.log` SHA256 `8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20`.
