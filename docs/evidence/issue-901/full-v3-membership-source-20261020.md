# Full-v3 sales membership source checkpoint

Source-only handoff for #901 under #897. Base `2a09bb80`, branch `agent/issue-901-v3-membership-source-20261020`, reserved and pushed before edits. Host scaffold `t3/865c727b` remains at `960bf2c3`; work is confined to the owned checkout. Only `scripts/staging-campaign.mjs` and this evidence file change. No PR or children.

## Reached RED and scope

Root reports hosted candidate `d397c8b7`, API job `118701135620`: full-v3 **16/17**, API **312 files, 3008/3009 tests**. The membership case reaches its first owner sales invitation at `CampaignFullV3.e2e.spec.ts:789`, expects 201 and receives 500, PostgreSQL `Unsupported campaign business` from `track_business`. Admission, owner redemption and settings have passed that case's setup. Other prior cases passed their reached assertions. This writer did not rerun hosted acceptance.

Buyer-a remains the admitted owner. Sales-a/sales-b remain roster aliases, with no account-role or staff-capability change. The root Dealership and its bootstrap owner remain separate. The complete spec is byte-identical to `2a09bb80`, including all 17 hosted cases and the four inherited local coordinator cases. No new test was added.

## Supported transitions and guards

The v3 non-root admitted business permits:

- A sales invitation INSERT for a roster recipient without a membership, on an active business with its journal-owned active owner. The pending invitation has a 64-hex token hash, future expiry, no redemption/revocation and exactly one pending invitation for that business/recipient. Existing global token-hash uniqueness and immutable token/recipient/business fields remain in force.
- Pending sales invitation UPDATE changing only `revokedAt`, for explicit revoke or replacement. Replacement keeps the old exact token revoked and creates a fresh invitation. No-op repeated revoke still writes nothing through the unchanged repository.
- Pending sales redemption changing only `redeemedAt`, before expiry, with an active business/owner and no recipient membership. The exact journal-owned redeemed invitation permits an active sales membership INSERT for that same business and recipient. The unchanged repository checks current Session, current User, exact token hash, recipient, business status and one-time consumption. No authentication or invitation token is seeded.
- Sales membership UPDATE changing only status between `active` and `suspended`, with an active owned owner. The owner membership remains immutable. Existing HTTP authority refuses sales owner actions, a non-member change and sole-owner removal. Successful sales removal remains closed, matching the membership handoff's explicit deferral; the hosted case asserts sole-owner removal refusal only. Invitation/member DELETE on the admitted business remains disposal-only.

New audit admission is limited to `BUSINESS_INVITATION_CREATED`, `BUSINESS_INVITATION_REVOKED`, sales `BUSINESS_INVITATION_REDEEMED`, and suspend/restore `BUSINESS_MEMBERSHIP_CHANGED`. Each requires the exact business and journal-owned invitation/member, exact JSON details, current row state/version and the appropriate owner or exact recipient actor. Invitation audit duplication is refused; member version must match its change-audit count. Details cannot carry extra fields or raw tokens. Owner redemption/settings audit rules remain separate.

Integrity reconciles each sales invitation's creation/redemption and version. Revocation requires its explicit audit or a later journaled replacement invitation for the same recipient/business. Sales member versions reconcile with membership audits and their owned redeemed invitation. Owner activation/version and owner-redemption counts now count owner redemption only, so sales redemption cannot corrupt reset accounting.

All writes still enter the existing record/event journal, manifest/candidate checks, prior-row hash checks, key-reuse refusal, immutable ownership and foreign-edge guards. Cross-reservation and foreign business/recipient references remain refused. Caps stay 128 records/2048 events. Lock order, concurrency, timeouts, baseline guard, schema, dependencies, runtime wrapper, operational allowlists, cleanup ordering, audit redaction and lost-response disposal logic are unchanged. V1 and v2 generated output is unchanged.

## Offline evidence

- `node --check scripts/staging-campaign.mjs` and `git diff --check`: PASS.
- `node /tmp/issue901-membership-source-check.mjs`: PASS against `2a09bb80`. Captures actual generated SQL without executing it. V1/queue functions and five v2 paths are identical; four v3 fixture/reset paths have balanced parentheses, unchanged lock prefixes and disposal calls, 23 triggers and the unchanged baseline predicate. Checks unchanged limit, lifecycle and immutable-ownership guards and byte-identical spec. Captures are `/tmp/issue901-membership-*.sql`. This is source comparison, not a PostgreSQL parser or execution proof.
- Existing offline controls, `node --test scripts/staging-campaign.test.mjs scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs scripts/staging-railway.test.mjs`: 140/140 PASS. No new tests.
- Initial API typecheck failed because shared package build outputs were absent. Local contracts/DB builds then passed with a dummy `DATABASE_URL` at port 1, never connected. API `tsc --noEmit` and `tsc6 --noEmit`: PASS. Logs `/tmp/issue901-membership-typecheck.log` and `...-typecheck6.log`.
- Focused eslint on unchanged `CampaignFullV3.e2e.spec.ts`: PASS. `vitest list` collects the 21 inherited cases, including the 17-case hosted batch and four local coordinator preparations; collection only, no suite execution. Logs `/tmp/issue901-membership-lint.log` and `...-collection.log`.
- `pnpm check:agent-docs`: PASS.

Docs: no new dependency or external API. Existing PostgreSQL trigger/journal patterns and ordinary identity authority/token semantics are retained. No service, database integration suite, Docker, CI, staging or provider operation was started.

## Predictions and UNKNOWNs

Prediction: the membership case advances beyond its reached first-invite RED through replacement, revoke, exact sales redemption, suspend/restore, ten business audits and exact disposal. Its expected 72 live records, 13 retained redacted audits and five delivery tombstones remain unchanged. Foreign references and changed-candidate reset should continue to refuse atomically; the root business should remain exact.

UNKNOWN on this checkpoint: PostgreSQL parsing/execution, HTTP outcomes beyond the reached RED, full 17-case hosted regression, combined coordinator/contact candidate behavior, exact event count, audit/row reconciliation at runtime, rollback, baseline/concurrency behavior and disposal/lost-response retry after membership. The expired 48-hour invitation assertion is explicitly **UNKNOWN**, since it was not reached or exercised by the supplied test. Root owns independent inspection, assembly and hosted acceptance. This is a pushed source checkpoint, not acceptance evidence that the slice is green.
