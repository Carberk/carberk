# Integration delivery

Active delivery policy under [ADR-0098](../adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md). The [transition gates](../prd/ops/89-integration-delivery-transition.md) must precede activation of new operational capabilities. Existing executable safeguards remain effective; a written procedure does not enable staging fixtures or direct pushes.

This file owns delivery roles, phases and gates. [AGENTS.md](../../AGENTS.md) routes task constraints. Specifications own intended behavior; source and runtime evidence own current behavior. Use the [glossary](../domain/GLOSSARY.md) when terminology matters.

## Prepare

Shape unresolved intent with [shape-with-docs](../../.claude/skills/shape-with-docs/SKILL.md); material decisions use [new-adr](../../.claude/skills/new-adr/SKILL.md). After approved shaping merges, [create-sprint-issues](../../.claude/skills/create-sprint-issues/SKILL.md) prepares sprint tasks. [Issue tracker](issue-tracker.md) owns issue shape and [sprint transitions](sprint-transitions.md) owns scheduling bookkeeping.

Chief of Staff uses [run-queue](../../.claude/skills/run-queue/SKILL.md) for one bounded parent specification, including a single-task delivery. Record founder authority, exclusions, selected issues, dependencies and completion evidence in the parent. Select within explicit delegation; product ambiguity, architecture decisions and material scope expansion return to the founder.

## Delegation authority

Chief of Staff resolves implementation and handoff decisions within the founder-authorized outcome. This includes supplying existing prerequisites, choosing a verified base, adjusting a child's allowed paths, fixture/setup repairs, justified verification reruns and resource scheduling. Check active ownership and dependencies, update the dispatch contract, and keep one writer per overlapping contract/file and one assembler. A coordinator-imposed file limit is not a founder approval gate.

Children send these questions to Chief of Staff through agent messaging, with the affected paths, prerequisite and proposed resolution. They do not open founder-facing question or approval requests for routine delegated decisions. Chief of Staff uses recorded authority and resolves the dependency or scope adjustment while other independent work continues. Escalate only a genuinely missing external permission/access or a product/architecture/scope decision outside that authority. A broad autonomous-delivery instruction already authorizes ordinary technical choices within the selected criteria; it does not authorize unrelated product expansion. For hosted access, use the [existing CLI sessions](cli-access.md) before requesting credentials.

## Implement and assemble

1. Inspect existing branches, worktrees, PRs and durable state before assigning a writer. Resume existing attempts with [resume-issue](../../.claude/skills/resume-issue/SKILL.md).
2. Reserve `agent/spec-<parent>-<slug>` from current `origin/main`. Open its one draft PR early, after the first checkpoint. Keep the parent and each issue's [Execution state](../../.claude/skills/run-issue/EXECUTION-STATE.md) current.
3. Dispatch one isolated [run-issue](../../.claude/skills/run-issue/SKILL.md) writer per ready issue from a supplied integration SHA. Each owns `agent/issue-<N>`, pushes a reservation before edits and stops after verification. Writers open no issue PRs. Dependency work may proceed from a verified prerequisite incorporated into the integration candidate; dependencies close only through the final PR.
4. One assembly writer merges verified issue checkpoints in dependency order, reconciles current `main`, inspects the combined diff and runs full candidate checks. Mechanical conflicts are implementation work; conflicts with multiple valid semantic resolutions need direction. Only one writer changes the integration branch at a time.

Use the [worktree lifecycle](worktree-lifecycle.md) and host [model profile](queue-models.md). Chief of Staff owns dispatch and handoffs, never another writer's checkout. Stacking, unrelated per-issue PRs and the batch trial are retired delivery modes. Recover old attempts into the bounded parent without losing refs or evidence.

## Review and accept

1. Run [verification](../../.claude/skills/run-issue/VERIFICATION.md) before pinning the assembled SHA. Missing required evidence blocks completion.
2. Obtain one independent, read-only Standards and Spec review round on that SHA, then one fix round under [finalization](../../.claude/skills/run-issue/FINALIZATION.md). Reviewers did not implement the candidate. Fixes receive affected verification; material scope or architecture changes require another independent review.
3. Reserve [shared staging](shared-staging.md) for final deployed acceptance after review/fixes. Earlier reservations support investigations and device evidence needed by review. A staging-found bug is fixed on the integration branch and affected checks and deployed evidence rerun; a material scope or architecture change returns to independent review.
4. Require green applicable CI on the resulting candidate, complete acceptance evidence and staging restoration. Merge the integration PR by protected squash merge. Production promotion and store submission are separate release actions.
5. Verify merge and issue closure, reconcile dependent labels, report missing evidence and run the safe cleanup phase. Checkpoint commits preserve work; they do not establish final verification.

## Small changes (ADR-0065)

A focused, low-risk docs or code change may omit issue ceremony. Default delivery remains an integration PR. Direct push requires founder approval of the concrete diff and SHA, applicable independent review and hosted checks on that exact candidate before `main`. A changed candidate needs renewed approval and affected verification.

Migrations, authentication/permissions, API contracts, cross-context restructuring, deployment and CI policy changes always use integration PRs. Workflow policy cutover uses a PR. The direct-push path remains unavailable until exact-commit CI and an actor-specific PR-requirement exception are implemented and verified. Keep required checks and other protection intact; never disable protection globally.

## Stop and recover

Preserve refs, local diffs and [durable state](../../.claude/skills/run-issue/BAIL-AND-RECOVERY.md) on interruption, unavailable authority/evidence or host refusal. Cap repairs of the same root failure at three focused attempts. Waiting is not an attempt. Resume from evidence rather than chat history; destructive recovery and ambiguous semantic conflicts need direction.

Shared rules have one owner: [domain/document authority](domain.md), [module/test standards](coding-standards.md), [acceptance verification](../../.claude/skills/run-issue/VERIFICATION.md), [staging operations](shared-staging.md), and workspace/CI configuration for commands. For GitHub reads and writes use [bounded operations](github-operations.md); for sprint status/closeout use [sprint-status](../../.claude/skills/sprint-status/SKILL.md) or [close-sprint](../../.claude/skills/close-sprint/SKILL.md).
