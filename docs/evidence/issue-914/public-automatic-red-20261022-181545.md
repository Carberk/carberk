# Public automatic VIN test handoff, 2026-10-22

This bounded test slice belongs to #897/#914 and sole draft integration PR904. It changes only `DiagnosticPublicTransferProof.e2e.spec.ts` and this receipt. It does not establish hosted acceptance or release readiness.

## Checkpoints and ownership

Branch `agent/issue-914-public-auto-red-20261022-181545` was reserved and pushed from supplied base `fea9350155c20533a15dbcd2d4c9ac331b23d619`, tree `0cb4d4204c66130bc3ef3f607b22ad893ec1fcb4`, before edits. The final test checkpoint is `e4e03f053a16f782ab4ff7402e453364868e5f6d`, tree `9d8c38d6f3ca551a925587bab909993567e3a3a1`. Earlier exploratory checkpoints on this branch are superseded; assemble the complete final branch diff from the supplied base.

The host-created worktree is `/Users/bagtyyar/.t3/worktrees/carberk/t3-75c6184d`. Scaffold `t3/75c6184d` remains at the supplied base. No Root checkout/ref was changed, no child agent was created, and no separate PR was opened. PR904 is linked to this thread. The worktree is retained for Root's assembly and post-merge lifecycle gate.

## Test criteria and current frontier

The positive journey uses one isolated public Listing, unchanged seller and commissioner, separate A/B visits, equal normalized observed VIN, consistent retained VIN/chassis stamps and one structured root per visit. Existing HTTP helpers create physical authorization, distinct visit consent references, current association, technician/reviewer assignments and rights-before-bytes provenance. The qualified reviewer is assigned to both visits and distinct from B's linking technician. No broader issuer permission or multiple-root admission is added.

Before issuance, the case reads both complete identity records/evidence and exact sanitized provenance bytes. It checks A's released snapshot and immutable pins. The criterion expects automatic issuance/read/consume/exact retry, proof and report uniqueness, issuance/consumption/creation audits, B's empty findings/evidence/documents, own date/mileage/template/pins, an independent B finding/submit/finalize/public read, protected proof/identity refusals and minimum public disclosure. It checks A's persisted report/PDF intents, order and raw history remain unchanged. `finalizeLinked` registers B's PDF intents before any status assertion, preserving the existing teardown rules.

The negative journey releases A before changing the shared Listing's seller to outsider and restoring the exact original Listing row. It proves association remains invalidated after restoration, then performs authorized A reobservation through HTTP. The original raw observation and report pins remain intact; the additional raw observation has the same VIN/method. B then has its own current physical/public authorization and independently captured evidence. The case checks current A/B Listing digest equality and current associations, one structured root on each visit, retained comparison material and both exact byte downloads before automatic issuance refuses. It asserts no B proof/report/audit side effect. It seeds no immutable ownership fact, epoch, proof or report pin.

Current source calls `PrismaDiagnosticReports.compared`, verifies reviewer authority on both orders and B technician staffing, then invokes `ContinuityPair`. That domain predicate refuses all public `automatic_normalized_vin` pairs before `facts`, `comparisonRights`, proof persistence or SQL consumption. The positive expects 201 there; source predicts 403. Hosted execution has not established the reached assertion. The restore case's 403 cannot demonstrate a later historical-ownership discriminator while that blanket gate remains. Its later admission/consume oracle is explicitly untested. The public SQL bound predicate independently requires comparative attestation. No source gate was relaxed to force GREEN.

The current raw identity record stores observation/hash/recorder/time, not immutable public ownership-at-visit facts. Released report pins do not supply that absent historical ownership. Reobservation refreshes mutable order Listing digest/association, so current equality cannot establish uninterrupted historical ownership. Missing legacy at-visit facts must not be backfilled or guessed. This receipt selects no column, epoch, actor, DTO or architecture.

## Verification

Logs and checksum manifest are under `/tmp/public-auto-181545/`. Package generation logs are `/tmp/public-auto-181545-db-build.log` and `/tmp/public-auto-181545-contracts-build.log`. Initial direct TS7/runtime checks preceded package outputs and failed on missing built workspace dependencies. An initial DB build also refused missing `DATABASE_URL`. Generation then passed using a nonconnecting placeholder at `127.0.0.1:1`; no DB connection or service was started.

| Gate | Result |
| --- | --- |
| Direct API TS7, TS6, lint, build | Fresh pass on final test source; `api-ts7.log`, `api-ts6.log`, `api-lint.log`, `api-build.log` |
| `pnpm test:root` | Fresh pass, 597 passed / 1 skipped; `root-test.log` |
| `pnpm test:unit` | 10 tasks passed, 9 cached; changed API executed, 267 files / 2552 passed / 2 skipped; `root-unit.log` |
| `pnpm typecheck` | 11 tasks passed, 10 cached; changed API executed using configured TS7; `root-typecheck.log` |
| Docs, glossary, runtime imports | Pass; `docs.log`, `glossary.log`, `runtime.log` |
| Actual import-only collection | 135 continuity cases, including 20 public; `continuity-collection.json`, empty `.err`, saved `.config.mts` |
| Existing case preservation | All 16 original public declarations have byte-identical bodies/assertions, expanding to 18 original cases; two additions expand to 20. All other 4181 base paths/modes unchanged; `preservation.json`, `preservation.cjs` |
| Whitespace/scope | `git diff --check` passes; no production, schema/migration, reset, CI or private-test changes |
| Hosted HTTP/PostgreSQL/storage bodies | UNKNOWN; Root owns hosted execution and reached RED evidence |

Collection command: `pnpm --filter @auto-tm/api exec vitest list --config /tmp/public-auto-181545/continuity-collection.config.mts --staticParse=false --json`. The temporary config names only continuity files and sets `globalSetup: []` and `setupFiles: []`. No setup/hooks/bodies ran. The focused public collection also imported 20 cases. Collection proves imports/registration, not test outcomes.

Final test source SHA256: `fe8b5aeeddd1f857f4d935dbca26632dcd760bccec93214d1a24d46f81ab6d43`. Final receipt, logs/configs, preservation output and collection hashes are in the external handoff manifest to avoid a self-referential receipt hash. Docs: not applicable, internal test/evidence changes only. Owning overview facts, glossary and runtime boundaries remain unchanged.

No local services/Docker, live destructive suites, Railway/proxy/credential/quota probes, resets, deployments, native/store/merge/launch actions or CI dispatch/rerun/watch polling occurred. Protected reset assertions/budgets and all original private/public cases remain unchanged. Broader automatic issuer/multiple-root, same-visit method transition, staff foundation and Play metadata questions remain unresolved. All selected #897 through #920, independent final reviews, native/deployed/restoration acceptance and exact signed artifact gates remain required.
