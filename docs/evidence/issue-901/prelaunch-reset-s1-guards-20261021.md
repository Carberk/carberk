# Prelaunch clean reset S1: offline guards and planner, 2026-10-21

Unreviewed S1 checkpoint for #901 under #897, integration PR #904. Base `eeddaf63164af17cbc1552ff0dff0c064f1c5552`. Branch `agent/issue-901-clean-reset-guards-20261021`. It implements §5 of the [first executable slice](prelaunch-reset-first-executable-slice-20261021.md), with the root dispositions below. **Offline only.** No live read, Railway call, ledger write, Docker, CI, credential or variable change. Nothing here is a fresh authoritative observation, and nothing here is a pass of any operator or deployed criterion.

## What changed

| File | Content |
|---|---|
| `scripts/staging-clean-reset.mjs` | Pure functions: `parseRequest`, `guardTarget`, `grantWindowSeconds`, `evaluateQuiescence`, `evaluateWindow`, `planTables`, `nextPhase`. No I/O. |
| `scripts/staging-clean-reset.tables.json` | All 88 `@@map` tables plus `_prisma_migrations`, each with an explicit disposition, and the 14 migration-owned triggers. |
| `scripts/staging-clean-reset.test.mjs` | 18 OT-GUARD, OT-QUIESCE, OT-INV and OT-RETRY offline tests. |
| `scripts/staging.mjs` / `staging.test.mjs` | `clean-reset POLICY.json CLAIM.json` with the exact argument shape. It validates the JSON, pins the staging IDs, refuses production, then stops at `Clean reset executor not implemented`. It runs before any credential, ledger or platform use. The existing staging ID check moved into `pinnedStaging`, unchanged. |
| `package.json` | `test:staging-control` also runs the new test file. |

## Dispositions applied

1. **No caller authority.** Policy keys are `target, projectId, environmentId, services{api,worker}`. Claim keys are `id, candidate`. Observation, attestation, live-inventory and phase records also need exact keys and strict types: finite non-negative safe integers, strict booleans, round-trip ISO times. Any extra key refuses, including `workersStopped`, `publicLaunch`, `quiesced` and `completed`.
2. **Production is disabled.** `PRODUCTION_RESET = { open: false, environmentId: null }`. Only a test can open the injected switch. Even then the guard requires an independently sourced environment ID, exactly one production credential, matching attested identity and `APP_ENV`, and it still ends at `Production executor not implemented`. No environment ID is hard-coded, and no new founder variable or authorization was added.
3. **TTL inventory, not regex scanning.** `GRANT_ISSUERS` pins the exact lifetime definition in 3 signers and 3 `presignUpload` callers. Each definition must occur exactly once. Any other file that imports `@aws-sdk/s3-request-presigner` or calls `.presignUpload(` refuses, and so does a changed, dynamic, duplicated or missing definition. The test computes 900 s from current source and pins `GRANT_WINDOW_SECONDS` to it.
4. **The window comes after authoritative closure.** All of these must hold:
   - readyz is `maintenance` at the candidate;
   - exactly one SUCCESS candidate deployment exists per service;
   - the worker is paused and no consumer has started;
   - every one of the 12 watchdog queues reports exactly 0 workers;
   - the heartbeat is absent and there are 0 other backends;
   - the prior ingress issuer SHA equals the candidate, otherwise the lifetime is unknown.

   The window is then a repeated passing observation with the same operation and candidate, at least 900 s of database time after `closedAt`. If the database clock regressed, the window refuses.
5. **Inventory.** Reference and protected tables are retained in place. `blog_posts` and the `market_knowledge_*` tables refuse when non-empty, and are truncated only when empty, because the FK closure needs it. `diagnostic_centers` refuses when any approved center exists. The planner refuses in each of these cases:
   - an unknown table, schema, FK endpoint or trigger;
   - a retained table holding an FK into the delete set;
   - a TRUNCATE trigger.

   The output is exact `public.<table>` names with `mode: 'RESTRICT'`, no wildcard and no CASCADE.
6. **`cf_` namespaces.** Each must be terminal (`disposed`), have `campaign_records` and have no listing-v1 manifest, or the plan refuses. The plan only *lists* exact `<ns>_{auth,business,promotion,baseline}` detach identities and per-namespace tombstone prefixes `bull:email-code:de:campaign-<ns>-`. Nothing is detached before the S2 transaction.
7. **Phases.** Phases run strictly in order and start only at `attested`. A change in operation, reservation, owner or candidate refuses. A completed phase replays as observe-only. There are no skips, and a claimed completion is rejected.

## Unresolved S2 extension (root clarification)

S1 refuses nonterminal namespaces by default. That is not a requirement to finish the old full-v3 graph or disposal. S2 must be able to inventory old control namespaces and explicitly abandon them after authoritative global producer, consumer and ingress fencing, without preservation machinery. Retained namespaces must also be proved inert to future admissions and worker scans (for example `CampaignSupportRetention`'s `cf_*` scan) before restart. Dropping public row triggers alone does not prove that. Until S2 proves it, the plan emits the restart blocker `cf-namespace-inertness-unproven`.

## Evidence

- RED `92a6a2dd`: `node --test scripts/staging-clean-reset.test.mjs scripts/staging.test.mjs` gave 35 tests, 18 pass, 17 fail. The failures are assertions against the `S1 pending` stub and the CLI's `Unsupported command`; there were no import or setup failures. Log sha256 `34b5b729…cabdccae` (local `/tmp`). The two manifest-pin data tests and the 16 existing CLI tests already passed.
- GREEN: the same command gives 35/35. `pnpm test:staging-control` (clean-reset, CLI, control, ledger, railway) gives 174/174 in 255 s. `pnpm check:agent-docs` and `git diff --check` pass.

## Limits

This proves no execution, deletion, reseed, product behavior or live fact. Adapter field sources are proposed shapes; S2 must map them to Railway, `railway ssh`, BullMQ and `pg_*`. The FK closure trusts the live FK list it is given. Admin and web ingress rely on API maintenance. The production authorization model and identity source remain open. Q2 is untouched.

## Amendment: strict identity strings and own manifest keys

Root inspection of `db77917e` found two guard gaps. `RegExp#test` coerced non-string IDs, so a numeric `projectId` or service ID in both policy and attestation passed the guard. The `in` checks let inherited names (`__proto__`, `constructor`, `toString`) count as manifest tables for live tables, trigger tables and FK endpoints.

- RED `66073251` (test only): `node --test scripts/staging-clean-reset.test.mjs` gave 20 tests, 18 pass, 2 fail. The first failure was a missing expected exception for numeric policy and attestation IDs. The second was a wrong refusal message for a `__proto__` live table. Log sha256 prefix `f5e2235efebf23c8` (local `/tmp`).
- GREEN: every identity pattern (`id`, `hex32`, `sha`, `cf`, owner `login`) now requires `typeof === 'string'` before matching. That covers policy, attestation, claim, deployment, operation, phase and namespace identities. Manifest membership uses `Object.hasOwn`. The focused tests pass 37/37, `pnpm test:staging-control` passes 176/176 and `git diff --check` passes. Scope, the production switch and CLI default closure are unchanged.
