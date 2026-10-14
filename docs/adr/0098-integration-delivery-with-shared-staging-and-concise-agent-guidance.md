# ADR-0098: Integration delivery with shared staging and concise agent guidance

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Supersedes**: [ADR-0075](0075-railway-pr-backends-for-agent-native-sessions.md)'s PR-environment workflow and [ADR-0094](0094-one-orchestrator-implements-batched-pull-requests-trial.md)'s alternative batch workflow.
- **Amends**: [ADR-0065](0065-small-changes-skip-the-issue-ceremony.md)'s small-change path, [ADR-0084](0084-related-issues-of-one-parent-may-ship-on-one-integration-branch.md)'s optional integration grouping, [ADR-0085](0085-one-review-round-one-fix-round-no-re-review.md)'s review policy, and [ADR-0060](0060-source-first-agent-context-and-task-scoped-guidance.md)'s active guidance.

## Context

Multiple execution paths and repeated instructions make agent behavior inconsistent. The founder removed Railway PR environments because of cost. Shared staging must support integration testing while implementation remains parallel. Testing guidance exists, but advisory exceptions and weak legacy tests limit its effectiveness.

The founder accepted this decision on 2026-10-14. Policy acceptance and operational implementation remain separate steps. Other architectural safeguards remain effective.

## Decision

Carberk uses one integration delivery workflow, with a founder-approved exception for focused, low-risk changes.

1. **Orchestration.** Chief of Staff coordinates the bounded parent specification, dependencies, implementers, integration, evidence and completion. Implementers work in isolated issue branches. One writer assembles the integration branch and opens one PR into `main`.
2. **Review and verification.** The assembled candidate receives one independent, read-only Standards and Spec review, followed by one fix round. Applicable checks pass on the resulting candidate. Staging-discovered bugs are fixed on the integration branch and affected evidence is rerun. Material scope or architecture changes require another independent review.
3. **Shared staging.** Chief of Staff owns a durable reservation identifying the candidate commit, owner, purpose and recovery state. Founder priority determines order, followed by first ready. Parallel implementation continues while candidates wait. Deployments and destructive operations are serialized.
4. **Staging authority.** Within the reservation, Chief of Staff may deploy, migrate, reset fixtures and restore staging without repeated approval. Staging data is disposable. Operations verify environment identity and remain confined to staging. After success, failure or recovery from an interrupted session, staging returns to current `main`, with data or schema reset when necessary.
5. **Acceptance timing.** Final staging acceptance follows assembly, review and fixes. Earlier reservations support investigations and device evidence needed for review. Merge requires applicable acceptance evidence and green required CI. Production promotion remains a separate release action.
6. **Small-change exception.** Focused, low-risk docs and code changes may go directly to `main` after founder approval of the concrete diff. Migrations, authentication or permissions, API contracts, cross-context restructuring, and deployment or CI policy changes use integration PRs. Applicable review and hosted checks precede the direct push. Changes to the approved candidate require renewed approval and affected verification. The exception bypasses the PR requirement while retaining required checks.
7. **Architecture and tests.** Domain boundaries and meaningful behavior tests are mandatory for new or changed behavior. Preserve framework-free domain logic, infrastructure boundaries and cross-context ports. Tests exercise observable behavior, mock external boundaries and demonstrate failure for the relevant broken behavior. Render tests establish UI behavior; device evidence establishes native and visual claims. Existing debt receives separately scoped repairs.
8. **Guidance ownership.** `AGENTS.md` is a short router to this workflow and task-specific constraints. Skills contain role-specific actions and explicit completion conditions. Each shared rule has one authoritative owner, loaded when relevant. Alternative execution paths leave active guidance.
9. **Documentation and rollout.** Update README, navigation, overviews and runbooks against source and runtime evidence. Preserve immutable ADRs and locked historical records. Establish shared test foundations and canonical examples, then repair audited gaps through focused integration PRs ordered by risk. Update executable documentation guards alongside changed paths.

## Consequences

### Positive

- Parallel implementation remains available while shared staging has explicit ownership.
- Agents load less unrelated context and follow fewer procedural branches.
- Repaired test suites provide working examples for future behavior tests.

### Negative / accepted costs

- Stronger testing requirements add work where coverage is weak.
- Staging resets interrupt sessions and discard test data.
- Direct pushes require explicit approval and a controlled protection exception.
- Fixes normally receive affected verification without another independent review; material scope or architecture changes trigger review.

### Neutral

- Disposable GitHub-hosted services remain the evidence source for container-backed repository tests. Shared staging supplies deployed acceptance, not repository test database credentials.
- Production promotion and store submission remain separate release actions.
- Historical decisions and locked records remain intact. Operational capabilities remain gated by their verified implementation.

## Alternatives considered

- **Paid PR environments.** Rejected because of cost.
- **Multiple active execution workflows.** Rejected because they duplicate policy and increase ambiguity.
- **Unchecked direct pushes.** Rejected in favor of hosted checks before `main`.
- **One large test rewrite.** Rejected in favor of shared foundations and repairs by risk.

## References

- [ADR-0039: Hosting](0039-phased-cloud-first-hosting.md)
- [ADR-0070: Test-first behavior and UI evidence](0070-test-first-behaviour-and-ui-evidence.md)
- [ADR-0087: Founder-delegated outcome orchestration](0087-founder-delegated-outcome-orchestration.md)
- [Coding standards](../agents/coding-standards.md)
- [Transition plan](../prd/ops/89-integration-delivery-transition.md)
- [Test audit follow-up #656](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/656)
- [GitHub branch protection API](https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2022-11-28): documents actor-specific bypass of PR requirements separately from required status checks. Configuration and exact-commit check behavior still require implementation verification.
