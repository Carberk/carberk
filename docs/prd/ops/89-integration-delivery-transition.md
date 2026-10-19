# Integration delivery transition

This is the implementation and cutover plan for [Proposed ADR-0098](../../adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md). It does not activate the proposed policy. It owns transition work and evidence; the accepted ADR will own the decision, and active guides will own execution procedures.

## Scope and completion

Deliver the integration workflow, shared staging operations, approved direct-push exception, mandatory standards, concise skills and source-verified documentation. Audit the active test suite, establish shared foundations, and repair confirmed gaps by risk through focused integration PRs.

Complete when the active entry points route only to the agreed workflow and its explicit exception; executable checks match the new paths; representative task, recovery, CI and staging scenarios pass; and each audit finding has a verified repair or explicit founder-approved deferral. Preserve production configuration, release artifacts, accepted ADR files, locked sprint plans and unrelated worktrees.

## Authoritative owners

| Concern | Owner after cutover |
|---|---|
| Startup and conditional routing | `AGENTS.md`; `CLAUDE.md` remains its thin loader |
| Delivery phases, gates and exception | `docs/agents/coding-workflow.md` |
| Orchestrator and implementer actions | Repository skills under `.claude/skills/`, each with one role and explicit completion conditions |
| Acceptance evidence and test-first procedure | One verification reference, linked by role skills |
| Module and test principles | `docs/agents/coding-standards.md` |
| Domain constraints | `docs/agents/domain.md` |
| Staging reservation, fixture reset and restoration | Deployment runbook and its task-specific operational reference |
| Commands, versions and CI job graph | Workspace configuration and `.github/workflows/`; prose explains only constraints and navigation |
| Current product orientation | README and selective CONTEXT overviews, verified against source |

Choose final skill names during implementation and update every consumer in the same transition. Worker execution and recovery remain phases of the integration workflow, not alternative delivery modes.

## Ordered work

1. **Establish the policy.** Obtain final ADR acceptance through the repository ADR workflow. Record supersession in the index without editing historical decisions. Create a bounded transition parent and ready implementation tasks after the shaping change merges.
2. **Finish the audit.** Pin findings to the audited source, distinguish active tests from historical examples, account for files reviewed and remaining, and verify suspected weaknesses against actual implementation. Keep strong neighboring coverage visible. The audit began at `2e1bcb97fff0b7582490b7d5566f067a03f31608`.
3. **Consolidate guidance.** Measure startup and representative task reading before and after. Remove repeated rules and retired routes; preserve necessary constraints. Update README, navigation, relevant overviews and operational guides only after checking current source and evidence. Keep target requirements distinct from shipped behavior.
4. **Align executable checks.** Update agent-document and glossary integration guards, native-session entrypoints, workflow tests and references together. The glossary checker currently names `run-issue`, `resume-issue` and review paths. Find additional consumers before retiring files. Source/configuration tests remain valid when their assertions concern source/configuration contracts.
5. **Implement staging operations.** Provide exclusive reservations with owner, candidate SHA, priority, lifecycle and recovery state. Verify environment identity before mutations. Keep deploys and resets serialized, collect deployed SHA evidence, and restore current `main` after every reservation. Replace PR-only fixture seeding with explicitly guarded staging fixtures; the existing seed intentionally rejects staging. Keep isolated CI services for repository suites that clear databases or Redis.
6. **Implement the direct-push path.** Trigger applicable hosted checks without a PR and verify their association with the exact candidate commit. Require a concrete founder approval receipt and applicable independent review. Use an actor-specific PR-requirement exception while retaining required checks. Verify changed-head and moved-main handling, rejection of unapproved candidates, and branch-protection behavior before enabling the path. No global protection disabling.
7. **Establish test foundations.** Select strong existing examples for domain/application tests, real database integration, rendered UI with real hooks and MSW, and device acceptance. Introduce shared helpers only where actual repairs need them. Demonstrate representative tests failing for the relevant broken behavior and passing after restoration.
8. **Repair by risk.** Prioritize security and business-rule gaps, tests of fakes instead of production, omitted CI suites, then brittle or redundant coverage and flakiness. Preserve useful assertions and remove superseded tests. Audit static flags are leads, not automatic deletion criteria. Record each finding, owning task, repair and verification.

## Cutover evidence

- Documentation links, glossary checks and applicable repository gates pass on the fixed candidate.
- Normal integration, one-task integration, approved direct push, rejected direct push, interrupted recovery and competing staging reservations follow one documented contract.
- Staging evidence identifies the tested commit; cleanup proves restoration to current `main` and handles persistent migrations.
- Rendered behavior, native/device evidence and disposable CI test results have distinct claims.
- New/changed behavior is reviewed against mandatory standards; unrelated legacy debt remains in selected audit tasks.
- Retired workflow entrypoints have no active callers. Historical records remain navigable.
- No stronger task-performance claim is made from reduced word count alone.

## Current state

ADR and plan drafted; implementation has not begun. The delegated test audit is in progress. No branch-protection, CI, staging or production settings have been changed by this transition.
