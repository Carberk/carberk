# Checked-in reference-seed reconstruction checkpoint

This checkpoint adds `packages/db/tests/reference-seed-reconstruction.e2e.spec.ts` for the #901 baseline slice under #897. It is intentionally limited to fresh, isolated PostgreSQL Testcontainers: each target receives `prisma migrate deploy`, then the configured `pnpm seed` CLI in a child process with an explicit disposable `DATABASE_URL`, twice. A second target repeats the same sequence.

The spec reads semantic natural-key exports directly through `pg` and compares all semantic fields across targets and repeats. It excludes generated ids and timestamps, checks the checked-in source counts (130 brands, 2,435 models, 6 regions, 35 cities, 10 body types, 15 colors, 6 engine types, 4 transmissions, 4 drive types, 2 rates, zero generations), verifies the source file checksums, relations, RU/TK/EN and `Color.hex` values, and requires USD/TMT 18.2 plus AED/TMT 4.96. It also asserts empty Users, Sessions, staff grants, diagnostic center/template assignments, service rows, selected History rows and market datasets, while retaining `_prisma_migrations`.

Offline checks completed: changed-spec ESLint, Vitest collection, Prisma client generation, and `git diff --check`. Package typechecking remains blocked by existing workspace errors in the staged-reset Redis suites and dependency resolution; the new spec has no reported type error. Docker/Testcontainers execution is intentionally pending for root's hosted disposable-DB lane. This checkpoint does not cover approved live edits, generations/rate overlays, logos, measurement policy, reset closure, or deployment readiness.

Root assembled the complete checkpoint `82e1a44d` as `93cdaabb`, `52bb9769` and `02e8c171`. Changed-spec ESLint and DB typecheck pass with the integration worktree's ordinary dependencies. `vitest list tests/reference-seed-reconstruction.e2e.spec.ts --json` collects the single intended case. The earlier isolated dependency/typecheck limit above remains attributed to that writer's environment. No container-backed seed test has run locally; hosted runtime and approved live edits remain unproved.

## Exact-base expectation correction

The correction starts at `5646e056b5ce7f3602dd3b2d5edf3cf80eea3e26`, tree `523d6be91d029b2218b69a9ab6ee1f1857460a50`. The host supplied this isolated worktree on scaffold branch `t3/issue-901-seed-natural-key-baseline`; that scaffold remains at the supplied base. Reservation `agent/issue-901-seed-natural-key-baseline-20261021` was pushed before edits. Root alone assembles into #897's sole PR #904.

