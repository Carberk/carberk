# Issue 901 implementation evidence

Base `7af49d4c1474b2c3d841b14736c4ef59ce155a4e`. Scope is reserved staging controls only. No live staging mutation is authorized in this implementation phase.

## Red checkpoint

`node --test scripts/staging-ledger.test.mjs` failed on 15 October 2026 UTC with `exactly one exclusive owner must win`, expected 1, observed 0. The transport skeleton cannot acquire a durable owner. The test creates a disposable local bare Git remote and two independent repositories. No GitHub coordination ref was created.

The public seams under test are durable compare-and-swap, reservation commands and the Railway network/process boundary. The coordinator authorized these bounded executable controls and actual concurrent Git ref contention, without a separate architecture approval round.

Docs: https://git-scm.com/docs/git-push verified explicit expected-value force-with-lease and concurrent ref protection. https://docs.railway.com/api/llms-docs.md verified project-token scope, variables, service identity and specific-commit deployment API. https://docs.railway.com/cli/ssh.md verified explicit project/environment/service SSH selection. Installed Railway 4.57.1 lacks the newer documented `railway api` command, so the adapter uses the documented GraphQL endpoint directly. No dependency upgrades.

## Narrow ownership checkpoint

`node --test scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs` passed 3 tests after implementing the durable Git compare-and-swap transport, queued founder-priority/ready ordering, owner/candidate/identity records and initial authoritative-attestation comparison. Two independent object repositories contend on one bare remote. A fresh object repository reads the winning record. This checkpoint has no mutation/release commands and cannot activate staging. Further operation/recovery red tests were committed in `de3dfb37` and remain pending implementation outside this narrow checkpoint.

## Bounded executable checkpoint

The implementation now includes `pnpm staging:control` and the operational input/command contract in `docs/agents/shared-staging-controls.md`. The broad `native-pr-seed` and its staging refusal are unchanged. No main push, issue PR, deployment, migration, fixture, reset, external message or production operation was performed.

Red checkpoints are preserved on the branch:

- `e946dead`: durable transport skeleton failed the exclusive-owner criterion, expected one winner, observed zero.
- `54a378c6`: queued reservation skeleton failed with reservation queue unimplemented.
- `de3dfb37`: operation/recovery criteria failed because those public operations did not exist. This is retained as missing-behavior evidence, not an import/setup failure.
- `7976839a`: actual Railway adapter lacked live scoped attestation.
- `f3c8d2a4`: missing explicit mutation authorization and credential-bearing media reached the SQL boundary, expected zero calls, observed three.
- `896b0062`: command interface lacked help and bounded-command refusal.
- `84804d53`: fixture adapter accepted a receipt for a listing the application could not read, so the expected rejection was missing. This checkpoint also adds the real migrated-PostgreSQL fixture tests. Their behavioral red/green receipt is still pending hosted execution; a local attempt failed at unavailable container runtime before either test body ran. No container started. No further local container attempt was made.

### Evidence boundaries and results

`pnpm test:staging-control` passes the focused deterministic controls. This includes actual Git ref contention from independent repositories and separate operator processes against disposable bare remotes; queue ordering; changed owner/candidate/identity; deployment/reset contention; blocked interrupted recovery with actual deployment IDs journaled; fresh main at restore/release; moved main during proof; absent authorization; unsafe origins/scope; remote identity refusal before SQL; and deployed application-listing visibility at a fake HTTP boundary.

The Git contention is real Git/process/storage behavior. Railway GraphQL/SSH/HTTP and SQL-refusal unit evidence use only external-boundary substitutes. They do not prove successful live deployment or SQL execution. The actual application fixture SQL creates reservation-specific public seller/Listing rows, snapshots originals in its manifest and refuses changed originals or incoming references before cleanup. Its integration tests run that executable remote program against a migrated disposable PostgreSQL instance in the existing hosted `db` job. Vitest includes `scripts/staging-reserved-fixture.e2e.spec.ts`; `pnpm test:db` invokes the db workspace's full test suite; both PR Checks and CI have that job, and required `pr` depends on it. This remains a required hosted gate.

Local gates passed after preparing generated/runtime packages with a build-only loopback DATABASE_URL:

- `DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm typecheck`, 11 successful tasks.
- `DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm test:unit`, 10 successful tasks. Existing API unit suite reports 2057 passed, 2 skipped; other workspace results include cached receipts.
- `pnpm test:root`, 253 passed before the final additional authority/recovery tests; the final affected focused suite is recorded separately below.
- DB workspace `tsc --noEmit`, `tsc6 --noEmit` and `lint`.
- `pnpm check:agent-docs` and `git diff --check`.

