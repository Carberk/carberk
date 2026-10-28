# Milestone A execution state

Active Chief of Staff: T3 `mcp:ac0bb7f1-e0a9-4ffa-b92b-fb4b4b91e833`, Sol 6.1 xhigh, full access. Founder launch brief dated 29 October 2026 is current authority. Outcome is a usable, tested internal campaign candidate, exact installable staging APK and signed production AAB, acceptance, protected PR #904 merge and restoration. Full #897 scope remains selected.

## Authority and baseline

- Sole integration PR: https://github.com/Carberk/carberk/pull/904. Registered with this thread at launch. Draft and blocked.
- Published head verified by GitHub and `git ls-remote`: `023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab`, tree `53c99b0ed17a8f2a80aca66ff5cf86114cea8399`.
- Main: `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. Recovery/assembly branch: `agent/release897-candidate-a-20261029`, initially clean at published head. Coordinator is the only publisher to `agent/spec-897-campaign`; no force pushes or duplicate campaign PR.
- Current source contains migration 160, 98 migrations. PR summary's migration 150/head 776fad4a, issue #897's head 2c2298de and original ledger's head 0ca85a62 are historical, superseded as current status. Their original evidence remains intact.
- Existing automatic continuity journey passed on migration 160. B5 hosted renderer 7/7 and scheduling 3/3 passed at bff24377 with original 5000ms limits. Neither establishes complete B1/G1 acceptance. Rerun affected checks when relevant bytes change.
- Latest exact-head PR Checks 40441248225 is terminal: API/DB/frontend/aggregate fail, static/lane pass; image runtime 40441248177 passes. Frontend workspace suites passed; four later root snapshot checks fail. Counts of failed tests are not counts of independently established product defects.
- Old coordinator stays paused and settled; old timers remain off. Its de80c7b5 checkout and dirty ledger were read only. Diff captured in `/tmp/candidate-a-old-ledger.diff`; no command ran in that checkout. Original campaign checkout at 4fdf3f2d and prototype owner checkout/sessions are preserved.
- Founder authorizes necessary testing, device interaction, deployments, migrations, fixture creation and coordinated disposable-data resets in all Railway environments. Verify target identity, quiesce queues/workers/media and preserve credentials, signing, identity, infrastructure and reproducible reference inputs. Actual host refusals and credential scopes remain binding. No public invitations, paid activation, TM cutover or Play submission.
- Historical repair caps, one-child/Codex-only restrictions and unattended-device stops are superseded by this launch. Protected merge, actual hardware-only proof and scope/design gates remain.

## Owners and resources

Four-slot working ceiling including coordinator. Each writer receives a T3-owned isolated worktree and supplied source pin. Only accepted handoffs advance dependencies. No child owns the old parent's tasks.

| Owner | Exclusive outcome/files | Resources | Status |
|---|---|---|---|
| Coordinator | Execution state, exact-head assembly, root snapshot checks, PR publication, review/acceptance coordination | This checkout; GitHub PR head; shared staging/build/device reservation when acquired | Active |
| Worker recovery | Held R6c worker/preparation/ownership fixture and worker tests; no shared schema redesign or PDF content changes | Owned Docker project/DB/Redis/MinIO and ports; first performance interval; never shared 5432/6379/9000 | First dispatch |
| Maintenance recovery | Existing R7g fixed payload and maintenance fixtures/ports | Separate checkout; source/offline checks first; no Docker/runtime until worker performance interval releases | First dispatch |
| Service usability recovery | Existing selected mobile/admin service navigation, independent forms, truthful entries/provenance and minimal back controls | Separate checkout; frontend tests only; no Metro/browser/device/shared DB | First dispatch |

Later ready work: R7c claims namespace, R8 concurrency/erasure/private matrix, R4 after accepted worker, R6a closure, approved PDF identity/center and #923/#915 staff workflow. Do not reserve running slots for these waiting dependencies.

## Reconciled requirement and next proof

Statuses refer to current integration acceptance. Historical component results retain their original SHA. Owning issues/specifications remain authoritative; the [criterion index](criterion-evidence-index-20261018.md) preserves earlier requirement-level evidence and [original ledger](release-blocker-ledger-20261023.md) preserves failure history.

| Requirement | Current source/evidence | Owner/dependency | Status | Next observable proof |
|---|---|---|---|---|
| G0 source/history integrity | Published 023e, migration160/98; prior scoped kernel reviews | Coordinator | Scoped accepted | Inspect each incoming payload/provenance and preserve migrations/assertions |
| B1/G1 real callers, rights, locking, erasure | Original automatic and structured path passed on160; cross-caller closure incomplete | Worker, then R8/R4/R6a/R7c | Unknown overall | Actual ordinary worker producer, 100-grant/component, rollback/races, then required matrices |
| R6c prepared worker | Held332f4b55; producer timed out after108 HTTP commands/16 orders; d2d14258 distinct-Listing repair unverified | Worker recovery | Failed setup; assertions unreached | Original120s setup and5s bounds, actual100 grants/independent component, storage retry/rollback/races, cleanup |
| R7g maintenance capabilities | Held2af0c957; restricted29/29 vs original12/21 reported partial | Maintenance recovery | Unknown overall | Inspect reviews/fixes, affected/full original suites and exact restricted fixture |
| R7c claims retained namespace | Held18eace6; earlier26+9 scoped passes on another assembly | Next caller owner | Unknown | Actual namespace read/write controls plus original26+9 on accepted candidate |
| R8 admission races/private/erasure | Held6c259d7;13 bodies11pass/2fail;21 unexecuted; sequential revoke is not race proof | Next R8 owner | Unknown overall | Both-order true wait graph, account erasure, private and forgery paths |
| R4 source cleanup matrix | Scoped positives; full33 awaits prepared worker | Next R4 owner after accepted R6c | Blocked dependency | Affected cleanup then original33 including rollback/races |
| R6a service caller matrix |13 distinct affected passes; full160/161 and12 legacy raw-fault dispositions open | Next service caller owner | Unknown overall | Contract-backed current160/161 matrix; retain unpassed historical assertions |
| B2 selected-worker Support fence | Boundary source/scoped receipts exist; integrated/operator closure open | Service caller + coordinator | Unknown overall | Real selected-worker post-disposal refusal, zero purge/storage, foreign isolation and reset/quiescence |
| B3/B4 retired publish/attach | Direct NP-4 replacements passed historically; old tails retained | Media owner + coordinator | Unknown overall | Current route/business isolation plus same-candidate operator reset/quiescence before retirement |
| B5 renderer/scheduling | Hostedbff24377 original10/10; worker affected12/12 at332f | Worker/PDF owner when bytes change | Scoped accepted | Affected rerun without budget changes |
| Root schema snapshots | Four historical hashes fail after160 snapshot comment | Coordinator | Failed | Bounded exclusion of only added comment; same checks green with semantics retained |
| Unambiguous services route | tabs/services and app/services resolve same public path; four callers | Service usability owner | Source defect; runtime proof pending | Route manifest and actual navigation/auth/push recovery |
| Admin independent actions/rights | Shared reason and synthetic upload provenance | Service usability owner | Source defect; runtime proof pending | Render real workspace; independent reason payloads and truthful permitted upload provenance |
| Required mobile navigation/entries | Six campaign screens lack controls; audience/history availability needs conformance | Service usability owner | Unknown/defects | Back/action behavior; authorized history retained when new entry closed; locale/audience evidence |
| Feature51/#916 PDF identity/center | Approved14Oct sample4f1aebd8; current content gap | Later PDF owner after worker | Failed conformance | Compatible immutable snapshots, newly rendered localized PDFs; old issued bytes/hash/audiences preserved; B5 rerun |
| #923 foundation / #915 staff workflow | Discovery/handoff routes now exist; old missing-route packet stale | Later staff owner | Unknown acceptance | Current prerequisite and approved design, real scoped staff production-path completion |
| #874/#899 views/retention | Historical SQL/mobile receipts | Coordinator acceptance | Unknown candidate | Native ID/dwell/locales, deployed enabled/disabled and sweep/restart/overdue |
| #886/#888-896 video | Historical native/protocol/runtime source | Coordinator acceptance | Unknown candidate | Current Android picker/preparation/transfer/playback/race/cleanup; physical media/performance where required |
| #900 staff authority | HTTP/DB source and historical evidence | Coordinator acceptance | Unknown candidate | Scoped sign-in/TOTP/grant/revoke/stale/denied real browser paths |
| #901 operations/staging/reset | Existing controls; prior scoped Railway Not Authorized refusals | Coordinator | Access unverified | Repair exact token scope if needed; identity/lease/deploy/readiness/reset/reseed/restore/release |
| #902/#908-910 business/showroom | Historical source/component/API evidence | Coordinator acceptance | Unknown candidate | Native/admin ordinary, revoked/conflict/race/sharing paths |
| #903/#911-913 Support/History | Historical HTTP/components and later fixes | Service owner + acceptance | Unknown candidate | Real private files/payment/fulfilment/realtime/auth-switch/history recovery |
| #905/#917 measurement/privacy | Historical scoped evidence; activation restrictions retained | Coordinator acceptance | Unknown candidate | Current identity/rights/revocation/retention/erasure/disclosures; no unauthorized activation |
| #906/#914-916 diagnostics | Selected immutable reports/readers/intake/review/audiences | Staff/PDF + acceptance | Unknown candidate | Real private/public/correction/withdrawal and report/PDF recovery |
| #907/#918-922 admin/analytics/operations | Existing selected issue criteria retained | Coordinator acceptance | Unknown candidate | Current scoped roles, locale/accessibility, actionable operational and privacy evidence |
| G2/G3 full verification | Latest023e configured CI failed | Coordinator | Failed | Focused roots fixed, then combined configured full checks on pinned candidate |
| Final independent Standards/Spec | Prior scoped rounds retained; no current combined approval | Fresh independent readers after verified pin | Unknown | Parallel read-only reviews, adjudication, one fix writer and affected checks |
| Deployed/native acceptance/restoration | Not performed for assembled candidate | Coordinator after review; early investigation allowed | Unknown | Exact SHA/readiness/media/worker; ordinary/negative journeys and latest-main restoration |
| #329 installable artifacts | Old2.0.4/code11 is historical; Play max code unknown | Coordinator | Unknown | Inspect EAS/Play metadata, exact APKtm.auto.app/preview and signed AABcom.auto_tm.ynamly/production, hashes/signing/origins; authorized device/joint proof |
| Protected merge/closure/cleanup | PR904 draft/blocked | Coordinator last | Unknown | All gates green, protected squash merge, closure/restoration verified, safe cleanup only |

## Recovery sources and immediate action

Read all four dated analyses in the read-only `t3-2402e36d` research checkout. They are proposals/snapshots, not replacement specifications. Read old coordinator history and dirty ledger without resuming it. Preserve original `/tmp/897-g1-coverage-manifest-20261025.json`, worker receipt/diagnosis, R7g reviews/fix receipt and R8 final manifest. These are historical handoffs, not live ownership.

First finite dispatch: validate and finish held worker repair d2d14258 from published023e, independently inspect/finish maintenance2af, and repair selected service usability. Return exact checkpoint/diff, failing then passing commands, criterion verdicts, artifact hashes and resource cleanup. Coordinator installs configured dependencies, repairs the root comment-hash issue and inspects operational/artifact access while children work. No broad CI push is the discovery loop.

## First execution receipts

- Worker task `node:delegated-task:command%3Amcp%3A1699706c-7594-426f-a086-df3c841a0424%3Adelegate-task%3Acandidate-a-20261029-r6c-recovery-r1`, Sol6.1 medium/default, isolated `t3-9b85d731`. Exact held payload recovered/pushed at `a098aee7`. Owned project `auto_tm_ci_897_r6c_candidatea_1`, PG65379/Redis65378/MinIO65380. Dependencies/builds and160/98 migration pass. First120s producer run RED with root-test overlap; retained as contaminated, not product acceptance. Identical clean rerun authorized after root processes stopped. A fresh empty-bucket409 bootstrap refusal was retained and exact owned empty bucket restored before clean ownership3 setup. Runtime remains open.
- Maintenance task `node:delegated-task:command%3Amcp%3A1699706c-7594-426f-a086-df3c841a0424%3Adelegate-task%3Acandidate-a-20261029-r7g-recovery-r1`, Sol6.1 medium/default. Source-only while R6c timing interval active.
- Service task `node:delegated-task:command%3Amcp%3A1699706c-7594-426f-a086-df3c841a0424%3Adelegate-task%3Acandidate-a-20261029-service-usability-r1`, Opus5.5 medium/fastModefalse, failed provider429 after source reads. Preserved stopped `t3-49c8a0e5`; no product test verdict. Replaced by `node:delegated-task:command%3Amcp%3A1699706c-7594-426f-a086-df3c841a0424%3Adelegate-task%3Acandidate-a-20261029-service-usability-sol-r2`, Sol6.1 medium/default in `t3-aed62215`. Source-only during worker interval. Neutral History entry may remove ungrounded price/activation claims while preserving history and admitted server-validated tester commands. Do not infer server-only availability or invent a client contract. Existing rights schema supports truthful staff-entered provenance.
- Coordinator dependencies installed with configured pnpm12.11.2. Eight affected schema checks reproduced4fail/4pass, then8/8 pass after excluding only exact160 comment bytes in four historical projections. Migration/schema/expected historical hashes/refusal assertions unchanged. Current160 checks and combined root gate remain pending.
- Broad root check was interrupted to free worker timing interval. It is not GREEN. Its reviewer smoke also could not load unbuilt contracts/dist; build prerequisite remains. Preserve `/tmp/candidate-a-root-green.log` despite its initial filename. No product defect inferred from interruption/missing generated build.
- Fresh access: Railway5.71.0 `whoami --json` reports `Unauthorized. Please login with railway login`; STAGING_RAILWAY_PROJECT_TOKEN and Railway token env vars absent. No refused staging mutation retried. Private scoped-token access request pending. EAS authenticates as tkmdevelopers; no build started.
- T3 device inventory provides Android emulator Tayyn_Hyzmat_Test and iPhone17 simulator; neither is physical. Device sessions unopened to preserve worker timing. Physical-only proof request pending.
- Default T3 browser opened Play Console and redirected to https://google.play/business/. Snapshot has sign-in link and no authenticated app metadata. Signed-in Console or nonsecret all-track maximum/app-signing fingerprint requested. No Play mutation.
