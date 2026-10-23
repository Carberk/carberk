# Request recovery backend receipt, 2026-10-23

Backend handoff for the remaining request-recovery criterion of [#923](https://github.com/Carberk/carberk/issues/923), within #897 and sole draft [PR904](https://github.com/Carberk/carberk/pull/904). READY for parent assembly and independent review. This is not full #923 acceptance or release readiness. Admin transport and hosted SQL/worker acceptance remain outstanding.

## Checkpoints and ownership

Owned branch `agent/issue-923-request-recovery-contract-20261023`; worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-83b77bcf`. Only this writer branch was pushed. No PR or integration push was made.

| Checkpoint | Commit | Tree |
|---|---|---|
| Published starting base | `4dea95615db540d09d5246957d6683ede2b4438e` | `5d9af544c03ebc57698ab9f21d48d3583f4ac29d` |
| Approved narrowed design | `25ccc490240615d359d727d288fb06c707161d5d` | `22b7c5813769aa0817da002b3da2fbe3a005bbfe` |
| Separately committed/pushed behavioral RED | `3b4cd38d46a71af878dbc03a09db43c8b9740575` | `0e02de068c18eb5f50ed97f1e5ffa207a9f6730b` |
| Source checkpoint before predecessor incorporation | `4e976c73a7de64b23b154397bbeec10e40eff343` | `5dc5820653ee1b0b5775401cacf45a2d48b8855a` |
| Parent's published disposal predecessor | `121be6585487921b39a2bc9342e67c02dda500f0` | `95a80350bc3bb703bb95c88527333826fb50a4e5` |
| Clean merge of source and predecessor | `391fa301eafe493fd83b94fba680567dc3d83705` | `56a7693531a5e2f92f8578283ddc49c76b366d02` |
| Combined retained profile | `9617def8fc084abaa7bd77e6d2f3af700545f079` | `a4d1234222b4585f168481b08835520df8802003` |
| Verified/pushed backend source, including hosted Session cleanup declaration | `122431c3ff53317a51733d25e813d2085c08f5d3` | `18b30600f6cdb0c061000f3ab10a7a0bc421b178` |

The final receipt-only commit is returned separately, avoiding a self-referential commit hash. Both the supplied disposal predecessor and fresh main `9fde309c` are ancestors. The merge had no conflicts. The parent's ownership migrations, disposal function and `DiagnosticClassifiedOwnership.e2e.spec.ts` equal the published predecessor byte for byte. No semantic conflict was found by source inspection; SQL execution is still required.

## Implemented bounded behavior

The [retained design](request-recovery-next-source-contract-20261023.md) supplies the authority and loss boundaries. Same-current-Session reload/refresh is selected. Cross-sign-in adoption is excluded and is not an unresolved policy question.

Four additive endpoints under `/api/v1/diagnostics/orders/:id/continuity-requests` prepare an opaque identity, discover a bounded page, recover an identity, and execute a strict `{kind, command}` envelope. Preparation stores only ID, creation time, actor, Session, B and kind. It stores no command, rationale, reason, hash, A selector or duplicate proof binding. Pending recovery returns `pending_input`, never executes by ID and never claims that input was saved. A lost prepare reply is discoverable within the current Session. A rollback before first commit leaves the same opaque identity available for fresh explicit input and full revalidation.

First execution attaches the request ID atomically to the existing proof/report and existing business audits. Exact committed retries return the original handle/result; changed payloads refuse after current authorization. Equal commands using two explicit issuance identities still create two proofs and audits. No request is upserted or recreated after disposal. No blind mutation retry was added. Consumption may perform a fresh read/exact-result transaction after a concurrent winner, without re-running A admission or making another mutation attempt.

The new consumption receipt is B's existing report ID, opaque proof ID, request ID and Session binding. Existing lawful report storage retains the original reason and exact retry fields. No pending copy or personal hash was introduced. Completed B recovery checks only current B authority and report authorship; it does not require A, proof payload, issuer Session or reviewer details. B-only output is exactly the request envelope plus `{proofId, reportId}`. Issuance recovery requires dual current reviewer authority and returns an original proof handle marked `historical`, never a usability certificate. Existing handoff discovery remains the source of current usability.

Every operation uses current actor/Session/grants/assignment/qualification checks. Request discovery uses the existing sealed cursor with a distinct query kind, a 20-row page and creation cutoff. It locks the complete page's discovered actor/publisher/order union before report/proof/request locks, rechecks that union and refuses changes instead of extending upstream locks behind feature locks. First execute preserves existing admission prefixes. Prior non-request contracts and automatic public admission remain unchanged.

## Integrity and lifecycle composition

Forward migration `20261023110000_diagnostic_continuity_requests` adds the metadata table, nullable unique proof/report request IDs, paired report Session field, immutable binding guards and cleanup triggers. Its retained SQL fixture is exact. Offline Prisma diff confirms only the additive table/columns/indexes/FKs; custom CHECKs and triggers require hosted PostgreSQL acceptance. No historical data is backfilled and rollback requires a forward route-closing change.

Proof DELETE removes only its issuance request. It does not delete B's consuming request or report. Report DELETE, B erasure or existing report-author erasure clears its consuming metadata. User/order/Session deletion cascades remove owned metadata. Existing account purge deletes Sessions, so pending actor linkage is removed there too. A separate bounded `diagnostic_dispose_expired_requests` sweep follows the bound Session's existing expiry. Its worker invocation runs in its own transaction before ownership disposal, with its own complete sorted User/order prefix and request deletes. It adds no timer, hold, rights basis, anonymous tombstone or command store.

The new migration does not replace `diagnostic_dispose_ownership`. The published same-graph disposal keeps its complete sorted User/Business/Listing/order/report/proof prefix and graph-change refusal. Its proof DELETE reaches the added cleanup trigger. Worker source changes are only the four-line request-expiry invocation; parent disposal work introduced no worker source change. Real trigger ordering, lock contention, SQL races and actual worker execution remain UNKNOWN.

Combined schema SHA256 is `a95ed6f93a3b7c417e4a72efb0b854d8f1a9558a8d5ab9e933a252b294c865cd`. Its inventory appends the request migration after predecessor `8b7ee275cf4f8bf3c79358f5622f85b0b42571ac7a9b0d92b7e97d6d495ed492`. All prior profile entries remain intact. The predecessor schema test now pins its own disposal-only snapshot instead of treating every future schema as that snapshot. This is the sole existing assertion-fixture compatibility change. The new schema test verifies the combined inventory and refusal of a missing migration.

## Criterion evidence and limits

| Criterion | Evidence | Result |
|---|---|---|
| Lost prepare reply and reload without cached command | Appended production-composition handoff tests discover only opaque pending identity; exact metadata key assertion and strict unknown-field refusal | Offline pass |
| Lost committed issuance reply, exact/changed replay, intentional distinct issuance | Same controller/application/Identity composition through sole `DiagnosticMemoryDatabase`; original proof/audit counts, unchanged historical handle and changed-command refusals | Offline pass; real concurrency UNKNOWN |
| Server-persisted exact consumption identity and authorized B result across reload | Discovery/recovery envelope, unchanged exact retry fields, changed reason/proof/report/version refusals, current B qualification fence | Offline pass |
| No A disclosure or A admission after proof disposal | Completed B case removes A/proof from DB boundary and retains only original B pointer; response equality excludes all extra fields | Offline pass; actual disposal SQL UNKNOWN |
| Wrong actor/Session/B/kind, missing identity and invalidated proof | New and existing production-composition cases refuse; invalidated issue recovery is historical and first consumption fails | Offline pass |
| Existing contracts, 61 distinct proofs, raw report pins/hash/date/mileage and public admission | Existing test bodies/assertions preserved; legacy contracts and scoped discovery pass; no automatic admission change | Offline preservation; 61-proof hosted journey unrun |
| Real same-request concurrency and immutable raw SQL bindings | Four appended hosted HTTP/SQL journeys cover concurrent issue/consume, audit counts, distinct issuance, changed refusal, raw SQL mutation rejection, rollback, A disposal, Session cleanup and B erasure | Declared and typechecked, NOT RUN |
| Worker disposal, SQL cleanup-vs-execute races, erasure/release JSON/PDF, supported correction fixtures | Existing lifecycle/ownership/private/public acceptance plus new request journeys must run together on disposable hosted services | UNKNOWN, parent acceptance gate |
| Protected Admin recovery and final action response headers | Parent-owned follow-up using existing protected transport/header authorities | Outstanding, no Admin file changed |

The RED run used the existing production controller/application/Identity composition and real working issuance fixture, replacing only the database/time/config/authentication network boundary. It failed four new cases on absent request routes, HTTP 404 instead of 201, while 22 existing cases passed. It was committed and pushed before source. The same four request cases pass GREEN. A fifth bounded discovery case was then added. One new test expectation was corrected from `usable` to `historical` because recovery does not certify usability. No pre-existing test body/assertion was changed. No product action mock or second DB fake was added.

## Commands and execution receipt

Logs and exact command ledgers are under `/tmp/issue-923-request-recovery-backend/`. `merged-commands.json` and `final-source-commands.json` record exact post-merge commands and exits. `api-unit-command.log` and `worker-unit-command.log` retain the exact listener exclusions, without changing repository scripts/configuration.

| Command or configured gate | Exit and result |
|---|---|
| `pnpm --filter @auto-tm/api test:unit src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts` at RED | 1, four genuine missing-route failures and 22 passes |
| Same request test at GREEN, then with `DiagnosticScopedDiscovery.spec.ts` | 0, final 45 passes |
| API configured unit command with 13 inspected listener fixtures excluded | 0, 2536 passed and two existing skips |
| Worker configured unit command with four listener fixtures excluded | 0, 282 passed |
| `pnpm --filter @auto-tm/contracts test:unit` | 0, 573 passed |
| `pnpm --filter @auto-tm/db test:unit` | 0, configured offline Node tests and 119 Vitest passes |
| Affected API/worker/contracts/db lint | 0, final API lint repeated after hosted declaration |
| Affected API/worker/contracts/db TS6 checks | 0, API/DB repeated after merge; final API repeated after hosted declaration |
| Repository `pnpm typecheck` with offline Prisma generation placeholder | 0, all 11 tasks; final API TS7 also 0 |
| Affected API/worker/contracts/db builds | 0; post-merge DB build also 0 |
| `prisma validate`, offline schema-to-schema `prisma migrate diff --script` | 0; no connection or SQL execution |
| `node --test scripts/*schema.test.mjs` | 0, 20 passed after predecessor/profile merge |
| `pnpm check:runtime-imports`, `pnpm check:agent-docs`, `pnpm check:glossary`, `git diff --check` | 0 |
| Preservation script, `preserve-merged.py` | 0, published ancestors, ownership source bytes, prior test bodies and retained SQL verified |

The placeholder is `postgresql://offline:offline@127.0.0.1:1/offline`, used only to load Prisma configuration for generation/validation/schema diff. No service was started there. Initial post-merge `pnpm typecheck` exited 1 because `DATABASE_URL` was absent; the corrected placeholder run passed. Earlier unused-import/import-group lint failures and the corrected new historical-handle assertion remain in the logs. They are not final passing evidence.

Operational deviation: an earlier unfiltered `pnpm --filter @auto-tm/worker test:unit` run executed existing temporary loopback HTTP/TLS/SMTP listeners and synthetic self-signed certificate fixtures. That violated the no-listener instruction. The run completed; inspected fixture cleanup closes servers and removes temporary material. It is excluded from acceptance. The subsequent worker run excludes those four files and passes. Root `pnpm test:unit` and full repository tests remain blocked by the no-listener/no-container restrictions; they are not claimed passed. No standalone-assets command was run.

No e2e, local database/service/Docker, CI query/poll/rerun/dispatch, Railway/deploy/reset/credential lookup, native/device/emulator/screenshot/signing/store action or nested delegation was performed. Three Railway refusals and the worker render attempt cap remain terminal. The parent's pending T3 watch remains untouched. PR904 is linked to this thread without querying checks. Docs: no lookup needed; no external dependency/API fact or package change.

## Smallest next task and open gates

Parent should assemble this exact backend checkpoint, review its effective SQL guards/lock order with the disposal predecessor, then wire protected Admin preparation/discovery/recovery and strict first execute. Pending identities must require explicit fresh input, and uncertain committed replies must recover before any new intentional attempt. Keep protected data in volatile current-Session state and use the existing private/no-store response envelope. Final Next action-envelope headers still need actual runtime evidence.

No policy or rights decision is open for the selected scope. Hosted PostgreSQL concurrency/rollback/cleanup and actual worker acceptance are unresolved evidence, not architectural authority. Independent Standards and Spec review, configured hosted CI, deployment and the founder's joint manual emulator boundary remain gates. No visual bypass or release-ready claim is made.

## Exact source paths and hashes

The table is the backend/design delta relative to published disposal predecessor `121be658`, at source checkpoint `122431c3`. `source-manifest.json` also records each Git blob. The receipt itself is the sole later documentation addition.

| Path | SHA256 |
|---|---|
| `apps/api/src/modules/diagnostics/application/DiscoverDiagnosticContinuityRequests.ts` | `b4f06fced2ad4fc6664c1882c64d93f2d05cf6cddb8b9122f7da63eb652f818c` |
| `apps/api/src/modules/diagnostics/application/ExecuteDiagnosticContinuityRequest.ts` | `09362c73df6309ed5a38f9b49e19d3f5ec309dd2beb10e2e88f6a23c5d1c5ee1` |
| `apps/api/src/modules/diagnostics/application/PrepareDiagnosticContinuityRequest.ts` | `b8adcc95e42af15b051979d5c6f055d6352f60f8a05358cf5a7d8acd521afb16` |
| `apps/api/src/modules/diagnostics/application/RecoverDiagnosticContinuityRequest.ts` | `07c5a1c6b6926e3a149a1da50d7d1cd7a75839f2104dffe44d7f5fd1d7da2914` |
| `apps/api/src/modules/diagnostics/application/ports/DiagnosticContinuityProofsPort.ts` | `2b04816479e328b00024e47bc8ece27a887100e06032112d7382c4d57fb9954c` |
| `apps/api/src/modules/diagnostics/diagnostics.module.ts` | `1ca0b5b2dac3fdede6eb1fccdc30c2bb03d4c43c5bb3a66c9e504f4535319afe` |
| `apps/api/src/modules/diagnostics/infrastructure/DiagnosticDiscoveryCursor.ts` | `96634538df93a47af39a0e01b9068b6836e758d2053cba7d543bf0464835950e` |
| `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts` | `dce2fc7b5d49fe6b5bfe248651c6a57393593eb50e544722aa2a162507d2516f` |
| `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticReports.ts` | `d18af38bdfbcfadba09e0e9489dc73b7c1a968a3d455b8ed910664f146e3dbd4` |
| `apps/api/src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts` | `1201456d859d56855b2aa2a28c2e81fd40bd3e04cf8215e13b78fd12b177714a` |
| `apps/api/src/modules/diagnostics/presentation/DiagnosticReportsController.ts` | `88eb65eb1d999acd2f9108da7500b288299c2fa43fa07801e102263eaee23647` |
| `apps/api/src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts` | `eeb32d858d64e1210a6682701881b0dfad192de0c1a2914a3702993dacd3ca4e` |
| `apps/worker/src/jobs/diagnostics/DiagnosticArtifactWorker.ts` | `1eb1f632eb592d16073d78eaff36c4ccefa04878e08e66412aad75635daad102` |
| `docs/evidence/issue-897/request-recovery-next-source-contract-20261023.md` | `6f509e1359f3e80632a646aaab8ee84e41a9971ebec37ba050795e60a2ce6a62` |
| `packages/contracts/src/schemas/diagnostics-request-recovery.spec.ts` | `1837bb579f7f9f898c71ff6bac9ed2c784b29469a36075f33966acbe3a718ad4` |
| `packages/contracts/src/schemas/diagnostics.ts` | `95828e9cc5165fbcacaba274431a4e90f3c175198f053cec9adcb1c2314d9706` |
| `packages/db/prisma/migrations/20261023110000_diagnostic_continuity_requests/migration.sql` | `83188077748f02bf96d74d9588805f173129199333a8d4e9c160547e38fb52a2` |
| `packages/db/prisma/schema.prisma` | `a95ed6f93a3b7c417e4a72efb0b854d8f1a9558a8d5ab9e933a252b294c865cd` |
| `packages/db/src/testing/DiagnosticMemoryDatabase.ts` | `f7ddac3e6e24b590f3d8fdd5753ed84b27951b121ba36209d7d0cfaf07b05291` |
| `scripts/diagnostic-ownership-disposal-schema.test.mjs` | `cc78ea2d199b5eb690bfca009ed6b52e83ab5395717c1e0f132a97685b5bd748` |
| `scripts/diagnostic-request-recovery-schema.test.mjs` | `921b951ba9f7815fe0853b4bbd6691367bb411b40787ab8281fa9b74bff730c5` |
| `scripts/staging-schema.mjs` | `30e5db039eb3e65287b9d6d5edafa2e3dba0f0b103a99b67498fde295d953126` |
| `scripts/testing/retained-schema/20261023110000_diagnostic_continuity_requests.sql` | `83188077748f02bf96d74d9588805f173129199333a8d4e9c160547e38fb52a2` |

## Artifact manifest

72 artifacts. SHA256 of `artifact-manifest.sha256` is `d365d9b92f12f57f93c668a4dbafdabefebd59b141114184e2634e81b69fb50a`. All paths below are relative to the temporary evidence directory. Final receipt-check/push logs and final commit/tree are returned separately.

```text
9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538  api-build.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  api-lint-final.log
dc1e4f59bc9ef51db485f1199f2dd5fecdc13507ccb0740e32aa321e34644560  api-lint-initial.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  api-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-ts6-final.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  api-ts6.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  api-typecheck-initial.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  api-typecheck.log
ce16c22e616206c2673d18ba194cf4572c3bace6faf7619c187bc177625da3b7  api-unit-command.log
8782b59fa0e685ca710d4498c3ae20b672f37fae94e85c30397cbae9e3c0bcb5  api-unit-no-listeners.log
ccb4ccf63789ecb4262fb14530025b46971891df895951dbb2490aa656b3a969  base-schema.prisma
6fbb2a3497986739c0728af1f72496f7b0e78f692f4f99fd3f58401748168026  combined-source-push.log
b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616  contracts-build.log
48d01ac8f121e28f22b388b7e9ebd20697a8a28c41d8a70b4e5aa3e9e81476ce  contracts-focused.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  contracts-lint-final.log
bffe02d4d0d3f59657b6ba6c1ea37ca6f508c8848e71cdb18f799fee317b537e  contracts-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  contracts-ts6.log
d574426ba531e17ff47dc0326a899f00b3dcdf9bf4cd73a3d34a5b3c71f28415  contracts-unit.log
8cb5842867966f0e6dec5a3ae851a5880e080519cfb029e895bc325528da3dbb  db-build.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  db-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  db-ts6.log
bc44877f877d3b589d5e52461b08e9490b38fce15892c5cab89f0b94594db06d  db-unit.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  diff-check-source.log
8b7ee275cf4f8bf3c79358f5622f85b0b42571ac7a9b0d92b7e97d6d495ed492  disposal-predecessor-schema.prisma
8f5507ea6fcde992f7d6733d113abc538ae4957b777bc97cadd580f651c93b20  docs.log
ffb7b68e15ee50aae4de0b17d2a8df47e6031f6b68b76ec68f9eb5aba02f42d8  final-api-lint.log
cf9f23488d15bd1adef898decbe6621fc4c2bf33716ad0886c3b77a1529957a2  final-api-ts6.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  final-api-ts7.log
6c308937b44f5b8323ef6854529901b0c778559cb3d2019bf9b8f330a3b1225c  final-focused.log
7b8003cc4b7bf2a39562ca225b7314292dbf80aa61d25704a6fcb36185f21ca2  final-source-commands.json
d0863b4ecc26a15f30aa60280c93ab71299462ab7b6fd8e15e5c042c23144621  glossary.log
5ff0246a8036a1b8bffdf535e1bb8367c1cdeaaa07a0deaa10f409990d9d6869  green-final.log
1fd398efcfac062c8e72efe3f80f49db38ccaa23a359b44fbd7d68d63a75da0c  green-focused.log
f1d7db892ac4463cbc27648f607e6fd64aa318788bcf9ff790bcce14064587b5  green-initial.log
5e49a88d564372b2a54ca64122f595bd418f639b3427346dc76f27934587203e  green.log
cf9f23488d15bd1adef898decbe6621fc4c2bf33716ad0886c3b77a1529957a2  merged-api-ts6.log
adc066968653098757e07639e8c3de9255bd48b6bdc1216406aeae76abcfa0d5  merged-commands.json
2c9fc33cf293ff427c1dbf061e69c0605ffe9a8e88ecd677f1727d72c40ef543  merged-db-build.log
b84f232a7bb507e79e39b32f4c66e2b1f951c3e8ce8ace53c5a5c9dc65b7afec  merged-db-ts6.log
3d4d50cd32af92c6d4df37c1df74a96622fca8cfb5643a155c91f034a42f2068  merged-diff.log
738674578f314c7d11a80baa74c411aa198cc0811ed168cf0e5dfed3997f860c  merged-docs.log
a3386e356751ca02dd001cc71153b0d993e7735ee3aae54c67d0b99cc4c2394d  merged-focused.log
19188f952a51c2ac2ec6d43cc674f326f49c1859362fa59c671423b415336950  merged-glossary.log
b9cd320b08b61b4b71c4dc98904530bf50c8b6f85a8b3c22b0a90be1474fb481  merged-preservation.log
a5b4c965c9b44a10e617287da7e5a418ea6c900bc90fdf4ef6f4e10b134a43d7  merged-prisma-validate.log
7c7230c339b51b2ceeac6bf16b9313a6f2228a21a3f7acf3daaa0854198eacdc  merged-runtime.log
04243fac449156c0326b2fbb17ec68f3575b23d47faf13efc78b8e7631f446e5  merged-schema-diff.log
19d3a0fa583d528a21a49fa3478b2ade32333c737923f28df5b578e211dcbe3e  merged-schema-diff.sql
577924ac2f3c921d3b3d8ef7ccc926b7440b5b88a1ddb8d7321bdecf24b92b0e  merged-schema-tests.log
28247f72f927b1637f9f45d96f5466b9dd981f77fabd34b6a3a1ec338b33f100  merged-typecheck-with-offline-env.log
67ad6669bef41e74fd43c1d65e03d40a58bdc1015a205e94f2681ce832505053  merged-typecheck.log
81ef10c662cb79995e738e2a77ae9a867d7b323e984c0ff78400ba30910a01c7  preservation.log
b2fd7fb50e79f4e20e100fb479b69971c4687a4d0aaaaf727a70b72166b4f2a4  preserve-merged.py
e1344514cb0e93026a245afd134e0c874287a64f7c5798cbda02eff700d2aa22  prisma-validate.log
a17f6c057055965c38d468eb5d268b10fdf84d94aa69efa54811c14f5c5299dc  profile-commit.log
86bfbb8d1371abcf4b17ffafd228dfc82ef2f5573c8b2e1461f4f27bc982ef11  red.log
8ab6febef539ae8e0b385d00347b166717f8b3d3290ee9db0e37b72ecc2f990c  repo-typecheck.log
2920e5c9967fdaf4eb831dfb48e054ff0bd4262a1ef314658ceca54821fa5d97  runtime.log
04243fac449156c0326b2fbb17ec68f3575b23d47faf13efc78b8e7631f446e5  schema-diff.log
19d3a0fa583d528a21a49fa3478b2ade32333c737923f28df5b578e211dcbe3e  schema-diff.sql
6507880f434028ee51d738bdc9e33b2b3714b2047b1c89b7da1a5dc244820ab1  source-commit.log
73fce0408c72737a80fd4282be0430033bde98e0fc086181b48107711c186740  source-diff-stat.log
54ec8aa5f425bc1c78e61452be982da7bf727e006cd8a5200cb45c3e96392e47  source-diff.patch
055395d2944d7372321cfad08bb7481297745a4aa5a292e2262aaa6f65cfd120  source-manifest.json
7bb9ee9521eb5e24dc9d0156fdb529117cc391c5a3fc9dcf52ac2e850ea7c2df  source-push.log
45445233240769989047ba6171bea6b5700f379f8eb4352cff9643431d051f9f  verify-merged.py
9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538  worker-build.log
960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632  worker-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  worker-ts6.log
d64aaebb78d325ff57d820233b4d25d6b59cf2053715a7ac6abf5d7355e5eca0  worker-unit-command.log
2571a6f37c2cbb77aa7a0d29cea95c55cf90cd3f84b0d615efe3e451d253364e  worker-unit-no-listeners.log
4f0dc65374be8ba9fe924df1d33f97079e750cc01e870a05ddb03d2c29cb2d63  worker-unit.log
```

## Owning overview correction, 2026-10-23

Docs-only follow-up from `af79cad807799d0acc7843759c1b9a05d456c424`, tree `57493059b4467e714c71f509a8d975c24b4528a6`. The diagnostics overview now describes opaque preparation, strict atomic commit binding, same-current-Session recovery and the surviving authorized B pointer without A admission. It keeps Admin wiring and real SQL/worker acceptance pending. The worker overview adds one orientation sentence for the separate bounded Session-expiry request-linkage sweep. No source, test, schema or configuration changed.

Behavioral RED is exempt for this documentation correction. Inspected no-listener checks only: `node scripts/check-agent-docs.mjs`, `node scripts/check-domain-glossary.mjs`, local Markdown link validation, source/test/schema preservation against `af79cad8`, and `git diff --check`. All exit 0. No unit, compiler, broad script, listener, e2e/service or operational action was run. The earlier forbidden unfiltered worker run remains explicitly excluded from acceptance; no package-wide unit command was repeated. No nested work, PR or integration push.

Evidence directory `/tmp/issue-923-request-recovery-overview/`; final documentation checkpoint/tree and complete manifest are returned separately. Initial check-log hashes:

```text
aecc3fad493f95385b2eb915f12a25975582dfc392a5f942fea2eecbcf8cf7db  docs.log
2e05fa0133022f990bd0007c0ce14a7141e5ad8e3bcf7bc68332b987daceaf09  glossary.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  diff-check.log
1ed47d68d15ffc5f1b2480d3fc91c663c46bea1850037c770355ba8c10626f3a  preservation.log
```
