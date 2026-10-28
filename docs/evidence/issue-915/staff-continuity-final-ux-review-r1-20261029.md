# Staff continuity final UX/a11y/localization/microinteraction review R1

Date: 2026-10-29  
Verdict: ACCEPTED FOR PRODUCTION DISPATCH, with one severity-2 implementation gate. No severity-3 or severity-4 finding.

## Pinned evidence

- Hi-fi candidate: `918b967938cc4f96bae8b60ca220746574cdf579`, tree `65526417af43d4500215e5d984b0cbe5c346ec34`.
- Assembled candidate read: `db23bc501abd57361e10ea034f6cd7df73640de5`, tree `15fc9bea089bdf71b60898d4cfa4ff438cbd91b0`.
- Accepted wireframe authority: `5e4aa9906c7a96c1855767a6b630d87046cbca7d`, tree `52eb78f62e13107cfa3b24293f01989b255d9eab`.
- Source/design base: `add640a8de601905b2c10b8451d5184be14222b7`, tree `f67cbab8b31a14bed919d368bfee70ae2212fc26`.

Reviewed the hi-fi, receipt, accepted wireframe, prior R1 review and its disposition, staff-workflow-dispatch, current admin/API/contracts/components/tokens/copy/proxies/actions, AGENTS/CONTEXT/UI-MODE, and the UX heuristics, Design of Everyday Things, microinteractions, hi-fi, and unslop guidance. This was source and document review only. No authoring, tests, build/compiler, browser, SQL, service, or staging activity occurred.

## Prior finding disposition

- F1, severity 3, is resolved in the written design. Lines 57-65 bind new capture to the fresh current raw, make root eligibility provisional, bind corrections to an explicitly reviewed retained usable leaf, require an unused verified support reference without forcing a new upload, and rearm after stale or denied reads. This matches the server checks at `PrismaDiagnosticIdentityEvidence.ts:299-316`; filtered absence is not treated as an eligibility fact.
- F2, severity 2, is resolved. Lines 92-96 and 118 specify named retry/reload/back controls, focus fallbacks, preview revocation, acknowledgment clearing, complete re-review, and no automatic issue. This matches the exact-pair proxy and post-storage reauthorization.
- F3, severity 2, is resolved. Lines 61 and 145-159 separate image rights from identity-record rights, keep supplier restrictions optional, and explain that declarations do not grant ownership or publication rights.

## Review against the selected criterion

All five required states are explicit in lines 81-99: default, loading, empty, error, and offline/network, with raw/support, partial scan, no technicians/handoffs, stale/conflict, upload failure, protected-image failure, denied/auth-deferred, invalidated handoff, and completed B consumption variants. The recovery table in lines 101-116 preserves the accepted same-page exact-command retry, GET-before-retry after an unknown reply, same request ID on re-entry, pending-input as unsaved input, changed-command conflict handling, historical issuance, B-only consumption, no automatic replay, and no protected browser persistence.

Affordances and mappings are clear: action labels are verbs, controls are native and visibly grouped, comparison is A then B in DOM order, and review controls follow the complete pair. Constraints prevent wrong records, missing rights, stale versions, partial support, duplicate actions, and hidden-graph inference. Feedback is honest: busy text, explicit status/alert regions, no fake percentage, no optimistic issue/consume, and immediate focus movement for stated transitions. Repeated, interrupted, zero, partial, exhausted, and maximum (20 identifiers, 20 support references, 40 pair references) behavior is specified.

The token map (lines 30-53) resolves local light/dark bindings, boundaries, disabled reasons, status semantics, and 44px target intent. Motion is reduced to an optional 150ms transition with reduced-motion removal (lines 120-122). The accessibility section specifies headings, fieldsets, labels, descriptions, invalid state, live-region timing, A/B DOM order, image names, denial clearing, zoom, and keyboard recovery (lines 124-128). These are written requirements only; no rendered contrast, focus, target-size, screen-reader, or zoom result is claimed.

The complete new copy inventory is present for EN/RU/TK (lines 130-249), including error, empty, recovery, alt, rights, pending-input, historical, and B-only wording. Proposed translations remain marked native-review-required. I found no concrete meaning error from source inspection. Native approval and long-text rendering remain open gates.

## Required minimal fix

**Severity 2, accessibility, criterion: visible keyboard focus / WCAG focus indication.** The prescribed `focus-visible:outline-current` in `docs/prd/ui/hifi/admin-diagnostic-staff-continuity.md:47` can inherit the control text color. On the primary button this is near the page background in both themes, so the focus indicator may disappear at the exact action where keyboard users need orientation. Replace it with an explicit high-contrast existing-palette outline, for example neutral-900 on light and neutral-0 on dark, with the existing 2px offset. Keep the same rule on native controls and the language selector. This is a small call-site token correction, not a new theme or component.

The existing language selector is still `min-h-10` in `apps/admin/src/lib/i18n.tsx:24`; the hi-fi correctly records raising it to 44px. Treat that as a production acceptance check, not a new design scope item.

## Scores and readiness

Written-design judgment: usability 8/10; discoverability and error tolerance 8/10; microinteraction quality 8/10. The scores meet the design-gate threshold after the listed severity-2 focus correction. No broad dashboard or prototype-B work is required. The candidate is ready for production implementation dispatch once the focus rule is carried into the implementation task. Final acceptance still needs rendered desktop/tablet light/dark proof, actual 44px and contrast measurement, keyboard and screen-reader checks, all-locale expansion review, meaningful component/action tests, and the specified protected multi-actor and request-race verification.

