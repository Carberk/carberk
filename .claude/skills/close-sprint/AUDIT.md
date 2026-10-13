# Closure audit

Use bounded evidence. A grep hit is a lead, not a verdict.

## Shipped versus planned

- Extract every sprint DoD item without editing its locked checkbox state.
- Map parent/child issues and merged PRs to those items.
- Inspect PR bodies, tests, migrations, screenshots/runtime evidence, and issue comments when closure alone is insufficient.
- Mark each item shipped, partial, deferred, or unknown with evidence.
- Record post-start additions and slippage as retrospective facts, not sprint-plan rewrites.

## Current-state documentation

- Identify PRs that changed documented ownership, boundaries, constraints, or important limitations.
- Verify the relevant overview claims and map links against source and tests. Do not require prose coverage for every field, method, or route; ADR-0060 replaces that mirror requirement.
- Propose factual corrections only; never insert future state.
- Treat structural ambiguity as unknown until inspected.

## Decision history

- Identify material architecture or product decisions made during the sprint.
- Verify an accepted ADR already records each decision.
- Never edit a merged ADR. Recommend `/new-adr` for missing or superseding decisions.
- Do not treat implementation detail or a reverted experiment as automatically ADR-worthy.

## Plan, roadmap, and retro

- Verify the roadmap status, dates, milestone, parent, and shipped log against evidence.
- Verify an existing retro is append-only and do not rewrite it.
- Report stale GitHub bookkeeping separately; this skill does not mutate it.
- If no next sprint is shaped, do not invent a number, scope, or prerequisite list beyond documented operational facts.

## Dependencies and verification

- Review meaningful dependency/version changes and their compatibility, official-documentation and Expo alignment evidence.
- Spot-check the repository-required typecheck, lint, test, migration, CI, Testcontainers, and host-only mobile gates.
- Distinguish passed, failed, skipped with reason, and unavailable.
- Scan for layer violations, direct cross-context imports, accidental scope, and unexplained complexity in touched areas.

## Audit output

For every finding, record:

| Area | Evidence | Classification | Proposed owner/artifact |
|---|---|---|---|
| `<area>` | `<path/issue/PR/test>` | shipped / partial / drift / unknown | `<retro, CONTEXT, ADR, follow-up>` |
