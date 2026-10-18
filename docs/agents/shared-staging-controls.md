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
pnpm staging:control recover /tmp/staging-policy.json /tmp/staging-claim.json
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

Restoration fetches current remote `main` on each attempt, deploys that SHA, cleans the owned application fixtures and verifies actual deployment/readiness plus the exact successful Prisma migration inventory. Release fetches main again and refuses if it moved. No downgrade is attempted. The closed profile in `scripts/staging-schema.mjs` admits only exact reviewed additive SQL checksums and matched Prisma schema snapshots. Existing migration edits/removals, unknown additions and unreviewed schema snapshots refuse deployment. The current profile covers the exact campaign migrations through `20261015290000_conversation_measurement_cohorts`, including diagnostic association invalidation and nullable first-message cohort references. Those additive tables, columns and integrity triggers remain after current-main code restoration. The hosted compatibility test checks each retained SQL fixture checksum and exercises the baseline listing/user contract after applying the full inventory. The operation, completed proof and release history retain the full migration name/SHA-256 inventory, including additions absent from main; the next reservation inherits it. Runtime proof compares that exact inventory against completed, non-rolled-back `_prisma_migrations` records and refuses unfinished migrations. This proves the migration disposition, not arbitrary manual database drift. Later campaign migrations require a reviewed profile/SQL-fixture extension and compatibility evidence. A failed cleanup or unknown deployment remains blocked, with owner/action retained. The database's listing-number sequence may advance when fixtures are created; cleanup never rewinds shared sequences.

Interrupted operations retain ownership. `recover` observes the durable operation without retrying a deployment or changing application data. It requires a complete recorded deployment-ID set, those exact deployments currently active and SUCCESS at the operation SHA, readiness/worker proof, exact migration checksums and unchanged owned-fixture or proven-absence evidence. Fixture recovery also reads the owned Listing through the actual API. Restore recovery additionally requires absent fixtures and fresh unchanged main. A successful recovery appends the full interrupted operation, deployment IDs and migration evidence before clearing it; candidate recovery still requires normal current-main restoration before release. Partial deployment journals, lost IDs, changed rows, failed proofs and moved main remain blocked with a reviewed-completion next action. No force unlock, takeover or ledger rewrite exists. `native-pr-seed` continues refusing staging.

## Evidence

`pnpm test:staging-control` runs deterministic command, real Git contention, authority, network-boundary and recovery tests without containers. `packages/db/scripts/staging-reserved-fixture.e2e.spec.ts` runs the executable remote SQL against a migrated disposable PostgreSQL instance in the existing hosted `db` job. The required `pr` check includes that job. Repository typecheck, affected lint and unit tests remain separate gates. See [issue 901 evidence](../evidence/issue-901/verification.md) for actual results and missing gates.

## Campaign897 identity prerequisite profile, default closed

`campaign897-identities-v1` has hosted disposable PostgreSQL RED and GREEN evidence and awaits independent review. It does **not** unlock the campaign acceptance plan. Preparation refuses before SQL unless the API process has `STAGING_CAMPAIGN_PROFILE_ENABLED` set to the exact profile name. Leave it unset until the assembly owner records successful hosted RED/GREEN, independent review and a supported cleanup contract for the intended use. The flag gates preparation only, so turning it off cannot prevent observation or guarded disposal. Existing reservation authorization, fresh Railway scope/origin/mock checks and exact active deployment/readiness/schema proof still apply. No new production API, fixed code, JWT/session creation, TOTP secret or elevation bypass is introduced.

The command accepts one exact profile argument and no state file, arbitrary SQL, identity overrides or historical imports:

```sh
pnpm staging:control operate /tmp/staging-policy.json /tmp/staging-claim.json fixture campaign897-identities-v1
pnpm staging:control operate /tmp/staging-policy.json /tmp/staging-claim.json reset
pnpm staging:control recover /tmp/staging-policy.json /tmp/staging-claim.json
pnpm staging:control restore /tmp/staging-policy.json /tmp/staging-claim.json
pnpm staging:control release /tmp/staging-policy.json /tmp/staging-claim.json
```

Profile selection is persisted before side effects and cannot change within a reservation. A reservation with an earlier narrow fixture cannot adopt campaign identities. Omitted profile continues to select the narrow fixture for a fresh reservation. Reset, recovery and restoration derive the campaign profile from the durable lease, never a new caller override. Restoration uses the original reservation candidate to identify owned rows while proving the freshly fetched main deployment separately.

| Alias | Bootstrap authority | Supported prerequisite |
|---|---|---|
| `buyer-a` | Marketplace buyer | Synthetic verified email |
| `owner` | Marketplace seller | Synthetic verified email, no business membership |
| `sales-a` | Marketplace buyer | Synthetic verified email, no Sales membership |
| `coordinator` | Marketplace buyer; exactly `staff.manage`, `founder.control` | Synthetic verified email and two atomic system bootstrap audits |

IDs and `.invalid` email methods are deterministic from reservation, candidate and alias. Bootstrap refuses existing ID/email/OTP destinations and audit IDs, never adopts another User, and creates no phone method. The protected alias-to-ID/method receipt lives in `cf_<reservation>.campaign_entities`. Read it only through the reserved operator database channel; do not publish its contents. The ledger/CLI return only profile, state, counts and that protected receipt location. No code, token, QR secret, session hash or encrypted TOTP material enters public receipts or the control ledger.

