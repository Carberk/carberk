# 80 — Deployment runbook

The end-to-end procedure for shipping a new version of Carberk. There are two operating eras:

1. **Railway era (ADR-0039):** staging + reviewer-only production until both stores approve and the TM cutover gates are met. GitHub Actions owns CI; Railway builds/deploys after CI.
2. **TM era (ADR-0005):** permanent TM-serving production uses the air-gapped bundle procedure later in this document. Railway remains non-TM staging.

The following foundation paragraph records the 2026-09-13 evidence, not current sprint or runtime status. Railway **staging** is live and its data plane, application deploys, and backup/restore path have been exercised — see the evidence files under [`evidence/`](evidence/). Railway **production** now exists, but is not ready for promotion. The duplication cleanup completed on 2026-09-13 — production Postgres and Redis are verified empty and reviewer flags read back correct — while production push credentials, migrations, the reviewer seed, and runtime readiness remain open and are deferred to #282. Application revisions did run in production during the duplication incident; that breach is recorded, not erased. See [production foundation evidence](evidence/issue-281-production-foundation.md) for the current gates; the release procedure below is not proof that they passed.

## Integration acceptance transition

The [accepted ADR-0098](../../adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md) prepares one shared staging acceptance lane. [Reservation operations](../../agents/shared-staging.md) own candidate identity, exclusive mutations, disposable data and restoration to latest `main`. Activation awaits guarded fixtures/resets and transition evidence. Repository tests retain hosted disposable services; production promotion stays a separate release action. Historical evidence below establishes only its dated claims; inspect current deployment IDs, SHAs and readiness for a new release.

## Pre-flight checklist

Before kicking off a release:

