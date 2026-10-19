# Full-v3 bootstrap source candidate

This is one bounded production-source slice after actual supported-profile RED. It is not full authentication support, hosted GREEN, operational activation or release completion. The marketplace and the entire accepted #897 next-release scope remain required. Root alone assembles into draft/auto-merge-off PR #904.

Owner: sole isolated #901 writer in `/Users/bagtyyar/.t3/worktrees/auto.tm-rewrite/t3-ca82c5cd`, branch `agent/issue-901-full-v3-auth-tests-20261019`. Supplied base: `2c645d2830d7fbd5a84dbd3c076658dbe4502891`. No main or independent branch was pulled/replayed. Test-only observer correction is a separate preceding commit `d0857c46`, described in [its own handoff](fence-observer-freshness-20261019.md); the v3 source commit does not change that test. Neither the eight-case API acceptance spec nor its worker helper changed.

## Actual RED and scope of evidence

Root supplied actual PR Checks `39220303556`, API job `117953851247`, exact head `2c645d2830d7fbd5a84dbd3c076658dbe4502891`. Seven of eight CampaignFullV3 tests failed at `seed()` line 99, label `full-v3 supported explicit profile required`, expected exit 0/received 1. The absent-enable/unknown-version negative passed. API totals were 2966 passed/seven failed, 312 files passed/one failed; worker unit 356/356 passed. Root's raw/plain logs are `/tmp/carberk-next-release-20261019/2c645d28-api-117953851247.{raw,plain}.log`. These are parent-supplied results, not child-polled CI.

That RED establishes missing supported-profile behavior only. Manifest contents, bootstrap/reset SQL, collision integrity, budgets and every nested ordinary OTP/TOTP/session/grant/admission/redemption/content/disposal assertion were UNREACHED. There is no nested auth RED or GREEN to implement against yet.

## Source boundary

`scripts/staging-remote.mjs` now recognizes the one fixed `campaign897-full-v3` string at the serialized fixture/reset boundary and requires exact explicit enablement for fixture creation. The existing authoritative environment and candidate checks remain. Unknown versions still refuse. V3 probe is unsupported and refuses without a receipt or mutation. This does not expand CLI/controller/Railway entry-point allowlists; their files are unchanged.

`scripts/staging-campaign.mjs` reuses `businessMain` instead of duplicating its graph engine. It selects between exactly the existing business-v2 and new full-v3 profiles and hardcodes manifest version 2 or 3. It accepts no caller table, role, alias, version, capability or SQL configuration. V3 additionally validates its reservation/namespace grammar and restricts itself to fixture/reset. Deterministic identities/root are separated by profile. The fifteen aliases, ordinary buyer roles, recovery synthetic business, owner membership, two coordinator grants and their two bootstrap audits are unchanged in scope. No Session, OTP, enrollment, elevation, extra grant, admission or active status is seeded.

The shared bounded engine retains row/event and cleanup-headroom limits, table-lock-before-advisory-lock ordering, fixed ownership edges, collision checks, journal/event/schema/function/trigger fingerprints, foreign FK/JSON/polymorphic preflight, cleaning/disposed refusal, exact child-first reset, audit redaction and terminal retry. V3's baseline reset is storage-only and emits no authentication/admission or queue-disposal claim.

A bootstrap-only profile must not allow untracked failed sign-in data. V3 therefore adds Sessions, OTP requests, TOTP enrollments and backup codes to the locked/schema-fingerprinted/trigger-checked relation set solely to refuse owned auth writes. OTP ownership is detected by reserved destination or User ID, including the destination-only request with no User FK. Existing auth rows colliding with this namespace refuse bootstrap/reuse/reset rather than being adopted or deleted. The auth gate is before journal mutation, so it rolls the ordinary write back. It does not implement delivery/auth tracking or delete ordinary auth records.

V3 creates empty exact-key delivery ledger/sink tables so baseline disposal postconditions can inspect an explicit empty inventory. Integrity refuses any entries while that delivery slice is unsupported. These tables neither authorize enqueue nor admit delivery; the existing package email fence remains v1-only and unchanged. No queue calls or tombstone modifications occur in the new bootstrap path. V1 queue/sink disposal and its tombstones remain unchanged.