`identities` is the supported active state. `cleaning` durably fences new authentication writes, queue enqueue and mock sends while disposal is incomplete. `disposed` is terminal. There is no scenario transition/import command. Use production OTP/TOTP endpoints for authentication; code observability depends on the separately reviewed mock delivery sink. No deployed authentication proof exists for this profile. Signed-in application writes can change auth rows through the normal adapters; triggers record exact row keys, versions, hashes and mutation events in the reservation schema. Allowed tables are Users, Sessions, sign-in email OTP requests, TOTP enrollments/backups, the two coordinator grants, and wholly owned User audit targets. The graph is capped at 128 distinct records and 2048 events. The trigger refuses identity/method/role transfers, profile photos, foreign audit targets, unsupported grants and unsupported OTP purposes. It does not grant permission to exercise untracked domain graphs.

Cleanup locks the supported auth tables, rechecks manifest binding, trigger availability, current row hashes and every incoming FK. Any unknown child, composite/non-ID FK or foreign reference refuses the transaction before deletion, including rows that PostgreSQL would otherwise cascade or unlink. It explicitly deletes tracked auth children before the exact Users. Owned bootstrap audits retain only a redacted synthetic-campaign target and disposition; no other audit-retention policy is implied. A terminal reservation schema, aliases, hash journal and triggers remain as an explicit tombstone to reject late auth writes and identity recreation. This is retained control metadata, not complete schema erasure. It must be included in schema inventory and independently reviewed. Repeated reset of a disposed profile observes the same disposition; a disposed reservation cannot bootstrap again.

The fixed profile journals every owned Sign-in Code request ID and destination in `campaign_delivery_ledger`, including requests later deleted by normal retention. New namespaces carry `delivery_version=1` and a journal digest. Old or missing journals fail closed and require reviewed recovery; deleting a live request is never delivery-absence proof. The API enqueue adapter and worker sender share the namespace advisory fence. Campaign mail is accepted only by the staging mock driver and persists rendered content in the protected `campaign_delivery_sink`, never in the ordinary in-memory mock or a provider. The normal Sign-in Code endpoints and verification remain the only authentication path.

Reset commits `cleaning` under the auth locks before inspecting Redis. API and worker must use the same freshly attested internal Redis database. Cleanup validates the complete bounded job inventory using exact journaled request IDs, queue contract, recipient, purpose, state and absence of flow dependencies. It removes only those jobs through BullMQ and verifies their absence before deleting the persisted sink and tracked auth rows. Active, malformed, foreign, parented or unknown jobs refuse; ownership and the cleaning fence remain. A lost queue/SQL response can be resumed without guessing whether the first attempt finished. Repeated reset of a disposed namespace only observes queue/sink absence. The delivery journal, hash journal, aliases and terminal triggers remain as cleanup authority; no complete metadata erasure is claimed.

An explicitly invoked ordinary `reset` can continue only a durably recorded in-flight campaign reset with the same operation ID, reservation, owner, namespace, profile and candidate. It freshly verifies candidate deployments, identity and mock readiness, then resumes the remote idempotent cleanup. Missing legacy binding, changed authority or any non-reset operation refuses. General `recover` remains observation-only. Unknown or partial cleanup retains the journal and reservation; it does not permit deployment replay or automatic background mutation.

Before restoring latest main, the control requires successful complete disposal evidence persisted in the coordination ledger for the current reservation/candidate/profile. An in-memory response, caller flag, partial counts or a receipt predating the latest fixture operation is insufficient. Run ordinary reset while the candidate enqueue/send fences remain deployed. After main deploy, the campaign path probes the established disposal and cannot first dispose an active graph. Missing proof records the owner and recovery action while retaining ownership. Full hosted GREEN, independent review and reserved deployed authentication/restoration proof remain activation gates; source implementation alone does not authorize staging use. Unknown domain writes such as business admission, Listing, attachment or service data still block reset via foreign references and require a separately implemented cleanup profile. Never repair them with ad hoc deletes against staging.

Buyer B, Sales B, business admission/invite/redeem, founder admission/recovery/refund grants, Support, History/payment/export, Reception/template/center, Technician, independent Reviewer, private self-review, Aggregate, Investigator and marketplace moderation remain unsupported. So do every photo/video/upload/rendition/job, message/attachment/push binding, service/history/payment/artifact, diagnostic graph, historical cohort, time-aged state and analytics/Operations evidence import. No mature telemetry, synthetic center or full campaign cleanup claim follows from this checkpoint.

Preflight uses variable **names** only in evidence: `STAGING_RAILWAY_PROJECT_TOKEN`, `STAGING_MUTATIONS_AUTHORIZATION`, `STAGING_CAMPAIGN_PROFILE_ENABLED`, `APP_ENV`, `SMS_DRIVER`, `EMAIL_DRIVER`, `PUSH_TRANSPORT`, `AUTOTM_COMMIT_SHA`, `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_URL`. Current API/worker service scope, database/media origins and exact deployment IDs remain independently checked. Future video/service/diagnostic/measurement allowlists are not enabled by this profile. No token creation, deployment, lease, configuration or staging mutation was performed by its implementation writer. See [checkpoint evidence](../evidence/campaign897-fixtures/verification.md) for ordered tests and missing gates.
