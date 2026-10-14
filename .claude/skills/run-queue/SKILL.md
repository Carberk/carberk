---
name: run-queue
description: Chief of Staff coordinates one bounded parent specification through isolated writers and one integration delivery.
argument-hint: "[parent specification or founder-delegated outcome]"
disable-model-invocation: true
---

# Chief of Staff

Input: founder-selected scope/order or explicitly delegated bounded outcome. Output: one integration PR and criterion-level evidence, or a recoverable blocked state. Follow [coding workflow](../../../docs/agents/coding-workflow.md); this skill owns orchestration actions.

1. Read the parent/specification and existing issue, branch, worktree and PR state. Record authority, completion criteria, exclusions, selected tasks, dependencies and human-owned steps in one durable parent. Prefer existing tasks; prepare missing tasks only within delegation. Stop unresolved intent or competing ownership before dispatch.
2. Reserve the integration branch from current `main`; record its base SHA. Dispatch ready work in dependency order using [model profile](../../../docs/agents/queue-models.md) and [writer ownership](../../../docs/agents/worktree-lifecycle.md#queue-implementer-worktrees). Give each writer issue/spec, allowed scope, supplied base SHA, evidence target and return contract. Waiting tasks need no running agents.
3. Writers follow [run-issue](../run-issue/SKILL.md) and return checkpoints/evidence. Inspect each handoff. Dispatch one assembly writer to incorporate verified checkpoints and current `main`, then run combined [verification](../run-issue/VERIFICATION.md). Keep the one draft PR and [Execution state](../run-issue/EXECUTION-STATE.md) current.
4. Pin the verified SHA. Dispatch fresh read-only Standards and Spec contexts under [finalization](../run-issue/FINALIZATION.md), post reports, decide findings and assign one fix writer. Inspect fixes and rerun affected checks. Material scope or architecture changes trigger independent review.
5. Own the [staging reservation](../../../docs/agents/shared-staging.md), final acceptance and restoration. Investigations/reviewer device evidence may reserve earlier. Continue independent ready implementation while candidates wait. Fix staging failures on the integration branch and reverify.
6. When all required evidence and CI are green, finalize the integration PR, verify closure/bookkeeping and apply [safe cleanup](../../../docs/agents/worktree-lifecycle.md#safe-cleanup-gate). Report PR/merge SHA, criterion evidence, deferred work, missing gates and cleanup state.

Stop on product/architecture ambiguity, scope expansion, destructive recovery, semantic conflict, guard refusal or exhausted repair cap. Preserve [recovery state](../run-issue/BAIL-AND-RECOVERY.md); continue only independent ready work. Complete only after verified merge, closure, acceptance and restoration, or a clearly reported blocked handoff.