This source cannot claim the eventual v3 contract is complete. The normal HTTP admission-created second business, ordinary auth and grant transitions, delivery ownership, TOTP lifecycle, active ownership/content and exact joined disposal remain future reached-evidence work under the [test contract](full-v3-auth-test-handoff-20261019.md). No product permission or lifecycle guard was relaxed to let these tests pass.

## Local verification

No local services, Docker, database connection, staging, provider mutation, delivery, browser/device, CI dispatch/polling, GitHub metadata, PR, release or closure action occurred. All logs below live in `/tmp`.

- `node --check scripts/staging-campaign.mjs` and `node --check scripts/staging-remote.mjs`: PASS, JavaScript syntax only.
- `node /tmp/issue901-v3-bootstrap-source-check.mjs`: PASS, log `issue901-v3-bootstrap-source-check.log`. Inspection program compares base/current v1 `campaignMain`/queue function text and four v2 generated SQL paths, fresh fixture, live reset, disposed reset and disposed probe. V1 function text and all captured v2 SQL are byte-identical. It also inspects generated v3 version/closed-slice guards and exercises missing-enable/probe refusal with a fake transport. This is generation/orchestration evidence, NOT SQL execution. Script is preserved in `/tmp` for root recovery, not added as a duplicate source-shape test.
- `node --test scripts/staging.test.mjs scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs scripts/staging-railway.test.mjs`: existing control/CLI/Railway unit harness; log `issue901-v3-bootstrap-controls.log`. Final outcome recorded below. Its isolated Git/fake-provider checks make no real provider mutation and do not establish PostgreSQL behavior.
- `pnpm --filter @auto-tm/db typecheck`, `pnpm --filter @auto-tm/db exec tsc6 --noEmit`, `pnpm --filter @auto-tm/db lint`: PASS, logs `issue901-observer-{ts7,ts6,lint}.log`, cover the separately assigned observer correction.
- `pnpm --filter @auto-tm/db test:unit`: PASS, 97/97 across eleven files; log `issue901-observer-db-unit.log`. No SQL acceptance hooks.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list --no-staticParse src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`: PASS, eight unchanged tests collected, hooks not executed; log `issue901-v3-bootstrap-collection.log`.
- `pnpm check:agent-docs` and `git diff --check`: final results recorded below. Docs log `issue901-v3-bootstrap-docs.log`.

Docs: internal reuse of existing mechanisms and no dependency/configuration changes. PostgreSQL observer documentation and exact official URLs are recorded in the separate observer handoff. No new external API is introduced by the bootstrap source.

## Next root action and remaining gates

Inspect the two distinct checkpoint commits, serialize approved changes into the integration candidate, then run the configured hosted `pnpm test:api` and `pnpm test:db` lanes. Focused unchanged acceptance command on fresh configured disposable services is:

```sh
pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --maxWorkers=1
```

This source candidate is expected to advance beyond supported-profile seed, but even baseline bootstrap/reset GREEN is UNKNOWN until actual PostgreSQL execution confirms it. An expected next ordinary-auth failure is OTP request HTTP 500 versus required 201 because the v3 auth tracker deliberately refuses the unsupported write. That is a prediction, not actual RED. If setup/SQL fails earlier, classify that actual barrier honestly. Do not infer success for deeper enrollment, grants, admission, content or disposal assertions. The budget case may expose a different next barrier, since its existing business-free draft storage probe is not admitted by this bootstrap's preserved business-ownership guard. Do not weaken that test or broaden source preemptively.

Root must return newly reached exact behavioral failures before a subsequent source slice. Full-release graph completion, independent review, required resulting-candidate checks, deployed/native acceptance and restoration remain outside this checkpoint. V3 operational enablement remains closed.

Final local outcomes: staging/CLI/control/ledger/Railway tests PASS, 153/153; agent documentation links/headings/routes PASS; JavaScript syntax and whitespace PASS. V3 PostgreSQL bootstrap/reset and the observer's full SQL postconditions remain unexecuted locally and UNKNOWN pending root's hosted candidate run. The eight API cases/helper are byte-unchanged from 2c645d28. No owned process is intentionally left running.
