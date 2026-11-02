# Issue tracker — GitHub Issues

This repo tracks all issues in **GitHub Issues**. Use a verified GitHub connection through the repository CLI helper or the current host's MCP/connector; [GitHub operations](github-operations.md#verify-the-active-connection) owns access checks and transport instructions.

## Required tracking before dispatch

1. Find and read the actual GitHub issue, its governing criteria, dependencies and latest execution updates before selecting or resuming a ticket. Search for an existing issue before creating one.
2. Before a worker starts, its issue must identify the owner, immutable base SHA, allowed paths/resources, dependencies, non-goals, verification commands, evidence and pass/fail acceptance. A document heading or local ticket ID alone does not satisfy this gate. Existing thread/worktree identities and historical checkpoints survive migration.
3. Record assignments, blockers, current status, accepted findings and completion evidence in the issue. Link its number from the dispatch and execution receipts. Repository maps describe scope or preserve evidence; they are not a second live task tracker. Thread completion and checkpoint commits do not close an implementation issue.
4. If GitHub refuses a required write, preserve the exact request body and error, report the block and hold new dispatch that depends on the missing issue/update. Do not silently move tracking into documents, chat or another service. A tracker change requires an explicit founder decision.

Ticket managers and their delegates read the same governing GitHub issue and report evidence back to it through the assigned update owner. A thread or delegate is an executor, not a replacement ticket. Separately scoped work needs its own GitHub issue before dispatch. Changing hosts or providers does not change these rules or the founder's model restrictions.

For `403 Resource not accessible by integration`, stop writes after the first permission refusal and arrange a permission/access correction. Do not repeat the request or retry it through another account, tool or endpoint to bypass the refusal. Resume after the access change is verified. This message indicates insufficient integration access; it is not evidence of a rate limit. Actual rate-limit responses require following GitHub's retry/reset headers, while keeping GitHub as the tracker.

After release acceptance, track documentation/evidence cleanup as a GitHub task. Reconcile issue links and make an explicit keep/archive/remove inventory before deleting stale maps or duplicate receipts. Preserve the immutable evidence, hashes and recovery references needed to substantiate the accepted release. Release work does not authorize an early cleanup sweep.

Skills that read this file: user-global generic skills (`triage`, `qa`, `request-refactor-plan`) and the project workflow skills at `.claude/skills/` (`create-sprint-issues`, `run-issue`) — see [ADR-0040](../adr/0040-repo-canonical-workflow-skills.md). Sprint start, tasklist reconciliation, and dependency-label updates use the canonical verified sequence in [`sprint-transitions.md`](sprint-transitions.md).

## Preparation in the execution contract

Tickets that run code include bounded preparation in the existing issue: required workspace dependencies, frozen restore commands, generated/build output paths, import checks and relevant input hashes. Derive these from the checked-in package exports and test setup. Preparation permissions cover only the recorded commands and paths; runtime resources retain their own reservations.

Prepare once in the assigned worktree. Reuse valid installed/generated output while its relevant lockfile, schema, source, build-script and toolchain inputs match. Use the configured package store; keep installed and generated trees local to their owning worktree. Rebuild affected dependencies when inputs change.

Check required imports before expensive test selectors. Module-resolution or global-setup failure is setup failure; behavior RED requires an actual governed behavior assertion to fail. Setup success does not establish runtime acceptance.

Authorize routine preparation and conditional test continuation together at dispatch. The worker continues within that contract without another approval round; an uncovered prerequisite or guard refusal returns to the coordinator. Use compact phase/blocker/next-action updates linked to raw receipts, and reuse accepted evidence whose relevant inputs are unchanged.

## Terminal handoff

