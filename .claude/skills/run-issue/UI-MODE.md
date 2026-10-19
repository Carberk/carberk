# UI mode

Use this gate only when the issue changes a user-visible screen, flow, component behavior, or copy.

## Design readiness

1. Identify every affected screen/platform and whether it is new, current-state maintenance, or a target redesign.
2. Search `docs/prd/ui/wireframes/` and `docs/prd/ui/hifi/` for applicable specs.
3. Verify existing specs against the issue, current PRD/flow, roadmap/sprint delta, `CONTEXT.md`, and current components/tokens. A stale file is not design authority.
4. Trivial conformance work may continue with a short rationale.
5. For a nontrivial screen without adequate design, recommend `/design-grill <N>` and pause. “Continue without design” remains available only after explicit user choice.

## UX and platform sources

Apply the authority order used by the design skills:

1. locked charter and accepted ADRs;
2. target PRD/flow and the active issue/sprint delta;
3. current source/tests and runtime evidence, located through the local overview;
4. actual token/component/i18n sources;
5. mutable UI guidance.

For mobile discovery (Home, the brand and model pickers, Search, Results, Sort, Search parameters) and Listing cards and detail, follow ADR-0051 and the approved specs in `docs/prd/features/33-search-discovery.md` and `32-listings.md`: Auto.ru is the journey reference, never a visual template or a feature list. Use the Kolesa guide only for other mobile screens without an approved spec, and never copy its visual language or deferred feature breadth. For UI details, require clear user goal, affordances/signifiers, constraints, feedback, recovery, page states, accessibility, localization, and microinteraction behavior.

## UI proof

After identifying the governing design, inventory its required states before implementation and follow [Acceptance evidence](VERIFICATION.md#acceptance-evidence) for behaviour tests and visual proof. Keep state-to-spec evidence in the [PR record](EXECUTION-STATE.md#acceptance-evidence-record); [Spec review](FINALIZATION.md#spec-evidence-checklist) owns the comparison.

## Implementation ownership

Chief of Staff dispatches isolated writers by coherent criteria and non-overlapping scope under [coding workflow](../../../docs/agents/coding-workflow.md). Issue writers return verified checkpoints; one assembly writer inspects and tests the integrated candidate. Required product/design choices return to the founder.
