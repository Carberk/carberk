---
name: run-issue
description: Implements one ready issue in an owned worktree for the parent integration candidate; stops at verified handoff.
argument-hint: "[issue-number and supplied integration SHA]"
disable-model-invocation: true
---

# Implement one issue

Input: issue/specification, supplied integration SHA, allowed scope and evidence target from Chief of Staff. Output: pushed issue checkpoint and evidence handoff. [Coding workflow](../../../docs/agents/coding-workflow.md) owns delivery; this writer opens no issue PR and does not merge. A standalone request first enters the same workflow as a single-task parent.

1. Read the issue, governing spec and relevant [glossary](../../../docs/domain/GLOSSARY.md) terms. Locate affected source/tests through `CONTEXT-MAP.md`. Require testable criteria and satisfied dispatch dependencies. If an attempt exists, use [resume-issue](../resume-issue/SKILL.md).
2. Inspect status and ownership under [worktree lifecycle](../../../docs/agents/worktree-lifecycle.md). Create/reuse only your own isolated worktree. Preserve unrelated changes. Reserve and push `agent/issue-<N>` from the supplied SHA before editing; record [Execution state](EXECUTION-STATE.md) in the issue's existing execution comment.
3. Map every criterion to implementation and [acceptance evidence](VERIFICATION.md#acceptance-evidence). Load [UI readiness](UI-MODE.md) for UI and [slices](SLICED-ISSUES.md) for ordered slices. Load external dependency docs when [required](../../../docs/agents/documentation-lookups.md).
4. Write/run the relevant failing behavior test before production code, record the checkpoint, then implement the smallest complete behavior and prove the same test green. Follow [mandatory standards](../../../docs/agents/coding-standards.md) and task constraints. Push meaningful checkpoints and update durable evidence.
5. Run [verification](VERIFICATION.md). Inspect the complete diff; update an overview when its documented ownership, boundary, constraint or limitation changes. Report base/head SHAs, exact files, evidence per criterion, commands/results, artifacts, open decisions and missing gates to Chief of Staff.

Stop after verified handoff. No reviewers or writing subagents are dispatched by this role. Scope expansion, architecture/product ambiguity, missing nontrivial design, destructive recovery and semantic conflicts return to Chief of Staff. Follow [bail/recovery](BAIL-AND-RECOVERY.md) on refusal or unavailable evidence; never claim completion while required evidence is blocked.