The coordinator records one concise update in the actual issue: current phase, owner/worktree, delivered source and evidence commits, assembled and verified SHAs, result or remaining blocker, next action/owner, and the [cleanup tuple or keep reason](worktree-lifecycle.md#cleanup-during-delivery). Distinguish implemented, assembled, reviewed, runtime-proven and accepted phases; an implementation checkpoint does not close a verification gate.

Before another attempt, reconcile the issue with existing branches, assemblies and evidence. Resume the eligible owned attempt and reuse valid results. Identify the concrete missing prerequisite, failing behavior or unproven criterion before assigning more implementation. Record setup/execution time and blocking waits in existing receipts so repeated preparation can be corrected.

When bounded repairs share a review boundary, assemble compatible ready changes before the required independent review on one exact SHA, preserving each repair's affected checks. Keep ready work within the [workflow's ownership and serialization rules](coding-workflow.md#implement-and-assemble); a blocked issue does not authorize another competing writer or broader scope.

## Operations

[GitHub operations](github-operations.md) documents bounded reads and file-based writes. Fetch omitted governing content before implementing or reviewing.

### Create an issue

Use `pnpm agent:github create-issue --title "<outcome>" --body-file /tmp/issue.md --label needs-triage`. Add the area label. Writes preview by default; `--apply` sends an authorized operation.

### Find issues

`pnpm agent:github issue <number>` reads metadata, criteria and dependencies; `--full` includes the body. List candidates with `gh issue list --label ready-for-agent --search "-label:blocked" --json number,title`; the founder chooses the queue.

### Update issue state

Use `pnpm agent:github comment issue <number> --body-file /tmp/update.md`. Labels still use `gh issue edit`. Implementation issues close through merged PRs containing `Closes #<number>`; manual closure is for dashboards and non-implementation bookkeeping.

## Issue types

Two kinds of issues coexist in this repo, **one parent per sprint** plus **one child per vertical slice**. No grandchildren.

| Type | Used for | Body shape |
|---|---|---|
| **Sprint PRD (parent)** | One per sprint (S1, S2, ...). Tracks child sub-issues. | Dashboard + tasklist — no agent prompt. |
| **Sprint child** | One testable vertical slice. An isolated `/run-issue` writer supplies the parent integration candidate. | Self-contained implementation contract (see below). |

## Sprint PRD body template (parent)

```markdown
# Sprint <N> — <Name>

> **Status:** ⚪ Pending | Pending roadmap-start PR | 🟡 In progress | 🟢 Shipped
> **Phase:** 1 | 2 | 3
> **Milestone:** M<n> — <demo line>
> **Sprint doc:** [docs/prd/sprints/sprint-NN-<name>.md](...)
> **Demo line:** <user-facing capability that ships at end of sprint>

## Sub-issues

- [ ] #<n>  <child title>
- [ ] #<n+1> ...

## Sprint-wide DoD

Canonical in the sprint doc. The list above is the slice-level rollup; when every child closes, the sprint's DoD is satisfied.

## How agents pick this up

The unblocked queue is:
\`gh issue list --label "ready-for-agent" --search "-label:blocked" --json number,title,labels\`

- Interactive: the user selects an issue and invokes `run-issue <N>` in Codex desktop, Claude Code desktop, or the `claude-kimi` CLI.
- Queue: the user gives one long-running session an ordered list of issues through [`run-queue`](../../.claude/skills/run-queue/SKILL.md). Chief of Staff dispatches isolated `run-issue` writers into one bounded integration delivery.

Both paths treat the issue body as the slice contract. The parent remains a dashboard, never an executable prompt.
```

## Sprint child body template (execution contract)

The body must state one verifiable outcome and the decisions that govern it. Reference repository paths without copying source code, generic agent instructions, or command lists. The executor resolves current facts inside its worktree. When domain vocabulary matters, link the [canonical glossary](../domain/GLOSSARY.md); a definition does not add behavior to the issue.

```markdown
## Summary

<observable outcome and why it belongs in this sprint>

## Governing references

<only the sprint delta, PRD, design, or ADR that governs this slice; the agent starts from AGENTS.md and CONTEXT-MAP.md>

## Owning area

<workspace or bounded context, plus a non-obvious boundary if needed>

## Acceptance criteria (slice-scoped)

- [ ] <observable behavior and evidence that proves it>

## Out of scope

- <specific adjacent behavior deferred from this slice>

## Depends on

- #<blocker> (must merge first), or "None"

## Special verification

<only evidence beyond the repository and affected-area gates, or omit>
```

## Labels applied at creation

`create-sprint-issues` applies these labels when generating sprint child issues:

- **Triage**: `ready-for-agent` for settled autonomous work; `ready-for-human` when credentials, hardware, console access, or unresolved judgment require a person. Add `blocked` when `## Depends on` lists an open issue. Executors filter `-label:blocked`.
- **Phase**: `phase-1` | `phase-2` | `phase-3` (from the sprint's row in `docs/prd/03-roadmap.md`).
- **Area**: one of `api`, `admin`, `web`, `mobile`, `sms-gateway`, `worker`, `db`, `contracts`, `ui`, `infra`, `docs`. Multi-area allowed when a slice spans (e.g., `api` + `mobile`).
- **Type**: `feature` (default), `task` (scaffolding/plumbing), `security`, `perf`.

Parent PRD issues get `phase-N` + `feature` only — no triage label, since they're not picked up by agents.

## Acceptance criteria — source of truth

- **Sprint-wide DoD** lives in `docs/prd/sprints/sprint-NN-*.md`. It is mutable only until the sprint starts; the plan locks when its roadmap row becomes `🟡`.
- **Slice-specific AC** lives in the child issue body. Once a `/run-issue` agent picks it up, the body is effectively immutable for that run.
- The two never overlap semantically: sprint DoD describes the sprint demo; slice AC describes one vertical PR.
- For decision-heavy sprints, prefer a `Recommended child issue map` in the sprint file over copying every sprint decision into every issue body. Child issues should reference the sprint file and local `CONTEXT.md`, then restate only the acceptance criteria needed for that slice.
- When a child uses domain vocabulary, put the glossary under `Governing references` and use canonical terms in new issue text. Do not infer behavior from a definition or silently add migration of inconsistent existing names.
- If a child issue would need more than one unrelated bounded context behavior to pass, split it. If splitting would make one behavior land without its enforcement/tests, keep it together as one vertical slice.

## Dependency tracking (`Depends on`)

Each child issue body has a `## Depends on` section listing zero or more issue numbers (or "None").

- At creation: if any blocker is open, the issue is labelled `blocked`.
- After a blocker merges, `/run-issue` reconciles parent tasklist progress and `blocked` labels through [`sprint-transitions.md`](sprint-transitions.md), after re-reading every dependency and confirming which remain open.
- A human may repair bookkeeping manually with `gh issue edit <n> --remove-label "blocked"` after the same check.
- The executable queue is `gh issue list --label "ready-for-agent" --search "-label:blocked"`.

## `/run-issue` integration

Use [run-issue](../../.claude/skills/run-issue/SKILL.md) for one ready issue, [resume-issue](../../.claude/skills/resume-issue/SKILL.md) when its execution state exists, and [run-queue](../../.claude/skills/run-queue/SKILL.md) for a founder-ordered set. The [coding workflow](coding-workflow.md) routes their shared gates. The issue body stays a task contract; its branch/comment and parent integration PR Execution state record implementation progress. The successful integration owner reconciles affected dependency labels through [sprint-transitions](sprint-transitions.md).

## Body template (general / non-sprint issues)

For bugs, ad-hoc tasks, or anything outside a sprint, use this simpler shape:

```markdown
## Summary
<one or two sentences — what + why>

## Context
<what we know, what we don't know, links to ADRs / PRD>

## Acceptance criteria
- [ ] ...
- [ ] ...

## Out of scope
- ...

## Notes for the implementer
- ...
```

## Labels used

See `triage-labels.md` for the canonical five-role vocabulary plus per-area labels (`api`, `mobile`, `web`, `admin`, `sms-gateway`, `infra`), plus the `blocked` modifier.
