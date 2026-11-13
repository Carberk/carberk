# Guarded deployed rich baseline

This is an explicit operator action under #1119/#1134, separate from local
readiness. #1132 authorizes tooling and disposable tests only. Never run these
commands against a live target without the rollout owner's scoped authority.
Keep broad inventory, existing tester/reviewer/admin identities, credentials,
Sessions, access lists, drafts and videos. No reset, account creation/activation,
allowlist replacement, migration, deployment or configuration repair is part of
this operator. All native readiness/sign-in/Metro and video fixture helpers stay
local-only. Remote UI proof uses an existing authorized session and normal UI.

## Private preflight

Use the reviewed source checkout and its installed dependencies. Do not rebuild
the frozen production release or redeploy `main` to make seeding work. Record the
actual API and worker deployed commit/build identities and schema, and verify
ordinary upload/processing/playback compatibility on those builds. An unhealthy,
incompatible or unknown runtime blocks apply. Source checks alone are not runtime
proof. The API remains the only deployed migration authority.

Read the provider's selected project/environment and **all five** service
identities (API, worker, database, storage, Redis). Export their current resolved
configuration privately, with restrictive file permissions, into `/tmp/rich-api.env`,
`/tmp/rich-worker.env`, `/tmp/rich-database.env`, `/tmp/rich-storage.env`, and
`/tmp/rich-redis.env`. Do not print them, commit them or attach them to GitHub.
Each record must carry the provider's `RAILWAY_PROJECT_ID`,
`RAILWAY_ENVIRONMENT_ID`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_SERVICE_ID`.
API/worker records also carry their real `RAILWAY_GIT_COMMIT_SHA`. For a managed
resource whose export lacks resolved connection variables, privately derive the
record's corresponding `DATABASE_URL`, `REDIS_URL`, or `MINIO_*`/video Bucket
settings from the **same independently inspected service**, without changing
provider configuration. An unverified connection or environment mismatch blocks.
Public/private URL aliases are not interchangeable overrides; resolve one exact
consistent route in these records. This tool does not log into the provider or
verify the provenance of operator-supplied export/compatibility/backup files.
Treat those files as trusted operator attestations, never user-submitted input.

Prepare `/tmp/rich-binding.json` using the exported `DeployedBinding` type in
[the target boundary](../../../packages/db/scripts/ui-fixtures/deployed-rich.ts).
It identifies the selected target, project, environment, five services and
**existing** eligible seller/viewer mappings. The seller must already have upload
and view capability, the viewer view capability, and uploads must already be
supported. Private photo installation needs four free Draft slots (cap five);
finish/clean owned temporary proof first, never evict existing drafts. Unexpected
upload preparation, open source sessions or Processing generations block apply;
wait for their existing lifecycle rather than repairing them here.

Compute configuration digests with `configurationHash(parse(fileBytes))`, using
`dotenv.parse`; do not hash raw file formatting or dump the parsed values. Use
`deployedRichVersion()` for `compatibility.behavior` and `compatibility.schema`.
Both exports are in the target boundary above. `compatibility.apiCommit` and
`workerCommit` must match the actual deployed exports; set `verifiedAt` only after
the compatibility observation and `ordinaryUploadAndPlayback: true` only after
its success. Compatibility is valid for one hour. The tool independently checks
the deployed DB's completed migration names/checksums against this checkout and
refuses incomplete or divergent migrations. It never applies them.

Select `scenarioSet: "photos"`, then `"private-drafts"`, then `"videos"` in separate
binding files, with `component: "scenario"`. These reuse the local definitions,
semantic catalog lookup, renderer, importer and deep comparator. Catalog IDs are
resolved per environment. For optional `"video-recovery"`, first plan/apply a
binding with `component: "recovery-photos"`, then a separate binding with
`component: "scenario"`; no deployed action implicitly applies both phases.
Never manufacture Ready/Failed state; the actual scheduler/worker settles imports.

## Staging first, exact plan, apply, no-op and deep check

Use a shell array so all commands retain the same private context:

```bash
rich_context=(--binding /tmp/rich-binding.json --api-env /tmp/rich-api.env --worker-env /tmp/rich-worker.env --database-env /tmp/rich-database.env --storage-env /tmp/rich-storage.env --redis-env /tmp/rich-redis.env)
pnpm --filter @auto-tm/db rich:deployed "${rich_context[@]}" --mode check
pnpm --filter @auto-tm/db rich:deployed "${rich_context[@]}" --mode plan > /tmp/rich-plan-report.json
node -e 'const fs=require("node:fs");fs.writeFileSync("/tmp/rich-plan.json",JSON.stringify(JSON.parse(fs.readFileSync("/tmp/rich-plan-report.json")).plan))'
pnpm --filter @auto-tm/db rich:deployed "${rich_context[@]}" --mode apply --plan /tmp/rich-plan.json
# For videos, let the existing scheduler/worker settle, then repeat exactly:
pnpm --filter @auto-tm/db rich:deployed "${rich_context[@]}" --mode apply --plan /tmp/rich-plan.json
pnpm --filter @auto-tm/db rich:deployed "${rich_context[@]}" --mode check > /tmp/rich-check.json
node -e 'const fs=require("node:fs");fs.writeFileSync("/tmp/rich-staging.json",JSON.stringify(JSON.parse(fs.readFileSync("/tmp/rich-check.json")).stagingEvidence))'
```

Check/plan write no scenario or storage state. The first apply inserts only the
declared resources/credits; exact reapply and deep check must report zero writes,
including timestamps. Retain before/after protected row and object inventories,
the exact new write set, normal-session UI observations and the successful staging
receipt. Each scenario/component needs its own evidence. A healthy staging
receipt for another input pack or behavior version authorizes nothing.

## Production backup gate

Before the separately authorized production action, take a fresh DB backup and
media backup, including photo metadata and the **actual private video Bucket**.
Follow the [restore drill](80-deployment-runbook.md#restore-drill): restore into
isolated disposable services, verify auth/listing/draft/media reads and private
video bytes/access, then record success and any gaps. A dump existing on disk or
a public-photo-only backup is insufficient. Never alter private Bucket policy
to satisfy public-photo backup tooling. Never restore over production as proof.

Create a private `BackupEvidence` record (type linked above), with opaque
`receiptId`, production `binding`, the exact production `planHash`, `capturedAt`,
`verifiedAt`, and successful `database`, `photos`, `privateVideos`,
`restoreVerified` results. Capture and restore verification must both be within
one hour, ordered capture-before-verification. Keep dump contents and private
locations outside the receipt. Repeat the commands using the production binding,
adding `--staging /tmp/rich-staging.json --backup /tmp/rich-backup.json` to both
apply invocations. Successful staging evidence must also be less than one hour
old and match the input, behavior and scenario. Changed mappings, config, schema,
relevant drafts/accounts or plan require fresh preflight/plan/evidence. The
original plan may authorize an exact installed no-op after worker settlement;
it cannot authorize replacement or repair.

## Partial outcome and bounded cleanup

Any partial row/object state, occupied deterministic ID, changed content or
foreign ownership refuses. The deployed CLI deliberately suppresses underlying
errors, configuration and URLs; it never automatically converges or deletes.
Keep the original immutable plan and privately inspect only its versioned photo
prefix and the fixed IDs/keys declared by the shared scenario definitions. An
interrupted apply may retain conditional uploads even though its DB transaction
rolled back. Preserve those exact objects for investigation; do not delete a
prefix, invent ownership from a key, or reset fixtures to make retry succeed.
For resources with proved owned rows, use normal authenticated Draft discard,
video Remove/Cancel or DeleteListing and the existing retirement/cleanup ledger.
Unattached partial objects require a separately reviewed exact-key recovery;
this operator grants no generic object-deletion authority. Preserve stable rich
resources and every unrelated resource. Record incomplete proof as incomplete.
