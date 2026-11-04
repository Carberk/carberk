# ADR-0109: Source-first documentation and design workflow

- **Status**: Accepted
- **Date**: 2026-11-04
- **Deciders**: Carberk founder
- **Supersedes**: [ADR-0020](0020-document-hierarchy-and-mutability.md)'s artifact hierarchy and maintenance rules, including its locked charter, enduring feature/UI specifications, and sprint planning requirements.
- **Amends**: [ADR-0102](0102-pilot-first-party-scorecard-and-investigation.md)'s delivery sequencing for the Improvement workspace. Its permissions, collection limits, and investigation safeguards remain.

## Decision

Carberk's old charter, specifications, and campaign plans duplicate one another and increasingly contradict the code. Keeping them current would require maintaining a second description of every feature. The founder chose a smaller active documentation set, accepting that historical intent sometimes requires looking at a closed issue or Git history.

| Source | Owns |
|---|---|
| Source, types, tests, and runtime evidence | Implemented behavior |
| GitHub issue and linked temporary specification | The delivery slice and its acceptance criteria |
| ADRs | Durable product or architectural decisions and their tradeoffs |
| `docs/domain/GLOSSARY.md` | Domain vocabulary, without implementation status or UI copy |
| `CONTEXT-MAP.md` and local `CONTEXT.md` | Ownership, navigation, current boundaries, important constraints, and a few source/test links |
| `README.md` | Short project orientation and routes to authoritative sources |
| `AGENTS.md` and task-scoped agent guides | Agent workflow and instructions needed for the task |
| Roadmap | Founder-approved Now / Next / Later priorities, without sprint history or a duplicate backlog |
| Current operational runbooks | Procedures someone can execute against the actual environment |

Feature specifications are planning and handoff artifacts, not permanent mirrors of shipped behavior. Small changes can work directly from an issue. Multi-session work can use a parent specification and small child tickets. Once work ships, the issue remains historical; agents inspect code and tests instead of maintaining its specification indefinitely.

Retire `GRILL-OUTCOME.md`, the duplicate PRD glossary, old phase/sprint plans, feature/flow PRDs, campaign analytics plans, committed wireframes and high-fidelity handoffs, generic design manuals, and obsolete design exports/assets. Preserve any still-binding decision in an ADR, term in the canonical glossary, or active requirement in an issue before removing its only useful home. Keep unique operational instructions only when someone needs them in the current workflow. Git history is the archive; do not create replacement archive documents.

Keep local overviews short as defined by [ADR-0060](0060-source-first-agent-context-and-task-scoped-guidance.md). Remove progress logs, exhaustive implementation inventories, and future scope. The map lists real current areas and their owners. The glossary remains governed by [ADR-0042](0042-domain-glossary-authority-and-mutability.md); a defined term does not imply a shipped feature.

## Design and grilling

The UI-artifact cleanup ticket retires the repository's `wireframe` and `hifi-design` skills. Until that ticket lands, their compatibility routes must not create or update permanent artifacts. For every user-facing UI implementation and review, apply the installed `ux-heuristics`, `design-everyday-things`, and `impeccable` skills to the affected interactions. Load supporting references only where relevant. The existing Sol reviewer covers this within the [ADR-0108](0108-small-prs-with-full-send-replace-integration-delivery.md) review budget; an extra design reviewer is not required.

Preserve approved product scope, current components/tokens, and native platform conventions. A small fix does not authorize a redesign or automatic creation of permanent product/design documents. Use disposable prototypes when a decision needs visual or interaction evidence. Retain decision-rich contracts in code, an issue, or an ADR, then retire the prototype.

Record design findings and scores in the PR, with the observed limitations. If a machine lacks a required skill, disclose it and use a short fallback covering clarity, accessibility, state feedback, and error prevention/recovery. Do not claim the missing skill was run.

Grilling asks the batch of questions whose prerequisites are settled, in ordinary chat text with recommendations. Dependent questions wait for the next round. Interactive question forms are not used. The shared grilling skill owns the detailed format.

## Measurement and maintenance

Add a small reliability and measurement foundation before or alongside Listing video, then instrument each feature as it is built. Before real-user rollout, prove actionable error/health alerts and basic visibility into core product outcomes. Expand the Improvement workspace incrementally as useful data becomes available. Retain [ADR-0010](0010-testing-obs.md), [ADR-0023](0023-first-party-product-analytics.md), and ADR-0102's durable technical, privacy, access, and investigation decisions; archived implementation attempts are candidates for inspection, not proof of working software. This sequencing grants no infrastructure provisioning or deployment authority.

The founder owns product decisions and priority changes. The implementing agent updates affected vocabulary, boundaries, decisions, or executable procedures in the same PR when the change makes them inaccurate. Routine internal edits do not require touching unrelated documentation. Review verifies affected guidance against code and task scope.

Retirement PRs update active inbound links, routes, and checker dependencies together. The existing agent-documentation and glossary checks remain the verification seams. Merged ADR text stays immutable, including historical references to retired files. Update the ADR index to explain supersession and use Git history for historical targets.
