---
name: shape-with-docs
description: Shapes an AutoTM capability or sprint through decision grilling, vocabulary alignment, and repository-owned specifications before executable tickets exist. Use when the user invokes /shape-with-docs or asks to shape an idea, feature, or pending sprint.
argument-hint: "<topic>"
arguments:
  - topic
disable-model-invocation: true
---

# Shape with docs

Turn an unsettled product idea into reviewed AutoTM documentation. Do not create executable tickets or change implementation code in this workflow.

## Establish the evidence base

1. Resolve `$topic`; if it is empty or could identify more than one capability, ask the user to name the shaping target.
2. Follow [AGENTS.md](../../../AGENTS.md). Read [the domain glossary](../../../docs/domain/GLOSSARY.md) for relevant terms and use `CONTEXT-MAP.md` to locate affected overviews, source, and tests. Load the roadmap or charter where scheduling or locked scope affects the proposal.
3. Read the relevant target PRDs, flows, pending sprint documents, existing issues, and code. For document changes include [ADR-0060](../../../docs/adr/0060-source-first-agent-context-and-task-scoped-guidance.md), [ADR-0020](../../../docs/adr/0020-document-hierarchy-and-mutability.md), and [ADR-0042](../../../docs/adr/0042-domain-glossary-authority-and-mutability.md), plus every topic-specific ADR.
4. State the evidence already settled by the repository separately from decisions that still require the user. Do not ask the user questions the repository can answer.

## Grill the decision space

Apply the user-global grilling discipline breadth-first: purpose, users and roles, scope, workflows, invariants, failure paths, data ownership, permissions, operations, migration, rollout, and explicit non-goals. Challenge vague or conflicting answers with concrete scenarios until the choices are executable.

Apply domain-modeling discipline to terminology, examples, invariants, ownership boundaries, and code cross-references. AutoTM's document rules override any generic instruction to use `CONTEXT.md` as a glossary or planning document.

After each round:

- record decisions and remaining unknowns;
- flag conflicts with charter decisions, accepted ADRs, or current implementation;
- identify canonical terms, rejected synonyms, and overloaded names; and
- keep alternatives visible until the user chooses.

Do not silently resolve a product choice, material scope change, or architecture decision.

## Route each durable result

| Result | Canonical destination |
|---|---|
| Canonical term, definition, or rejected synonym | `docs/domain/GLOSSARY.md` |
| Target capability or end-to-end behavior | Mutable file under `docs/prd/features/` or `docs/prd/flows/` |
| Pending sprint delta, DoD, risks, or file/test plan | Eligible pending file under `docs/prd/sprints/` |
| Proposed ownership, boundaries, or constraints | Record the proposal in its specification or decision; update an affected overview when implementation changes what it documents. Source and tests own routine implementation details |
| Material semantic redefinition, bounded-context ownership change, or architecture/product decision | A new ADR through [`new-adr`](../new-adr/SKILL.md), with its approval gates |
| Routine vocabulary addition or clarification within accepted decisions | Glossary edit without a new ADR |

Never edit an accepted ADR, a locked in-progress sprint plan, or an append-only retro. If the requested change has no legal mutable destination, stop and explain which governing decision must be superseded.

## Preflight the shaping branch

- Require a clean working tree before branching. Report unrelated changes and stop; never stash, discard, or absorb them.
- Follow [the worktree lifecycle](../../../docs/agents/worktree-lifecycle.md). Reuse a host-created isolated worktree instead of creating another one for the same shaping task.
- Fetch the remote and start from updated `main`.
- Resolve the intended `shape/<slug>` name and inspect local/remote branches and open PRs before creating it.
- If prior shaping work exists, report its branch, commits, diff, and PR state. Require an explicit continue, safety-branch-and-rebase, preserve-and-restart, or cancel choice; never overwrite or delete it.
- Create the dedicated shaping branch only after these checks pass. Keep implementation code and executable ticket mutations off it.

## Prepare the shaping delivery

1. Produce a decision record in the conversation: problem, outcomes, scope, non-goals, actors, scenarios, invariants, terminology, risks, unresolved questions, and evidence.
2. Map each accepted decision to its canonical document before editing. Reject duplicate specifications that would give two artifacts the same job.
3. Edit only the approved mutable documents, glossary, agent guidance, and a new ADR when its separate workflow has been authorized.
4. Run applicable structural checks, link checks, and `git diff --check`. Show the complete documentation diff and any new-ADR implications for review.
5. After user approval, stage exact paths only, commit, push, and open a documentation PR. Do not create executable tickets until that PR is reviewed and merged.

## Hand off

After the shaping PR merges, follow [the worktree lifecycle](../../../docs/agents/worktree-lifecycle.md), then follow the [coding workflow router](../../../docs/agents/coding-workflow.md): use [`create-sprint-issues`](../create-sprint-issues/SKILL.md) for an approved pending sprint, then hand the bounded parent to [Chief of Staff](../run-queue/SKILL.md) for isolated [`run-issue`](../run-issue/SKILL.md) writers and one integration PR. Each implementation must pass independent Standards and Spec review before merge.

Report the merged shaping PR, changed canonical artifacts, accepted vocabulary, superseding ADRs, unresolved risks, and the exact next workflow. Stop before creating or running tickets.
