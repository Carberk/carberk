# Executable staging controls

`pnpm staging:control` implements the bounded #901 control foundation. Activation remains blocked until independent review of the exact executable candidate, hosted disposable-Postgres fixture proof, authoritative scoped identity/origin verification and the first reserved deployed acceptance/restoration drill. No command in this implementation phase has mutated live staging. Production and direct-push promotion are outside this interface.

## Commands and inputs

`help`, `discover` and `inspect` need no policy file. `discover` reads Railway CLI project identity and returns only AutoTM staging and application service IDs. It does not prove credential scope or data/media origins. `inspect` reads the shared durable Git ledger.

Other commands require a credential-free policy JSON with exactly these fields:

```json
{
  "projectId": "176ddec0-dd65-4087-b82c-798599fc2ebe",
  "environmentId": "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
  "environmentName": "staging",
  "services": {
    "api": "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0",
    "worker": "24aa02e0-25a9-4e80-9cc2-c1795ef82091"
  },
  "credentialScope": "project:176ddec0-dd65-4087-b82c-798599fc2ebe:652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
  "origins": {
    "database": "postgresql://postgres.railway.internal:5432/REPLACE_WITH_VERIFIED_DATABASE",
    "media": "http://minio.railway.internal:9000",
    "publicMedia": "https://REPLACE_WITH_VERIFIED_STAGING_MEDIA_HOST",
    "api": "https://REPLACE_WITH_VERIFIED_STAGING_API_HOST"
  }
}
```

The IDs above were read through the Railway CLI on 15 October 2026 UTC. They are discovery evidence only. Origins in the example are placeholders; use the sanitized live-discovery receipt in issue 901 evidence, then revalidate before use. Include `admin`/`web` service IDs when they are part of the candidate. Current read-only discovery found staging worker EMAIL_DRIVER=resend and PUSH_TRANSPORT=fcm. Application mutations correctly refuse that configuration until the coordinator prepares mock email/test push under a reservation. A project token scoped to the exact staging environment must be supplied through `STAGING_RAILWAY_PROJECT_TOKEN` from the operator secret store. Never put its value in arguments, JSON files, commits or evidence. Account-wide credentials are not accepted by the GraphQL adapter.

```sh
pnpm staging:control identity /tmp/staging-policy.json
pnpm staging:control enqueue /tmp/staging-policy.json /tmp/staging-request.json
pnpm staging:control acquire /tmp/staging-policy.json REQUEST_ID
```

Request JSON contains `parent`, `pr`, exact 40-character `candidate`, nonnegative integer `priority` and `priorityEvidence`, a campaign issue/PR link documenting the founder's ordering. Lower priority numbers run first, then earliest stored ready time. The authenticated `gh api user` login becomes owner. The returned claim contains exactly `id` and `candidate`; save it in a local claim JSON. These coordination writes do not deploy or change application data.

After independent review and the coordinator's authorization of the first mutation, the operator loads `STAGING_MUTATIONS_AUTHORIZATION` as `RESERVATION_ID:CANDIDATE_SHA` in the process environment. It is an explicit operator gate, not proof of review or a new user-permission requirement. The campaign coordinator authorizes this step after independent executable review. Do not set it during read-only preparation.

```sh
pnpm staging:control operate /tmp/staging-policy.json /tmp/staging-claim.json deploy
pnpm staging:control operate /tmp/staging-policy.json /tmp/staging-claim.json fixture
pnpm staging:control operate /tmp/staging-policy.json /tmp/staging-claim.json reset
pnpm staging:control restore /tmp/staging-policy.json /tmp/staging-claim.json
pnpm staging:control release /tmp/staging-policy.json /tmp/staging-claim.json
```

## Authority and persistence

One remote branch, `refs/heads/ops/staging-lease`, stores an append-only commit history of the queue, reservation and recovery state. The CLI derives owner from the authenticated GitHub login, rechecks it before writes and binds Git credential lookup to that same gh authentication. Every write uses Git's explicit expected-old-ref compare-and-swap. A moved ref refuses the write. Separate repositories and operator processes contend against the same remote, not a shared filesystem lock. No expiry, force unlock or automatic takeover exists. Owners and exact candidates are rechecked before every operation. An in-flight operation is persisted before its first side effect; other operations cannot enter until it finishes. Git timeout/unknown results never grant authority.

This assumes authorized operators use the guarded interface. GitHub writers can bypass it through raw Railway/Git commands; the tool does not change provider RBAC or branch protection. The coordination ref must remain available and protected from deletion/rewrite by operational policy. The reserved branch is created only by the first real enqueue. Implementation tests use disposable local bare repositories.

Lease acquisition checks authoritative identity/origins without requiring mock delivery, so the coordinator can reserve before preparing safe staging configuration. Every application mutation and release requires mock delivery. Each operation obtains fresh authoritative project-token scope, project/environment/service identity, service variables and API domain. It requires staging APP_ENV, explicit private database/media origins, mock SMS/email/test push and unchanged API predeploy migration ownership. Values and provider diagnostics are suppressed. Deployment uses Railway's explicit `commitSha` API and records actual deployment IDs. Proof requires those deployments still active, their exact commit metadata, `/readyz` identity and Postgres/Redis/MinIO checks, and the current worker deployment's boot log. Media proof here covers credentialed MinIO readiness; actual fixture media and native playback remain feature acceptance work.

## Real application fixture and restoration

The fixture creates a deterministic reservation-specific seller and active Listing in the application's `public.users` and `public.listings`, using existing catalog rows without modifying them. It has no phone/email Sign-in Method, payment destination or external delivery. The listing has synthetic text, no media and an explicit synthetic seller. The command succeeds only after the deployed public listing endpoint can read its owned listing and seller IDs. This is a small foundation for later campaign fixtures, not a complete dealer/report/video scenario.

A `cf_<reservation-id>` schema stores the ownership manifest and exact original application rows. Idempotent reuse requires unchanged originals. Cleanup locks those rows and checks all incoming foreign keys before deleting the exact owned listing and seller. It refuses changed rows, new sessions/favorites/conversations or other unexpected references. It never truncates shared tables, resets sequences, cascades deletes, edits catalog or invokes repository test suites. Missing catalog, ID collisions or unexpected schema dependencies fail closed. Later feature fixtures must extend this ownership contract and add behavior evidence before use.

Restoration fetches current remote `main` on each attempt, deploys that SHA, cleans the owned application fixtures and verifies actual deployment/readiness plus the exact successful Prisma migration inventory. Release fetches main again and refuses if it moved. No automatic downgrade is attempted: candidate Prisma schema/migration differences are refused before deployment. A changed persistent schema, failed cleanup or unknown deployment remains blocked, with owner/action retained. The database's listing-number sequence may advance when fixtures are created; cleanup never rewinds shared sequences.

Interrupted in-flight operations deliberately remain blocked. Inspect the ledger and provider state; there is no automatic clearance command. A reviewed recovery extension is required if an operation's completion cannot be established by this bounded path. Do not delete or rewrite the ledger to recover. `native-pr-seed` continues refusing staging.

## Evidence

`pnpm test:staging-control` runs deterministic command, real Git contention, authority, network-boundary and recovery tests without containers. `packages/db/scripts/staging-reserved-fixture.e2e.spec.ts` runs the executable remote SQL against a migrated disposable PostgreSQL instance in the existing hosted `db` job. The required `pr` check includes that job. Repository typecheck, affected lint and unit tests remain separate gates. See [issue 901 evidence](../evidence/issue-901/verification.md) for actual results and missing gates.
