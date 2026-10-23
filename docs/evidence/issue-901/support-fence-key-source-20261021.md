# Support fence key source repair, 2026-10-21

## Authority and checkpoint

Bounded implementation for #901 under #897 and sole draft PR904. Base `c704d02a0880d9f8284c7354fefd9cacc3e3219c`. Branch `agent/issue-901-support-fence-key-source-20261021` was created from that base and pushed before edits in the host-owned worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-92ab9bf1`. Root alone assembles with cherry-pick -x and pushes integration. No child, reviewer, PR, issue edit, GitHub API, CI dispatch/poll/rerun, local service, Docker, staging, provider, credential or device operation was performed.

The source repair is authorized by root's supplied hosted RED and the confirmed schema mismatch. It is a checkpoint, not runtime GREEN or completion of #901. Docs: not applicable, internal generator change with no external dependency/API change.

## Original failure and regression boundary

Hosted PR Checks run `39575973053`, API job `119141577921`, completed failure at the exact base SHA. Root reports runtime/lane/static/db/frontend passed, docs skipped, and aggregate pr failed only because api. Worker passed 56/56 files and 364/364 tests; API passed 314/315 files and 3046/3056 tests; diagnostics passed 13/13, full-v3 passed 24/34.

Read locally without rerunning: `/tmp/carberk-next-release-20261021/c704d02a-api.raw.log` and `c704d02a-api.plain.log`. Raw SHA-256 was independently checked as `b5da66caa4f4e8679125891563a2c0e5817a8ea87bf5b4dda9c5ac9c535ebb65`.

The sanitized records at plain-log lines 2517 and 2524 both report `errorType: Error`, `codes: [P2010, 42703]`, `driverCategories: [ColumnNotFound]`, and empty classifications, for `deadline-worker` and `owned-support-worker` respectively. Reset f5/f7/f8 still reports wrapper `P0001`. These are the original exact observed error codes/categories; the failing SQL statement is not emitted. They support the source hypothesis without proving that every other cleanup/reset defect is absent.

The unchanged primary regression is `apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`, especially the inclusive stored deadline, two owned due Support namespaces, HTTP reopen/worker ordering, and exact reset cases. Selected focused hosted command, not run locally:

```sh
pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts
```

Use the hosted disposable-service environment and retain the full required API lane as the acceptance boundary. The existing hosted RED is the behavioral failure evidence. No new string-only regression test was added: the existing generator tests capture SQL but do not execute PostgreSQL, and the useful real worker/reset regression already exists in the explicitly unchanged shared spec. This assignment prohibits local services.

Later eight issuance failures remain `RATE_LIMITED` / `ip_limit`, loopback hourly rows 10 / max 10 at lines 2533-2557, following failed resets. Deeper race/draft/contact/media assertions remain UNREACHED. This change does not diagnose or repair them or change authentication budgets.

## Source and preserved checks

`ServiceErasureFence` in `packages/db/prisma/schema.prisma` is keyed by `conversationId` and has no `id`. The generated lifecycle authority selects a typed `public.service_erasure_fences` row into `f`; its cleanup journal check previously emitted `jsonb_build_object('id',f.id)` through `currentRow`.

Only `businessMain`'s `currentRow` helper changes. For `service_erasure_fences` it now emits `jsonb_build_object('conversationId',f."conversationId")`. Other tables keep the exact existing `id` expression. All ten distinct helper table callers were checked against their Prisma primary-key fields: dealerships, dealership_members, media_uploads, listings, listing_media, support_cases, service_conversations, users, service_erasure_fences and service_audits. No other non-id/composite-key table calls this helper. Existing separate fence/read-state key generation remains intact. There is no migration or broader key abstraction.

The journal predicate still requires the exact table, nondeleted ownership, exact row key and row-hash equality. No lifecycle predicates, conversationId/epoch/timestamp/object-key checks, 128/2048 caps, active candidate checks, sorted locks/fence ordering, foreign-reference checks, audit disposition, retries, assertions, rate budgets, timeouts, concurrency or known-job cleanup change. Operational full-v3 entry remains closed. Owning overview constraints are unchanged.

## Offline checks and limits

All final checks passed:

- `node --check scripts/staging-campaign.mjs`.
- `node --test scripts/staging-campaign.test.mjs scripts/support-operations-schema.test.mjs`: 12/12 before and after. Existing assertions cover serialized trigger variable ambiguity, integrity CASE nesting, v3 Support journal/service authority, exact audit redaction/reset ordering and composite fence/read-state keys, object manifest provenance, refusal on bad manifests/versioning/credentials, partial deletion failure, terminal observation and durable reset retries, plus retained schema inventories. These are pure generator/storage-boundary tests, not PostgreSQL execution.
- `node /tmp/issue-901-support-fence-key-inspect.mjs`: captured emitted SQL from base and working source for fixture/reset in identities-v1, business-v2 and full-v3. Five outputs are byte-identical. Full-v3 fixture differs only in the one fence row-key expression, with nondeleted ownership and row hash intact. All six serialized remote JavaScript programs parse via `new Function`. All ten `currentRow` tables match schema primary-key fields. This temporary inspection is static evidence, not a database regression test. Its initial v1 fixture stub returned 0 instead of the required four identities; correcting that harness response allowed comparison without a production change.
- `pnpm check:agent-docs`: passed. The configured pnpm bootstrap populated local ignored dependencies from its content-addressable store; no tracked dependency/configuration files changed.
- `git diff --check`: passed.

No TypeScript modules, imports, exports or package boundaries change; no affected build/typecheck was needed. No runtime worker/HTTP/reset tests ran locally, and no local or hosted GREEN is claimed. The next expected hosted boundary is reaching cleanup authority with the real fence key instead of `f.id`, then observing the actual next result. Hosted proof must establish the statement/next errors, successful cleanup and exact reset, followed by reached assertions under the unchanged budgets. Unknown next failures remain open to root.
