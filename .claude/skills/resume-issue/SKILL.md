---
name: resume-issue
description: Reconstructs an existing issue or integration attempt from durable evidence and resumes its assigned phase.
argument-hint: "[issue or parent]"
disable-model-invocation: true
---

# Recover an attempt

Input: existing issue/parent and assigned role. Output: preserved evidence and deterministic continuation or blocked handoff. Use [coding workflow](../../../docs/agents/coding-workflow.md) and relevant [glossary](../../../docs/domain/GLOSSARY.md) terms.

1. Inspect issue/spec, dependencies, ownership, local/remote heads, worktree diff, processes, PR state/comments/checks and review SHAs. Read [Execution state](../run-issue/EXECUTION-STATE.md). Interrupted or absent results are unknown.
2. Classify reservation-only, local draft, pushed checkpoint, assembled/reviewed candidate, staging reservation, or merged bookkeeping. Recover a legacy batch/stacked attempt into its bounded parent through Chief of Staff; preserve old refs and evidence.
3. Continue in your own worktree from the pushed head. Read another owner's checkout only to recover drafts. Fast-forward a reservation only if it has no unique commits, local changes or PR. Preserve refs/diffs before a mechanical rebase. Destructive recovery, overlapping user work or multiple valid semantic resolutions stop for direction.
4. Rebuild the criterion evidence map. Disable auto-merge before changing an eligible PR head. Resume the first incomplete phase through [run-issue](../run-issue/SKILL.md), [Chief of Staff](../run-queue/SKILL.md) or [finalization](../run-issue/FINALIZATION.md). Reverify inputs affected by changes; material scope/architecture changes need independent review.
5. For interrupted staging, follow [reservation recovery](../../../docs/agents/shared-staging.md) before another mutation. For merged work, verify closure and reconcile bookkeeping without creating another PR or closing an implementation issue by hand.

Preserve and report refs, recovery path, owner, candidate SHA, evidence, PR/issue/staging state and next action. Complete when the assigned phase hands back safely; merge completion belongs to Chief of Staff. Follow [bail/recovery](../run-issue/BAIL-AND-RECOVERY.md) when blocked.
