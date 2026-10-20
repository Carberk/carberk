# Full-v3 owner redemption source handoff

Bounded source work for #901 under #897 and draft PR #904. Base `794ac50a41836472ad0278f95f03d1e07ef80e43`; branch `agent/issue-901-v3-owner-redemption-20261020`, reserved and pushed before edits in host checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-36688e2e`. Host scaffold `t3/36688e2e` remains at `6b04e4ed`. No PR, service, deployment or CI mutation was made. The original fifteen-case `CampaignFullV3.e2e.spec.ts` is unchanged.

## Observed RED

Hosted run `39439071650`, API job `118683953780` at `794ac50a`: full-v3 12/15, API 3004/3007; root reports worker 356/356. Local plain log `/tmp/carberk-next-release-20261020/794ac50a-api-118683953780.plain.log`, outcomes 2473-2489, failures 2493-2558, confirms:

- Admission and cross-reservation admitted disposal pass; staff expiry and fresh Session pass.
- Main reaches owner redemption at line 269 and returns 500, `Unsupported campaign business`.
- The stale fixture refuses, but performs one namespace SQL query instead of zero at line 591.
- The baseline case passes its initial rollback assertion through early refusal, then fails at line 641 because redemption never reaches the collector row lock. That first assertion does not prove the baseline mechanism.

## Source boundaries

Checkpoint `cbfa1cb2` adds only a v3 fixture candidate/target check in the remote wrapper, after runtime identity validation and before database URL handling or namespace SQL. Reset still checks the original candidate binding through the namespace manifest.

The ownership checkpoint retains same-transaction admission provenance and permits only the adopted owner invitation's unredeemed-to-redeemed transition, with all other invitation columns fixed, recovery business status and no prior member. The exact recipient then receives one active owner membership. That membership is immutable until cleaning. Dealership activation changes only status and updatedAt; later settings change only name, optional cityId and updatedAt, with an active owned owner. Root business guards remain separate and unchanged.

`BUSINESS_INVITATION_REDEEMED` requires the active owner as actor and exactly `{invitationId, role: 'owner'}` pointing to its owned redeemed invitation. `BUSINESS_SETTINGS_CHANGED` requires that owner and exactly `{fields: ['name']}` or `{fields: ['name', 'cityId']}`. Integrity reconciles Dealership versions with owned redemption/settings audit counts, one owner invitation at version 1 or 2, its membership and exactly one redemption audit when redeemed, plus the admission audit. Existing journal hashes, row hashes, event counts, foreign-edge checks and cleanup preflight remain in force. Cleaning still redacts and retains all owned audits, then deletes invitations and members before Dealerships; lost-response terminal reset stays observe-only.

Further sales invitations, member management, recovery, media and contact remain refused. No application source, schema migration, dependency, test, capacity, timeout, concurrency or operational entry point changes.

## Shared baseline preservation

V3 setup adds a namespace trigger on `public.measurement_state`, `AFTER DELETE FOR EACH ROW WHEN (OLD.key LIKE 'inventory_baseline:%')`, using the first branch of the existing hashed `track_business()` function. That branch only observes this backend's granted advisory lock with `objsubid=1` and the namespace's reassembled 64-bit key. If held, it raises `Campaign shared baseline preserved`, aborting the reserved transaction. It never owns, journals, restores or writes any shared row. It never takes a lock itself.

The manifest captures `md5(pg_get_triggerdef(oid))` immediately after installation, including the exact WHEN definition. Integrity requires that hash plus the exact relation, namespace/function, enabled state, AFTER DELETE row trigger type, non-null predicate, zero arguments and absence of constraint/deferral/internal attributes. The existing tracking hash covers the function branch. As with the existing journal, same-role SQL can alter the trigger, manifest or custom settings; this protects ordinary code, concurrent traffic and rollback, not arbitrary SQL by the application role.

Ordinary redemption writes owned rows and takes the namespace transaction lock before `invalidateInventory`. A visible baseline deletion therefore raises and rolls back invitation, membership, status and journal changes together. A baseline committed while redemption waits on the collector row should also be preserved when its subsequent DELETE sees it. A baseline outside that statement's snapshot is not deleted. With no matching baseline, the DELETE affects zero rows, the collector is only locked by the unchanged application code, and unrelated rows remain untouched. Transactions without the namespace lock delete baselines normally, including unrelated account deletion. These are predictions pending hosted execution.

Only new v3 setup adds `LOCK TABLE public.measurement_state IN SHARE ROW EXCLUSIVE MODE`, after the existing fixed-table and incoming-FK lock sequence and before the namespace advisory lock. The existing reset table set, ordering and modes are byte-identical. Timeouts remain 5 seconds for lock acquisition and 20 seconds for statements. Concurrent application transactions can deadlock with setup while holding the namespace lock and waiting for measurement_state. PostgreSQL may abort a transaction for deadlock or timeout; setup DDL and metadata roll back. There are no retries and no claim of deadlock freedom. Bounded failure and DDL rollback still need hosted evidence.

## Offline verification

- `node --check scripts/staging-campaign.mjs` and `node --check scripts/staging-remote.mjs`: PASS.
- `node /tmp/issue901-v3-owner-source-check.mjs`: PASS against `794ac50a`. VM capture verifies identical v1 functions and five v2 generated SQL paths, unchanged v3 reset lock prefixes, the setup-only extra lock position, 23 v3 triggers including the exact baseline WHEN and definition hash check, balanced generated fixture/reset parentheses, zero SQL for stale v3 fixture, wrapper difference limited to the v3 check, and unchanged fifteen-case spec. This does not parse or execute PostgreSQL.
- `node --test scripts/staging.test.mjs scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs scripts/staging-railway.test.mjs scripts/staging-campaign.test.mjs`, run once: 155/155 PASS, exit 0; log `/tmp/issue901-v3-owner-controls.log`.
- `pnpm check:agent-docs` and `git diff --check`: PASS. The pnpm host setup populated the checkout from its existing store without changing tracked dependencies.

Docs: no new dependency or external API; this implements the supplied root disposition using existing PostgreSQL trigger and advisory-lock patterns. No services, Docker, integration suite or hosted run was started.

## Predicted next reach and UNKNOWN gates

Prediction: the unchanged stale-candidate case now passes; main advances through owner redemption, settings and exact disposal; the baseline case reaches the collector lock, refuses both baseline-present attempts atomically, then succeeds without a baseline and permits unrelated deletion. Other existing cases should remain unchanged.

UNKNOWN: PostgreSQL parsing and execution, exact runtime trigger definition hashing, rollback and baseline race behavior, setup deadlock/timeout and DDL rollback, HTTP redemption/settings and audit integrity, cleanup after redemption and lost-response retry on this candidate. Independent review and hosted acceptance belong to root. New membership tests are a separate root batch whose hosted results remain UNKNOWN; this writer makes no claim about their coverage or readiness. Operator/controller/Railway v3 allowlists remain closed.
