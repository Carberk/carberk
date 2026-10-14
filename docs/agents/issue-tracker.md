# Issue tracker — GitHub Issues

This repo tracks all issues in **GitHub Issues**, using the `gh` CLI.

Skills that read this file: user-global generic skills (`triage`, `qa`, `request-refactor-plan`) and the project workflow skills at `.claude/skills/` (`create-sprint-issues`, `run-issue`) — see [ADR-0040](../adr/0040-repo-canonical-workflow-skills.md). Sprint start, tasklist reconciliation, and dependency-label updates use the canonical verified sequence in [`sprint-transitions.md`](sprint-transitions.md).

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