- [ ] Migrations: every new schema change has a Prisma migration file
- [ ] Tests pass on the GitHub-hosted CI runner (ADR-0073)
- [ ] No `console.log` in API code (or it's intentional and on `LOG_LEVEL=debug`)
- [ ] `CHANGELOG.md` (or release notes) updated
- [ ] Verify the date-time + version tag in `package.json` matches what's intended
- [ ] Back up the target environment database BEFORE deploying (safety net for migration failures)
- [ ] Confirm current beta feature-flag values are recorded before deploy (`SIGNUPS_ENABLED`, `LISTING_PUBLISH_ENABLED`, `LISTING_MUTATIONS_ENABLED`, `CONTACT_ENABLED`, `REPORT_ENTRY_ENABLED`, `ADMIN_MODERATION_ACTIONS_ENABLED`)
- [ ] For schema-changing deploys, confirm the last successful restore drill used a staging/prod-like database + media backup less than 30 days old

### Reported Profile Photo moderation

For **both staging and production**, the API needs
`ADMIN_MODERATION_ACTIONS_ENABLED=true` to let an elevated admin remove a reported
User's Profile Photo from the existing report queue. With `false`, staff reads
and audit access remain available, but moderation writes are disabled and the
admin report page hides the removal action. The action uses
`POST /api/v1/admin/users/:id/remove-photo`, restores the Assigned Avatar, marks
the report actioned, and records `USER_PHOTO_REMOVE` in the audit log.

Record the flag's value in each environment during the deployment checklist.
Enable it through the existing environment deployment process; documenting the
required value does not change staging or production configuration. The admin
service needs `NEXT_PUBLIC_MINIO_PUBLIC_URL` set at runtime to that environment's
public media origin to display the reported photo from `listing-photos`. The
report page reads it in its dynamic server component on each request; it is not
a build argument. If unset, the page shows «Фото профиля недоступно.» and hides
photo removal until the preview can be displayed.

## Railway era — staging and reviewer-only production

Use the host's [existing Railway CLI authentication](../../agents/cli-access.md) and explicit target IDs. Missing project-token environment variables alone are not an access blocker.

### Production foundation: what duplication taught us

**The recovery itself is complete** — see [#281 evidence](evidence/issue-281-production-foundation.md)
for the verified end state. The rules below are the durable lessons; they apply to
any future environment duplication, not to an outstanding cleanup.

Duplicating staging copied Postgres/Redis data, application secrets and deployment
triggers, and automatically deployed the four application services. Do not treat
environment duplication as an empty or inert foundation. Verify destination
deployment history, triggers, secret separation and actual data contents before
claiming isolation.

The current production environment is
`c628b9bf-08ef-45f6-976f-3d646e0ebfbd`; earlier evidence may identify the previous
empty environment. Resolve the target before each operation. Volume IDs are
project-level and shared between environments. Never use project-wide volume
deletion or an unscoped detach to repair one environment.

Operate on the live server's state, not on the file it persists to. Park Postgres
on `sleep infinity` so the data directory is idle rather than racing a live server
before touching it. Deleting Redis's `dump.rdb` is futile while the server runs
with `--save 60 1` — it rewrites the file from memory, so `FLUSHALL` then `SAVE` is
what actually clears copied keys. A successful configuration mutation response is
insufficient; read the settings back before redeploying.

The installed Railway CLI refuses agents permission to delete volume files.
A human must run the reviewed, production-scoped command from an external
terminal. Do not strip agent-identification variables to bypass this guard.
`--volume` belongs to `volume files`, before the `delete` subcommand, and the
production environment flag must remain present.

After any such cleanup, verify fresh Postgres initialization and actual credential
authentication, then Redis startup with zero copied keys. Remove any temporary
public database proxy immediately after its probe. Recovery is incomplete until
temporary settings and directories are removed and the results are recorded.

Never display raw `railway environment config --json` or variable listings.
Inspect metadata and names-only or pass/fail assertions through a filtered
wrapper; these commands can otherwise expose every application secret.

### Step 1 — CI gate and revision selection

1. Merge to `main` only after the required GitHub Actions check (`pr`) passes on the GitHub-hosted runner (ADR-0073).
2. Railway staging follows `main` with **Wait for CI** enabled (`checkSuites` on each service's deployment trigger). A failed required check must not create a staging deployment; Railway records the trigger as `SKIPPED` and creates no build. A deployment held for a still-running check sits in `WAITING`.
   Railway has **no cross-service deploy ordering**: a green `main` push fans out to every service with a trigger, in parallel. Any release carrying a migration must be ordered by the operator — deploy `api` explicitly, wait for `/readyz`, then deploy the rest.
   A `SKIPPED` trigger is **final for that SHA**. Railway acts on the check suite's first conclusion, so re-running a flaky failed CI job to green does *not* un-skip the deployment — no new deployment appears. Recover by deploying that SHA explicitly, or by carrying it forward in a later commit. Verify with `list-deployments` rather than assuming the re-run was enough.
3. Record the git SHA selected by the staging deployment.
4. Production has no branch autodeploy. Select only the exact SHA that passed the staging smoke and require a human production approval.

Railway owns build + deploy, not the test gate. Preview environments are optional and are not a substitute for permanent staging.

### Step 2 — Build, migrate, and become ready

Each environment has `api`, `worker`, `admin`, `web`, Postgres, Redis, and MinIO. `sms-gateway` and `phone-agent` do not run on Railway.

- Build each application from the monorepo root so shared workspaces and lockfiles remain in the build context.
- Use service-specific start commands. The per-service deploy contract is declared in `railway/*.json`, but Railway no longer reads config files from the repo: apply Dockerfile path, start command, pre-deploy command, healthcheck, restart policy, and sleep mode provider-side per environment and record what you applied in that environment's evidence file (ADR-0044).
- `sleepApplication` takes effect on the service's **next deployment**, not immediately. A service already asleep on the previous revision stays asleep until it is redeployed.
- Run `prisma migrate deploy` through the single release authority defined by Sprint 11. Never use `migrate dev` or `db push`.
- Set `PORT` explicitly per service. Railway injects `PORT=8080` into every service and it overrides the `ENV PORT` baked into the image, so a service whose Railway domain targets the port the Dockerfile declares will return `502` with no application error until the two agree.
- Set admin `API_BASE_URL` to the API's http(s) private origin, optionally ending in `/api/v1`. Both forms accept a trailing slash. Production admin refuses startup when the variable is absent or invalid. `/healthz` remains independent of API availability after configuration validation.
- Required in production: set admin `ADMIN_ORIGIN` to its exact public browser origin (scheme and host, no path or trailing slash); POST origin checks and login redirects must use this origin behind the private Next listener. A mismatch returns 403 at the TOTP step and on protected actions; verify it before operator sign-in.
- Keep admin at **one replica running exactly one Node process** for the first release (one or two operators), until a shared session store exists ([ADR-0090](../../adr/0090-single-process-admin-session-renewal-for-the-first-release.md), [#746](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/746)). Do not use a clustered Node launcher or scale admin horizontally. Renewal uses process-local single-flight coordination and a five-second, 128-entry memory handoff. A restart or second process can expose a spent refresh token to API rejection. Only missing or API-rejected refresh ends at login with both cookies cleared. Capacity, timeouts and API/network outages produce temporary unavailability with cookies intact; retry after recovery. Expired Server Actions renew before execution; failed renewal cancels the action without replay. After rejection the operator must sign in and submit it again. Possession of an old refresh token within the five-second handoff receives the cached new pair without API reuse detection; this accepted replay window is documented in ADR-0090.
- Do not route traffic until API dependency-readiness and web/admin health checks pass. A worker queue/bootstrap failure must fail the deployment or page the operator through deploy status/logs.
- Use private Railway networking for Postgres, Redis, and MinIO writes. Public exposure is limited to API, admin, web, and required media reads.
- MinIO uses one persistent `/data` volume per environment. The S3 API public
  endpoint is exposed only for anonymous media reads and presigned client PUTs;
  the console and administrative/unsigned writes stay private. Bootstrap
  buckets explicitly with `pnpm minio:bootstrap` after wiring
  `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, and
  `MINIO_REGION`. Do not rely on API startup to create or mutate buckets.

Schema changes must support independently rolling services. A rollback restores the previous application revision; it does not reverse migrations.

### Step 3 — Staging smoke

Against the staging mobile/internal build:

1. Confirm `/healthz` and dependency readiness.
2. Verify migration status and the deployed git SHA.
3. Sign in with two distinct demo identities.
4. Browse/create a seeded listing, upload/read media, exchange rich chat, and verify report → admin action → audit → public enforcement.
5. Put the recipient offline and verify native direct-message push + conversation deep link on both required platforms.
6. Confirm public signup is disabled, `SMS_DRIVER=mock`, response-embedded OTP test mode is disabled, and no service references production data resources.

Steps 1–4 and 6 are automated by the checked-in harness, which drives the real
HTTP, WebSocket, and signed-upload surfaces and prints one PASS/FAIL line per
check with no credential, token, or phone number in its output:

```bash
SMOKE_CREDENTIALS_FILE=~/.autotm-ops/<env>/smoke-credentials.json node scripts/staging-reviewer-flow-smoke.mjs
```

The credentials file is a local `0600` JSON document holding the environment's
API URL, the reviewer phone/code pairs, and the operator admin's TOTP secret and
rotating refresh token. It is never committed and never printed.

The harness leaves the environment as it found it: the block it asserts is
released, and the listing it publishes ends the run banned (or archived, if the
run fails before moderation), so the reviewer feed keeps only the seeded content.
Its contact phone is the seller reviewer's own sign-in phone from the credentials
file, which publish accepts without a code
([ADR-0081](../../adr/0081-contact-phone-confirmation-api-for-listings.md)), so
the run requests no contact-phone SMS.

Step 6's signup assertion is a two-step operator probe because the mock SMS
driver delivers the code to the API log rather than to the caller:

```bash
node scripts/staging-reviewer-flow-smoke.mjs signup-probe-request

railway logs --service api --environment <env> -d --lines 200 \
  | grep -a 'mock] OTP for \*\*\*<last four> (req <request tag>):' | tail -1 | sed -E 's/.*: ([0-9]{6}).*/\1/' \
  | node scripts/staging-reviewer-flow-smoke.mjs signup-probe-verify
```

The log line carries only the last four digits of the phone number and the
first eight characters of the code request's id
(`[mock] OTP for ***3456 (req 1a2b3c4d): 123456`). Nothing else derived from the
phone is logged: a hash beside the last four digits would pick the number out.
Two phones can share their last four, so `signup-probe-request` prints the exact
`***<last four> (req <request tag>)` pattern for its own request; grep for it.

The code goes down a pipe rather than into an argument: it is single-use, but
argv lands in shell history and in `ps` output.

A **correct** code for an unreserved number must return `403` with
`details.reason = FEATURE_DISABLED` and must not create a `users` row. A wrong
code proves nothing here — it fails on the code, not on the signup gate.

Step 5 (offline native push and deep link on physical devices) is not
automatable and stays a human gate; see the mobile build prerequisites below.

### Prerequisite — the first admin identity in a signups-disabled environment

Step 3's moderation half needs an elevated admin, and reviewer accounts can
never become one: `VerifyOtp` refuses the ADR-0030 bypass for any user whose
role is not `buyer` or `seller`. In a reviewer-era environment `SIGNUPS_ENABLED`
is `false`, so `POST /auth/otp/verify` will not create the operator's user
either, and `admin:promote` deliberately refuses to create users. There is
therefore no non-break-glass path to the first admin. Do **not** resolve this by
turning `SIGNUPS_ENABLED` on temporarily — that is the one flag the reviewer-era
posture must be able to claim was never off.

The sanctioned sequence inserts only the identity that OTP would have created,
then uses the audited promotion path for the privilege change. Locked in
[ADR-0045](../../adr/0045-first-admin-bootstrap-in-signups-disabled-environments.md):

```bash
# 1. break-glass: create the operator identity only (role stays buyer)
railway ssh --service api --environment <env> -- psql "$DATABASE_URL" -c \
  "insert into users (id, phone, \"phoneVerifiedAt\", \"displayName\", locale, role, \"createdAt\", \"updatedAt\") \
   values (gen_random_uuid(), '<operator phone>', now(), '<label>', 'ru', 'buyer', now(), now()) \
   on conflict (phone) do nothing;"

# 2. audited promotion — dry-run first, then the real run
railway ssh --service api --environment <env> -- sh -c \
  "cd /app && pnpm --filter @auto-tm/db admin:promote -- --phone <operator phone> --reason '<reason>' --dry-run"

railway ssh --service api --environment <env> -- sh -c \
  "cd /app && pnpm --filter @auto-tm/db admin:promote -- --phone <operator phone> --reason '<reason>'"
```

The insert sets `"phoneVerifiedAt"` together with `phone`, as required by
`users_phone_verified_check`. Record this break-glass identity creation under
ADR-0045; it grants no admin privilege until the audited promotion.

Then sign in once as the operator (request the OTP, read it from the API's mock
SMS log line), `POST /auth/admin/totp/enroll`, and `POST /auth/admin/totp/verify`
— the **first** successful verify is what returns the ten backup codes; enroll
returns only `secret` and `qrCodeUrl`. Store the secret, the backup codes, and
the refresh token in the operator secret store.

### Step 4 — Manual production deploy

1. **Read production deployment history and trigger configuration before promoting, and record the result.** Every revision found running in production must be either an accounted-for promotion from this runbook or a new incident. #281 established why: copied deployment triggers ran four application revisions in production on 2026-09-05 without any promotion command, and a `latestDeployment: null` read taken moments earlier raced their creation — so a single "nothing is deployed" read is not evidence. Confirm zero branch triggers in the same check. This gate is forward-looking; it cannot confirm anything about 2026-09-05.
2. Select the staging-proven SHA; do not deploy an unverified moving branch head.
3. Confirm the stable AutoTM-owned API/media domains when producing a store-candidate binary. Railway generated domains are acceptable only for staging/internal builds.
4. Confirm production-only secret references and feature flags without printing their values.
5. Approve the production deployment manually.
6. Repeat the integrated reviewer smoke against production and record SHA, deployment/build identifiers, migration state, timestamps, and result.

Production remains reviewer-only: 3–5 reserved buyer/seller demo accounts, no real users, no real SMS, and no admin-capable reviewer identity.

### Reviewer scenario seed, rotation, and revocation

The reviewer scenario seed is explicit operator work, not an application boot side effect. It creates or converges the reserved buyer/seller identities, deterministic listings, a rich-chat starting point, and a pending report for the store-review smoke. It never prints reviewer phone, email, or code values; keep those values only in Railway/store-review secret storage.

Required environment before running the seed:

- `APP_ENV=staging` or `APP_ENV=production`
- `SIGNUPS_ENABLED=false`
- `REVIEW_DEMO_ACCOUNT_ENABLED=true`
- `REVIEW_DEMO_ACCOUNTS_JSON` populated from the secret store with 3–5 `{ phone, email, code }` entries. Phones are unique `+993` values, emails are unique normalized addresses on the reserved reviewer domain, and each code is exactly 6 digits. The reserved domain has no MX: the API stores and rate-limits its email requests but must never enqueue a send.
- `REVIEWER_SCENARIO_SEED_AUTHORIZATION=seed-reviewer-scenario`

Run the seed after catalog/database migrations and before the reviewer smoke:

```bash
pnpm --filter @auto-tm/db reviewer:scenario -- --mode seed
```

Rotation uses the same command after replacing the secret-store account set. Stable user ids are reused, both Sign-in Methods are updated, existing reviewer sessions are revoked, push tokens are invalidated, and a `REVIEWER_SCENARIO_ROTATE` audit row is written without credential values.

Revocation keeps historical listings, conversations, reports, and audit target ids intact while removing reviewer login reachability:

```bash
pnpm --filter @auto-tm/db reviewer:scenario -- --mode revoke
```

Revocation rewrites reserved reviewer user phones to non-login `revoked:<id>` tombstones, clears their reserved emails, deletes their sessions, invalidates push tokens, and writes a `REVIEWER_SCENARIO_REVOKE` audit row. Remove or disable `REVIEW_DEMO_ACCOUNTS_JSON` / `REVIEW_DEMO_ACCOUNT_ENABLED` in the same operator change when store review is no longer in flight.

### Tester accounts

ADR-0086 allows up to 30 temporary testers in `TESTER_ACCOUNTS_JSON`, separate from the unchanged 3–5 reviewer entries. Each `{ phone, email, code }` uses a unique `+993` E.164 phone, normalized email and exactly six numeric digits. Neither method may overlap a reviewer. The reviewer flag controls only reviewers; an empty or unset tester list disables tester fixed codes. Both phone and email sign-in require an existing ordinary User. Email sign-in still starts with a rate-limited request, then accepts the fixed code without sending mail. Phone requests do not issue or send a code.

The founder runs the following steps while present. Keep the list only in the operator secret store with mode 600. Never paste its values into git, shell arguments, terminal history, logs or evidence. Load it into the operator process environment through the existing secret-store procedure and give each tester only their own entry privately. The commands below contain no credential values.

1. With the original tester list loaded into the API container's command environment, run the seed on the private database connection. Set `TESTER_ACCOUNTS_AUTHORIZATION=seed-tester-accounts`. The script accepts staging/production only on a private Railway PostgreSQL host, or development/test on loopback. Production seed requires `SIGNUPS_ENABLED=false`.

   ```sh
   node --import tsx /app/packages/db/scripts/tester-accounts.ts --mode seed
   ```

   Seed creates buyer Users with both verified methods, generated identity defaults, and ids in `de300712-0000-4000-8000-…`. It owns only the deterministic id derived from each configured phone. A repeat with the same list reports zero new Users and preserves profiles/roles. It refuses unrelated Users found by phone or email, privileged Users, changed tester methods, and scheduled or purged tester Users before any write. It creates no Sessions, Listings or sends. Do not edit phones or emails in the list to repurpose an account. A refusal needs operator investigation; it never prints the conflicting value.

2. Configure the production or staging API with that same secret list, then verify both phone and email sign-in using the operator smoke procedure. Preserve the exact list until removal is confirmed; the reviewer scenario seed does not provision testers.
3. Once the founder says the test passed, set the API's `TESTER_ACCOUNTS_JSON` to `[]` and wait for that deployment, so new fixed-code sign-ins stop. Keep the original list loaded only in the removal process. Set `TESTER_ACCOUNTS_AUTHORIZATION=remove-tester-accounts` and run:

   ```sh
   node --import tsx /app/packages/db/scripts/tester-accounts.ts --mode remove
   ```

   Removal preflights every entry's ownership and buyer/seller role, schedules deletion now, revokes all refresh Sessions and archives active Listings in one database transaction. The existing worker purge clears personal data on its next run and retains history under the normal deletion policy. Already-scheduled timestamps are not postponed, missing/purged Users are skipped, and a second run reports zeros. Existing access tokens expire under the ordinary deletion rules; disabling the list first prevents a new bypass session racing removal. Keep the original list until count-only checks confirm purge, then retire the secret file. Neither mode prints phones, emails, codes, connection strings or raw database errors.

## Demo inventory seed and removal

Reviewer production starts empty. The demo inventory fills it for store review and closed testing: about 50 active car Listings, each with 5 to 8 photographs of that car, spread over demo sellers. It is temporary and one command removes it. It is operator work, not a boot side effect, and an agent runs it against staging or production only on the founder's go-ahead in chat.

Run the reviewer scenario seed first. The demo inventory adds Listings around it and touches none of its rows. Run it on staging before production.

The founder recorded two decisions on issue #703 on 2026-10-06:

1. **Photo licensing.** 295 of the 297 photographs are CC BY or CC BY-SA and must be credited. They are accepted with the credits page `/<locale>/demo-credits`, which the Trust page links. Keep both deployed while the demo Listings are public.
2. **Egress.** The seed downloads from `upload.wikimedia.org` inside the API container. This is approved for the files the manifest lists, in a seed the founder runs or approves for that run. It is not a standing dependency: nothing else may download from Wikimedia.

Before seeding an environment, confirm:

- The API's `/healthz` reports a commit at or after the merge of #704, so the container holds the script. Redeploy the API if it does not.
- Web is deployed with `/<locale>/demo-credits`, and `/<locale>/trust` links to it.

Both modes run inside the API container, where Postgres and MinIO are reachable on Railway's private network. The script refuses a public database proxy or a public MinIO host, and a `DATABASE_URL` that sets a `host` or `port` query parameter. It needs the catalog seeded and the media buckets created.

Required environment:

- `APP_ENV=staging` or `APP_ENV=production`. The script also runs with `APP_ENV=development` or `test`, and then only against a loopback Postgres and MinIO.
- `DEMO_INVENTORY_AUTHORIZATION=seed-demo-inventory` to seed, `DEMO_INVENTORY_AUTHORIZATION=remove-demo-inventory` to remove. Pass it on the command line as below, so it is not left in the service's variables.
- `SIGNUPS_ENABLED=false` to seed production. Removal does not check it.
- `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`, which the API service already has.

Seed:

```bash
railway ssh --service api --environment <env> -- sh -c \
  'cd /app && DEMO_INVENTORY_AUTHORIZATION=seed-demo-inventory node --import tsx packages/db/scripts/demo-inventory.ts --mode seed'
```

The seed downloads each photograph from Wikimedia Commons (`upload.wikimedia.org`), one at a time, so the container needs outbound HTTPS and the first run takes a while. It prints one line per Listing and then the counts. A rerun converges: fixed ids, no duplicates, and it keeps each Listing's publication time and views. A rerun also makes every demo Listing active again, including one an admin blocked or removed since.

If it stops part way, run it again: photographs already downloaded are kept and not asked for twice. If Commons keeps refusing (HTTP 429 or 403 on the same file after a second run), stop, run the removal below to clear the partial inventory, and report the printed reason.

After a successful seed, check:

1. The last line reads `Demo inventory converged 10 sellers, 47 Listings, 297 photos and 1485 stored objects`.
2. The feed shows the Listings, and one Listing's gallery loads through the public media host.
3. A demo seller shows a Display Name, not "Deleted user".
4. `/<locale>/demo-credits` opens and lists the photographs.

On failure it prints `Demo inventory seed failed:` and a reason. A failed download names the Commons file and the HTTP status, or says the answer was not an image. Any other error is named by its class only, because a driver message can quote a connection string; read the service logs for more.

Nobody can sign in as a demo seller. Each holds one Sign-in Method, a phone tombstone of the form `demo-inventory:<user id>`, which is not a number and which the API never accepts for a sign-in code. It is stored because a User with no phone and no email is shown to buyers as a deleted User. Their Listings have calls off and chat on and carry no contact phone.

The photographs are CC BY and CC BY-SA files. `packages/db/scripts/demo-inventory/photos.manifest.json` records each one's author, licence and source, and the web page `/<locale>/demo-credits` shows the same list. Keep that page deployed and linked for as long as the demo Listings are public.

Remove, after review and testing end:

```bash
railway ssh --service api --environment <env> -- sh -c \
  'cd /app && DEMO_INVENTORY_AUTHORIZATION=remove-demo-inventory node --import tsx packages/db/scripts/demo-inventory.ts --mode remove'
```

Removal deletes the demo sellers, their Listings and media rows, every stored object under `demo-inventory/` in `listing-photos`, and what reviewers and testers left on those Listings: favourites, Conversations with their messages and the photos sent in them (under `chat-attachments/<conversation id>/` in `chat-attachments`), Inspection Interests, and Content Reports about a demo Listing, a demo seller or a message in one of those Conversations. It prints the counts. It touches nothing else, and a second run reports zeros. If it fails while deleting stored objects, run it again: it finishes the deletion even when no demo seller is left.

Removal refuses, deleting nothing, if a demo seller holds an email or any phone other than its tombstone. That account may now belong to a person; resolve it by hand before running removal again.

Removal checklist:

1. Run the removal command and keep the printed counts.
2. Run it again and confirm it reports zeros.
3. Take the credits page down: delete `apps/web/src/app/[locale]/demo-credits` and the Trust page's link to it (`trustDemoCreditsLabel` in `apps/web/src/app/[locale]/trust/page.tsx`, with its test), and deploy web.
4. Audit rows and notification history that mention a demo Listing stay as history.

### Step 5 — Railway rollback and restore

- **Application rollback:** redeploy the last known-good Railway application revision and repeat health + focused smoke checks.
- **Migration response:** forward-fix is preferred. Never assume application rollback undoes a schema migration.
- **Data restore:** restore Postgres and media into an isolated/non-production target first, run current migrations, and verify auth/listing/chat/report/media reads before declaring the path usable. The executed Railway procedure is in [Restore drill](#restore-drill); the drill evidence is in [`evidence/issue-280-backup-restore-drill.md`](evidence/issue-280-backup-restore-drill.md).
- Record restore point, data scope, start/end time, operator, result, and any recovery gap.

### Step 6 — Cutover boundary

Railway production is torn down only after all ADR-0039 cutover conditions pass: both stores approved, Railway-production confirmation pass, trusted TM presence, and racked TM hardware. DNS then moves the stable AutoTM-owned hosts to the ADR-0005 topology. Railway staging remains.

## TM era — air-gapped production

### Step 1 — Build the bundle (on a GitHub-hosted runner)

[ADR-0073](../../adr/0073-ci-gates-and-release-bundles-run-on-github-hosted-runners.md) moved the bundle build to a GitHub-hosted x86 Linux runner. Whether TM egress requires a TM-side runner reopens at cutover.

```
# Trigger build via GitHub Actions
# - Either: push a v* tag → bundle.yml runs automatically
# - Or: gh workflow run bundle.yml --ref main -f tag=<tag>   (dry run)

# What happens (.github/workflows/bundle.yml):
# 1. ubuntu-latest checks out the ref
# 2. pnpm install, Prisma client generate
# 3. make bundle: docker build for each app (api, worker, admin, web, sms-gateway)
# 4. docker save → images/auto-tm-<tag>.tar.gz
# 5. Upload as a workflow artifact (90-day retention); nothing else is published
```

Output: `images/auto-tm-<tag>.tar.gz`. The 2026-10-01 hosted dry run produced
2,409,107,124 bytes, about 2.4 GB. Allow room for the compressed archive and the
loaded images; measure each release rather than relying on the old 400-700 MB estimate.

If the build is the first one OR base images changed:
```
make bundle-base   # includes postgres, redis, minio, caddy, observability stack
```
Larger bundle (~1.5-2 GB) — ship once, then app-only bundles after.

### Step 2 — Transfer to TM

Three options depending on what's available:

### Option A — SCP from TM Proxy PC (intra-Telecom, fastest)

If the runner was the TM Proxy PC:
```bash
scp /releases/auto-tm-release-v<version>.tar.gz tm-server-a:/opt/auto-tm/releases/
```

### Option B — SCP from your computer abroad

If you're in China / abroad:
```bash
# From your laptop:
scp ./auto-tm-release-v<version>.tar.gz tm-server-a:/opt/auto-tm/releases/
```

Slower (international link), but works because TM VMs accept inbound SSH.

### Option C — USB drive (offline fallback)

If all else fails: write to encrypted USB, take to AutoTM office, plug into Server A.

### Step 3 — Verify checksum on TM side

```bash
ssh tm-server-a
cd /opt/auto-tm/releases
sha256sum -c auto-tm-release-v<version>.tar.gz.sha256
# expect: OK
```

If checksum fails, the transfer corrupted; redo.

### Step 4 — Deploy

```bash
cd /opt/auto-tm
sudo ./deploy.sh v<version>
```

The `deploy.sh` script:

1. Validates the bundle (integrity, expected files)
2. `tar -xzf releases/auto-tm-release-v<version>.tar.gz -C staging/`
3. `docker load < staging/images.tar`
4. Updates `compose/docker-compose.prod.yml` to reference new image tags
5. `docker compose -f compose/docker-compose.prod.yml up -d`
   - Rolling restart: containers replaced one by one
   - Prisma migrations run at container start (`migrate deploy`)
   - Caddy front-end routes traffic to new containers as they pass health checks
6. Old image tags kept for rollback (last 3 versions retained)
7. Writes deploy entry to `deploy-log.txt`

Expected duration: 2-5 minutes from `deploy.sh` to all green.

### Step 5 — Verify

The local-host `curl` lines below run **on TM Server A** and hit the docker port-mappings published by `compose/docker-compose.prod.yml` (api → 3006, admin → 3001, web → 3002). These are container-port conventions, not dev-machine ports — they match the dev `.env.template` defaults so the same runbook works in both environments. ADR-0018 covers the API port choice.

If you are anywhere other than TM Server A, use the Caddy-fronted external URLs (`https://api.auto.tm/healthz` etc).

```bash
# On TM Server A:
docker ps                                    # all containers up
curl -s http://localhost:3006/healthz        # api healthy (container 3006 → host)
curl -s http://localhost:3001/healthz        # admin healthy (container 3001 → host)
curl -s http://localhost:3002/healthz        # web healthy (container 3002 → host)

# Check migrations applied
docker exec -it auto-tm-api npx prisma migrate status

# Spot-check a real endpoint through Caddy (works from anywhere with network access)
curl -s https://api.auto.tm/api/v1/listings?limit=1 | jq
```

Check Grafana dashboard:
- API error rate < 1%
- DB connections in normal range
- WebSocket connections re-established

For MLP beta, WebSocket/push checks apply only if rich chat or native push has shipped. If S6 is still text-only HTTP contact and notifications are still post-MLP, verify contact-message send/list instead.

### Step 6 — Smoke test (manual)

On your phone:
1. Open mobile app
2. Sign in with phone OTP (verify SMS gateway works)
3. Browse listings (verify feed renders)
4. Tap a listing (verify detail loads)
5. Create or edit a listing if listing mutations are enabled
6. Send a contact/message if contact is enabled
7. Verify disabled-feature copy if any beta kill switch is intentionally off

On admin:
1. Open `admin.auto.tm`
2. Sign in (OTP + TOTP)
3. Load reports and audit
4. If moderation actions are enabled, run the deterministic report -> admin action -> audit -> public enforcement smoke on seeded/staging data

## Rollback

If something is broken:

```bash
cd /opt/auto-tm
sudo ./rollback.sh
```

The `rollback.sh`:
1. Reverts `docker-compose.prod.yml` to previous version's image tags
2. `docker compose up -d` (replaces containers with old images)
3. **Migrations are NOT auto-reverted** — if the broken release had a migration, you must:
   - Hotfix forward (write a new migration that fixes the issue), OR
   - Restore DB from the pre-deploy backup if the migration was destructive

Forward-fix is almost always preferred. Restoring from backup is destructive of any data written between deploy and rollback.

## Restore drill

A restore drill is required before private beta and at least once every 30 days while beta data matters. It runs against staging or a prod-like clone, never directly over production as a test.

Minimum successful drill:

1. Take or select a recent production-like Postgres backup.
2. Restore it into an isolated database.
3. Run migrations to the currently deployed version.
4. Start API against the restored database.
5. Verify health, login with a test user, listing read, contact read/write if enabled, admin TOTP login, report list, audit list, and a sample media object reference.
6. Record backup timestamp, restore start/end time, operator, result, and any data gaps.

Executed evidence for the Railway era lives in
[`evidence/issue-280-backup-restore-drill.md`](evidence/issue-280-backup-restore-drill.md).

### Railway-era Postgres drill

Railway **PITR is disabled** on the AutoTM databases (`railway postgres pitr
status` reports `Bucket wired: no`), so `railway postgres pitr restore` — which
would create a restored sibling service — is not an available recovery path
today. Use the logical dump procedure below, and re-check `pitr status` before
assuming otherwise.

Environment-local Railway databases have **no public TCP proxy**, so do not plan
on an operator-reachable connection string. Create the isolated restore target
in the same environment (private networking is environment-scoped), give it a
read-only reference to the source, and run both halves from inside its own
container so no database bytes and no credentials reach the operator:

```bash
# 1. create the isolated target (Railway ignores --service <name>; note the id)
railway add --database postgres

# 2. point the target at the source, read-only, by reference — never by value
railway variables --service <target> --set 'SOURCE_DATABASE_URL=${{Postgres.DATABASE_URL}}'

# 3. dump and restore entirely inside the private network
railway ssh --service <target> -- sh -lc 'pg_dump --format=custom --no-owner --no-acl --file=/tmp/drill.dump "$SOURCE_DATABASE_URL" && pg_restore --no-owner --no-acl --exit-on-error --dbname "$DATABASE_URL" /tmp/drill.dump'
```

Drop and recreate `public` on the target before the measured run so the restore
starts from an empty database rather than converging onto leftovers.

Deleting a Railway service detaches its volume but does **not** delete it. After
tearing down a drill target, list volumes and delete the orphan explicitly, or
it keeps billing.

To run `prisma migrate status` / `deploy` and an API boot against the restored
database from an operator machine, add a TCP proxy **to the temporary target
only** (`railway tcp-proxy create --port 5432 --service <target>`) and delete it
with the target. `migrate status` must report the schema up to date and
`migrate deploy` must report no pending migrations — a restore drill never
reverses a migration.

Verify the restore by comparing the source and target on row counts for every
table, schema shape, and digests over the fixed reviewer-scenario UUIDs in
`packages/db/src/reviewer-scenario-seed.ts`. If the source is being written
concurrently, snapshot it immediately before *and* after the dump; identical
snapshots pin the dump-time state unambiguously.

When the API is started off-platform against the restored database, expect the
first one or two `/readyz` probes to be false negatives: the per-check budget is
`1500 ms`, sized for private-network latency, and a laptop reaching Postgres
through a TCP proxy and MinIO over the public internet exceeds it until
connections warm. Re-probe before treating `postgres=failed` or `minio=failed`
as a restore problem.

### Media backup/restore drill

Run this only against isolated/non-production MinIO data. Local development:

```bash
export MINIO_ENDPOINT=http://localhost:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_REGION=us-east-1

pnpm minio:bootstrap
pnpm minio:backup /tmp/autotm-minio-backup
pnpm minio:restore /tmp/autotm-minio-backup
```

Railway era — let `railway run` inject the credentials so no access key is
handled by the operator, reach the source through its public S3 origin (private
hosts do not resolve off-platform), and point the restore at a **separate MinIO
instance with its own volume**:

```bash
# backup: source, read-only
railway run --service api -- \
  sh -c 'MINIO_ENDPOINT="$MINIO_PUBLIC_URL" node infra/minio/backup.mjs /tmp/autotm-minio-backup'

# restore: isolated target only
railway run --service <minio-target> -- \
  sh -c 'MINIO_ENDPOINT=<target-origin> MINIO_ACCESS_KEY="$MINIO_ROOT_USER" MINIO_SECRET_KEY="$MINIO_ROOT_PASSWORD" MINIO_REGION=us-east-1 node infra/minio/restore.mjs /tmp/autotm-minio-backup'
```

Give the target a generated domain on port `9000` only, so the drill can also
prove access behaviour: anonymous GET returns `200` with matching bytes and an
unsigned PUT returns `403`. Re-read every manifested object from the target and
compare against the manifest as an independent pass rather than relying solely
on the restore script's own read-back.

The backup writes `manifest.json`, `policies/<bucket>.json`, and
`objects/<bucket>/<key>` files. The manifest stores SHA-256 checksums; restore
verifies the local backup object before upload and reads the restored object
back to verify the checksum after upload. A checksum failure blocks the restore
instead of silently writing corrupt data.

If restore fails or takes too long for beta operations, private beta launch is blocked until the backup path is fixed or the risk is explicitly accepted in the S8 closeout.

## Post-deploy

- Update `CHANGELOG.md` with the version + summary
- Telegram message to AutoTM channel: "v0.X.Y deployed — <summary>"
- Monitor Grafana for 30 min
- Close any deployment-related GitHub issues
- Record whether rollback, restore, alert, and feature-flag drills remain current for the launch gate

## When NOT to deploy

- Friday afternoons (no on-call coverage over weekend)
- During known TM Telecom outages (your SSH would fail; deploy could partially apply)
- Without backups verified < 6 hours old
- Without testing the exact revision on Railway staging first

## References

- [ADR-0004 — Migrations](../../adr/0004-migrations.md)
- [ADR-0005 — Hosting](../../adr/0005-hosting.md)
- [ADR-0039 — Phased cloud-first hosting](../../adr/0039-phased-cloud-first-hosting.md)
- [Sprint 11 — Railway deployment](../sprints/sprint-11-railway-deployment.md)
- `infra/compose/docker-compose.prod.yml`
- `infra/deploy.sh` (lives on TM server, not in repo)
