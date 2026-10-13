---
name: new-adr
description: Scaffolds and reviews a new root AutoTM Architecture Decision Record with collision checks, sequential numbering, the current template, and index maintenance. Use when the user invokes /new-adr or asks to record, supersede, complement, reject, or formalize an architecture or material product decision.
argument-hint: "<topic>"
disable-model-invocation: true
---

# Create a new ADR

Create root ADRs under `docs/adr/`. Never edit a merged ADR or invent the decision.

## Resolve and research

1. Require a non-empty topic from `$ARGUMENTS`.
2. Follow [AGENTS.md](../../../AGENTS.md). Read `docs/adr/README.md`, `docs/agents/domain.md`, the related decisions/specifications, and affected source/tests. Consult the charter only when the decision touches its locked scope.
3. Run the read-only helper:

   `node ${CLAUDE_SKILL_DIR}/scripts/prepare.mjs "$ARGUMENTS"`

4. Inspect semantic collisions. Present `supersede`, `complement`, `new decision`, or `cancel`; never overwrite or reuse a number.
5. When the decision depends on external library/API behavior released after your training cutoff, read its official documentation following `docs/agents/documentation-lookups.md`.

## Establish the decision

- Prefill verifiable context, constraints, consequences, alternatives, and references.
- The user supplies or explicitly approves the Decision. Leave a visible TODO rather than guessing.
- Use the current [ADR template](ADR_TEMPLATE.md) and one decision per record.
- For supersession, state it in metadata/Decision and reference the older ADR; do not modify the old file.

Preview the complete `Proposed` ADR and index row in conversation. File creation requires explicit approval.

## Write and review

After approval:

1. Create the new ADR and update `docs/adr/README.md` in the same change.
2. Validate numbering, filename/slug, links, status/date/deciders, decision clarity, accepted costs, alternatives, and references.
3. Show the diff and resolve TODOs. Do not commit placeholder or `[verify]` text.
4. Before merge, require explicit approval to set the final status to `Accepted` (or `Rejected`). A merged ADR is immutable.

## Delivery gates

Branch/commit, push, PR creation, and merge each require confirmation. Never offer direct-to-main as the default, self-approve, or auto-merge. If cancelled after writing, leave the draft uncommitted unless the user explicitly asks to delete it.

## Completion

Report the ADR path/number/status, relationship to prior decisions, index update, validation, and branch/PR state.
