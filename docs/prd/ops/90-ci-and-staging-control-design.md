# CI and staging control design

Implementation contract for [ADR-0098](../../adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md) and its [transition plan](89-integration-delivery-transition.md). This design has not changed CI, protection or live environments.

## Current evidence

At source `2e1bcb97fff0b7582490b7d5566f067a03f31608`, PR Checks has a required `pr` aggregator and separate docs, static, API/worker, database and frontend jobs. API jobs start disposable Postgres, Redis and MinIO; database tests use Testcontainers. Main CI adds production builds. Neither workflow needs Railway PR environments.

The branch-protection read on 2026-10-14 requires `pr` from GitHub Actions, enforces administrators, requires linear history, and requires a PR with zero mandatory GitHub approvals. Required checks are not configured to require an up-to-date branch. Direct pushes therefore need an explicit PR-requirement exception; disabling protection is not the proposed mechanism.

`scripts/ci-lane.mjs` supports non-PR base-to-head comparison, but a missing base selects full. Existing PR-specific green-head optimization cannot be assumed valid for a branch trigger. `railway/api.json` owns migration execution through API pre-deploy. Deployment triggers are provider-side; changing repository JSON alone cannot reserve staging.

## CI contract

Use one reusable verification implementation for PR candidates and explicitly selected direct-push candidates. Keep docs/full lane classification and a fail-closed final result. Preserve required `pr` compatibility; prove GitHub associates successful candidate checks with the commit being promoted rather than relying on check names alone.

For an approved direct-push candidate:

1. Capture current remote main SHA, candidate SHA, diff and scope classification. Candidate is a linear descendant of that main baseline.
2. Run applicable hosted checks on that exact branch commit using a PR-free trigger. A dispatch must use the candidate branch as its workflow ref and verify `head_sha`; an input SHA checked out inside a run does not alone prove check association.
3. Run applicable independent review. Record the founder's approval of the concrete candidate/diff, check-run IDs and outcomes in a durable receipt outside the candidate commit. Adding the receipt must not silently create an untested commit.
4. Re-read remote main and candidate immediately before promotion. If either changed, regenerate the candidate against current main and repeat affected verification and approval. Perform a normal fast-forward push; never force main.
5. Confirm main equals the approved candidate and record post-push CI separately. Its result cannot substitute for the pre-push gate.

GitHub's actor-specific PR bypass is an implementation candidate, not evidence that the platform enforces founder approval. The promotion procedure must enforce the receipt; the protection exception must retain required checks and linear history. Use only the intended actor. Validate supported behavior before configuration cutover.

Tests cover missing/failed/cancelled checks, wrong `head_sha`, stale main, changed candidate, unapproved scope, absent approval and a valid fast-forward. Code changes take the full lane initially. Narrowing gates by impact needs separate evidence; line count is not a skip rule.

## Staging reservation contract

Maintain one project/environment-scoped durable reservation with atomic acquisition. A comment is evidence, not a lock. Prefer a serialized automation job as the sole mutation entrypoint, with a durable owner record that survives process exits. Select the implementation after checking provider and GitHub capabilities; GitHub concurrency alone does not promise founder-priority queue order.

The record contains reservation ID, owner/session, parent and PR, phase, candidate SHA, main baseline, service deployment IDs, queued priority, heartbeat and recovery state. Allowed phases are acquired, preparing, deployed, accepting, restoring, released and recovery-required. An expired heartbeat signals recovery, not permission for a second writer to start resetting data.

Every mutation validates the configured project ID and staging environment ID, refuses production, and checks reservation ownership. All staging writers use this entrypoint. Direct CLI/dashboard writes outside it can defeat serialization and must be accounted for during cutover.

Before deployment, reconcile in-flight deployments and pause/suppress saved staging autodeploy triggers so another main push cannot overwrite the candidate. Preserve their exact configuration for restoration. Deploy affected services from the pinned source; record unchanged service SHAs too. Verify readiness and the API's reported source, worker startup, and relevant admin/web compatibility before acceptance.

## Disposable state and side effects

Staging authorization includes schema/data/fixture resets within the reservation. It does not authorize production writes, messages to real recipients, or new paid resources. Use owned synthetic users and sandbox/mock outbound adapters, and verify environment-scoped storage and queues. Keep public media origins, clients and backend source recorded with evidence.

Existing repository suites retain disposable CI services. Introduce a staging-specific fixture command with environment identity and reservation guards. Preserve stable edge-case fixtures and offer volume inventory where acceptance needs it. Existing PR-only seed rejection is replaced deliberately, not weakened through a string rename.

Schema restoration accounts for migrations already applied by the candidate. Redeploying main code does not undo them. Rebuild disposable staging state from current main migrations and selected fixtures when backward compatibility is not established. Stop owned consumers before destructive reset and reconcile queue/media state before restarting.

## Acceptance and restoration

Final acceptance uses the assembled, reviewed candidate. Earlier reservations can collect investigations or reviewer device evidence. Evidence binds acceptance criteria to source SHA, service versions, fixture profile, commands/device proof and results. A later fix invalidates affected evidence; material scope or architecture changes require independent review.

On completion or failure, restore current remote main, not a stale acquisition baseline. Resolve incompatible schema/data, redeploy services, verify health and focused smoke, restore saved trigger configuration and verify it. If main moves during restoration, reconcile the new target before releasing. Failure leaves the reservation recovery-required with exact missing steps; do not claim staging is available.

Cancellation and host failure require the same restoration path. Cleanup handlers are useful but insufficient alone; an explicit recovery job/session must resume from the durable record. Candidate acceptance remains recorded even when restoration fails, but overall task completion reports the operational block.

## Delivery sequence and verification

1. Consolidate CI without changing its coverage; validate existing docs/full behavior and required-check aggregation.
2. Add PR-free candidate verification and receipt validation; verify actual GitHub check association and actor-specific protection behavior in a controlled test before enabling direct promotion.
3. Implement reservation and provider-trigger handling; prove contention, interruption and recovery with synthetic staging state.
4. Implement guarded fixtures and restoration; demonstrate migration incompatibility recovery and current-main reconciliation.
5. Run a representative integration acceptance, then restore and independently verify staging.

The active cutover requires accepted policy, implementation review, green hosted gates and concrete verification receipts. Production/store operations remain outside this transition.

## Sources

- [GitHub branch protection REST API](https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2022-11-28), read 2026-10-14 for PR bypass versus required checks.
- Repository workflow files, `scripts/ci-lane.mjs`, `railway/api.json`, and the provider-side trigger disposition from the completed release receipts. Receipt history is not proof of current live configuration; re-read it before mutation.