Completed hosted RED is [PR Checks run 39682692250, DB job 119509158352](https://github.com/Carberk/carberk/actions/runs/39682692250/job/119509158352). The independently inspected raw log is `/tmp/carberk-resume-20261021/5646e056-db-119509158352.raw.log`, SHA-256 `1f14cfbb6e0e761c3d171b24a57ef9fbc0675f55f25f9c1ffec69455efc0f31f`. DB finished with 40 of 41 files and 390 of 391 tests passing. All six interrupted Redis cases passed, including the three restart criteria. The sole seed failure reached the first seeded snapshot equality, reported at spec line 122 in the raw stack, before identity assertions, repeated seeding or the second database. Migration deployment, the empty pre-seed snapshot and the first seed process had completed. Overall run, API and frontend status are outside this writer's scope.

The complete diff contains two expectation errors. Currency enum order is `TMT, USD, AED`, so SQL previously returned USD before AED while the JavaScript natural-key expectation returned AED before USD. The query now casts both currency sort keys to text with `COLLATE "C"`. Both complete rate rows remain asserted, including USD/TMT 18.2 and AED/TMT 4.96, and null `setByUserId`.

`models.json` contains 2,435 input rows and 2,420 unique `(brandSlug, slug)` keys. All model brand references exist. The unchanged configured `pnpm seed` command sequentially upserts by the schema's unique `(brandId, slug)` key and updates RU/TK/EN names. Fifteen pairs therefore produce one stored row each. Five pairs have conflicting spellings, ten repeat identical content. These are existing checked-in spellings, not approved replacements for live edits. No source input, checksum, seed command or schema changes here.

Every name below is literal and identical in the RU, TK and EN fields of that input. Indices are zero-based. The spec spells out all three fields independently for both input variants and the final persisted value.

| Model key | Input indices | Input names in source order | Persisted RU/TK/EN name |
|---|---|---|---|
| lexus/is-f | 89, 90 | `IS F`, `IS-F` | `IS-F` |
| hyundai/santa-cruz | 366, 367 | `Santa Cruz`, `Santa Cruz` | `Santa Cruz` |
| chevrolet/trailblazer | 563, 565 | `TrailBlazer`, `Trailblazer` | `Trailblazer` |
| mazda/mazda6 | 595, 606 | `MAZDA6`, `Mazda6` | `Mazda6` |
| nissan/cube | 682, 727 | `Cube`, `cube` | `cube` |
| kia/bongo | 729, 730 | `Bongo`, `Bongo` | `Bongo` |
| ford/th!nk | 968, 972 | `TH!NK`, `Th!nk` | `Th!nk` |
| kamaz/6520 | 1237, 1238 | `6520`, `6520` | `6520` |
| pontiac/solstice | 1475, 1476 | `Solstice`, `Solstice` | `Solstice` |
| komatsu/hm400-5 | 1785, 1786 | `HM400-5`, `HM400-5` | `HM400-5` |
| shantui/sg18-3 | 2299, 2300 | `SG18-3`, `SG18-3` | `SG18-3` |
| shantui/sg24-c5 | 2302, 2303 | `SG24-C5`, `SG24-C5` | `SG24-C5` |
| shantui/sr20ma | 2315, 2316 | `SR20MA`, `SR20MA` | `SR20MA` |
| shantui/sr20yt | 2317, 2318 | `SR20YT`, `SR20YT` | `SR20YT` |
| shantui/srd12 | 2321, 2322 | `SRD12`, `SRD12` | `SRD12` |

The test first compares the entire observed collision inventory to these literals, including input positions and all names. New, missing or changed collisions fail before any container starts. It then combines untouched noncollision input rows with the fifteen literal persisted rows. It does not compute expected winners through a generic last-write-wins rule. The full semantic snapshot comparison still detects missing or altered persisted content. Raw input count 2,435 and all ten semantic JSON checksums stay pinned. Persisted model count is explicitly 2,420, and total identities are `130 + 2420 + 6 + 35 + 10 + 15 + 6 + 4 + 4 + 2 = 2632`. Other families have no natural-key collisions in the checked-in inputs.

## Correction verification and remaining boundary

| Criterion | Evidence | Result |
|---|---|---|
| Exact diff diagnosis and collision inventory | Raw log hash verified; offline parsing matches all 15 removed model slugs and names; independent source enumeration | Pass |
| Literal persisted semantics and ordering | `/tmp/carberk-901-seed-baseline/probe.cjs` and `probe.json` evaluate the spec's expected baseline without starting a container, compare it to an independent prediction of the unchanged CLI, verify both complete rate rows and SQL text ordering | Pass offline |
| Changed collision rejection | 94 offline mutation probes: every RU/TK/EN field of all 30 collision inputs, plus new collision, missing collision, changed key and reversed source order | Pass |
| Affected lint, types and collection | `pnpm --filter @auto-tm/db lint`; `pnpm --filter @auto-tm/db typecheck`; `pnpm --filter @auto-tm/db exec tsc6 --noEmit`; `pnpm --filter @auto-tm/db exec vitest list tests/reference-seed-reconstruction.e2e.spec.ts --json` | Pass; one case collected |
| Docs, vocabulary and runtime imports | `pnpm check:agent-docs`; `pnpm check:glossary`; `pnpm check:runtime-imports` | Pass |
| Scope and preservation | `git diff --check`; base comparison restricts edits to this evidence and the seed spec, retaining all seed JSON/checksum literals, three original reset specs, interrupted spec and both CampaignFullV3 specs byte-for-byte | Pass |
| Corrected container runtime | Root must assemble and run the hosted disposable DB lane on the resulting exact candidate | Pending |

Build prerequisites were generated locally with `pnpm --filter @auto-tm/contracts build` and `pnpm --filter @auto-tm/db build`. Prisma generation/build used only the inert URL `postgresql://offline:offline@127.0.0.1:1/offline`; neither command connects to it. Initial generation without a URL refused config loading; initial typecheck/runtime-import checks lacked compiled workspace artifacts. After the prerequisite builds, both compiler versions and the runtime-import gate pass. These are offline checks, not local PostgreSQL evidence.

Docs: not applicable, internal test expectation and ordering correction against repository source, schema and exact-base hosted evidence. No external dependency or API change.

Stable repeated IDs, distinct fresh IDs, complete semantics, migration history preservation, zero generations and empty sensitive tables remain asserted. The corrected runtime has not run locally. No Docker startup, live access, Railway operation or attempt to bypass the prior Railway refusal occurred. Approved live edits and overlays remain unproved; this baseline does not authorize reference-data cleanup or establish reset/deployment readiness.