Initial typecheck/unit attempts without DATABASE_URL failed at Prisma config generation. After setting the build-only loopback placeholder and building contracts/db, the same gates passed. Initial broad staging glob also included the existing reviewer smoke before runtime contracts were built; the focused command now names only its own four test files. The later root gate includes the reviewer smoke and passed.

### Authoritative read-only live discovery

On 15 October 2026 UTC, `railway list --json` and Railway MCP `get_service_config`/`list_variables`, with explicit project/environment/service IDs, returned the following sanitized identity. Variable responses were filtered inside the tool runtime; credentials, tester/reviewer accounts and raw variable/log streams were never printed or persisted.

- Project `176ddec0-dd65-4087-b82c-798599fc2ebe`, staging `652abc79-fdb0-48b0-9f6c-ad0ff572d7b2`.
- API `6db6f1b1-5c7a-4033-88d0-53f5f315bfc0`; worker `24aa02e0-25a9-4e80-9cc2-c1795ef82091`.
- Database `postgresql://postgres.railway.internal:5432/railway`, no URL query overrides, credentials omitted.
- Private media `http://minio.railway.internal:9000`; public media `https://minio-staging-5795.up.railway.app`; API `https://api-staging-2861.up.railway.app`.
- API APP_ENV=staging, SMS_DRIVER=mock, maintenance=false. Source repo matches this repository; health path `/readyz`.
- Worker APP_ENV=staging, EMAIL_DRIVER=resend, PUSH_TRANSPORT=fcm, maintenance=false. This is an unsafe live configuration for disposable acceptance. Mutation attestation refuses it. Lease acquisition checks authoritative identity/origins separately so the coordinator can reserve before preparing mock delivery.

This discovery used existing account-authorized operator tools. It is not the scoped project-token proof required by the executable mutator. `STAGING_RAILWAY_PROJECT_TOKEN` and `STAGING_MUTATIONS_AUTHORIZATION` were both absent from the implementation process.

### Remaining activation inputs and gates

1. Independent Standards/Spec review of the actual executable checkpoint and hosted disposable PostgreSQL fixture tests. Fixes receive affected checks.
2. A Railway **project token scoped to this exact staging environment**, supplied from the operator secret store as STAGING_RAILWAY_PROJECT_TOKEN. Railway Project Settings > Tokens permits selecting the environment when creating the project token. The official API verifies it through `projectToken { projectId environmentId }` with `Project-Access-Token`; account/workspace bearer tokens are not substituted. No token was created in this phase.
3. Fresh successful `identity` verification against the sanitized policy, with worker mock-email/test-push preparation under the coordinator's exclusive lease. Preserve/restore existing environment configuration deliberately; the closed CLI does not write arbitrary variables.
4. The coordinator's authorization after review, then first serialized real deployment/owned application fixture/API read/reset/current-main restoration/release drill. The authorization is the already delegated campaign step, not an unanswered founder-permission request.
5. Schema changes remain refused until persistent migration disposition is proven. This foundation does not claim code rollback reverses migrations. Interrupted unknown operations stay blocked with owner/action and known deployment IDs; there is no force unlock. Changed fixture originals or new references also require explicit reviewed disposition.

Docs: https://cli.github.com/manual/gh_auth_git-credential verified the credential-helper protocol; the CLI uses authenticated gh identity for owner and Git remote credential lookup. https://docs.railway.com/integrations/api verified environment-scoped project-token authentication. No provider/branch-protection setting or paid infrastructure was added.

### Final affected verification

Final root-script rerun passed 257 tests after the additional process-contention, authenticated-owner, deployment-journal and main-move checks. An additional actual Railway-adapter proof test found that a latest active instance marked BUILDING could be accepted alongside SUCCESS deployment metadata. Red checkpoint `fc673a7a` records the missing rejection. The adapter now requires both actual deployment and current active-instance status SUCCESS; the affected focused suite passes 23 tests, including success, stale active ID, wrong SHA and active BUILDING cases.

A constant-output read-only SSH identity probe using the same encoded Node invocation was attempted with existing operator authentication. It was unavailable; diagnostics were suppressed. Remote command quoting/SSH execution therefore remains part of the required first reviewed deployed drill, not proven by account-level variable discovery.
