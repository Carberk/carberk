# Issue #915 rendered-state checkpoint (fixture render, 2026-10-29)

Scope: rendered states of the existing staff diagnostic continuity journey (capture/correction → exact A/B comparison/issue → B-only handoff consume/recovery). Test sub-agent receipt for #915 within #897 / PR #904. **No production/admin source, backend, schema or contract file was edited.** Source defects below are reported, not fixed.

## Source identity

| Item | SHA |
|---|---|
| Base (worktree HEAD) | `1168eff69cc5f90af7c6745343811876d332ed11` |
| Actual staff source | `5940a977db585443073dca91f02213421ebf3c1a` (from `63174bd809cc176019977d390f1036889195b2b4`) |
| Evidence | the commit that adds this directory (`git log -- docs/evidence/issue-915/rendered-20261029`) |

Files under test: `apps/admin/src/app/diagnostics/{DiagnosticWorkspace,DiagnosticIntake,DiagnosticIdentity,DiagnosticContinuity,ContinuityMaterial,ContinuityValidation}.tsx`, `continuity-copy.ts`, `lib/i18n.tsx`, `app/globals.css`. Design: `docs/prd/ui/hifi/admin-diagnostic-staff-continuity.md` and its final UX review.

## What this is, and is not

Fixture rendering only. The real admin React components and the real Tailwind/`globals.css` pipeline are rendered by a Vite 8 dev server (run from `apps/admin` so Tailwind scans the real sources) with: `next/headers` and `next/navigation` stubbed, `@auto-tm/contracts` aliased to source, and `fetch` faked at the network boundary (the `"use server"` actions call `fetch`). Synthetic data only. Drive: headless Google Chrome 156 over CDP with real key/mouse events. Everything ran under `/tmp/issue915-render`; sources are copied to `fixture/`.

**Not claimed:** server or multi-actor runtime acceptance, native-language copy approval (EN/RU/TK checked for consistency/overflow only), CI, A acceptance, device or staging behavior.

## Method

- Contrast: computed colors are resolved by painting to a 1×1 canvas (8-bit sRGB), composited through all ancestors' backgrounds and opacity, then WCAG 2.x relative luminance. Text needs 4.5 (large 3); control boundaries and focus indicators need 3:1 against the adjacent surface. Disabled controls are exempt and counted separately. Field value/selected-option text is measured separately from text nodes. (`fixture/audit.ts`)
- Focus: real CDP Tab/Shift-Tab/Enter/Space; `:focus-visible`, computed outline and obstruction recorded per stop. Focus-ring contrast was also measured from **rendered pixels** (`focus-rings/`, `measurements/ring.json`) because the browser's `outline: auto` ring differs from its computed colour.
- Targets ≥44 px, page and element overflow, and accessible names are measured in the rendered DOM; AX trees come from the CDP Accessibility domain (`ax/`).
- 200% zoom is emulated by viewport width (1280→640, 768→384) at DPR 1. Tablet = 768, desktop = 1280 (1024/1023 breakpoint pair also run). Dark = `.dark` on `html`.
- Sweep: 464 audited state renders (30 states × EN {light,dark}×{1280,768,640,384}, RU/TK light ×{1280,768,384}, RU/TK dark subset ×{1280,384}, plus 1024/1023). Counts: `measurements/sweep-jobs.csv`, dedup list `measurements/unique-issues.json`, aggregate `measurements/agg.json`.

## Findings (source defects; screenshots/repro preserved, nothing fixed)

| # | Sev | Finding | Evidence | Source anchor |
|---|---|---|---|---|
| D1 | High | **Dark theme: legacy fields have unreadable text.** `bg-white` fields without a foreground override inherit near-white text: field text/selected option 1.04:1 (Actual inspection time, mileage, matching method, manual reference, Select report, Decision reason). | `screenshots/02-intake-dark-1280.png` (white fields, near-invisible values), `04-capture-empty-dark-1280.png`, `screenshots/sweep-extracts/bonly-done__en__dark__1280.png` (Select report / Decision reason); `measurements/unique-issues.json` (`field-text-contrast`) | `DiagnosticIntake.tsx:12`, `DiagnosticWorkspace.tsx` field styles |
| D2 | Medium | **Dark theme: `text-neutral-600` helper paragraphs 2.53:1** (page subtitle, correction/new-inspection notices, no-assessment text), all locales. Light is 7.82:1. | `screenshots/sweep-extracts/intake__en__dark__1280.png` (full-page, subtitle) and `bonly-done__en__dark__1280.png`; `measurements/pairs.json` | `DiagnosticWorkspace.tsx:56,82` |
| D3 | Medium | **Light theme: legacy control boundaries 2.43:1** (`border-neutral-400` on white) for Back to assigned work, Load current version, section tabs, intake fields, Select report, Decision reason, Submit/Record buttons. Continuity controls (`border-text-secondary`) are 7.8:1 (light) / 12.9:1 (dark). Spec line 53 requires ≥3:1 boundaries. | `screenshots/01-intake-light-1280.png`, `sweep-extracts/intake__en__light__1280.png`, `50-bonly-list-light-1280.png`; `measurements/pairs.json`, `unique-issues.json` | `DiagnosticIntake.tsx:12-13`, `DiagnosticWorkspace.tsx:17` |
| D4 | Medium | **Language selector boundary 1.26:1 light / 1.24:1 dark** (default `border` token). Height is 44 px (passes). | `screenshots/01-…`, `02-…` | `lib/i18n.tsx:24` |
| D5 | High | **Light theme: weak focus ring on native `<details>` summary, checkboxes and programmatic (tabindex=-1) headings.** Base style `outline-ring/50` yields `auto 1px #d0d0d0`: 1.55:1 computed; rendered-pixel max 1.54 (summary) / 1.56 (checkbox) vs 3:1 required. Dark passes by pixels (19.8:1; Chrome draws a dual ring) and all button/field/select/textarea rings pass (17.9:1 solid 2 px). Includes the "Physical identifier N" and "Comparison recovery" heading focus targets. | `keyboard/kb-summary-focused__en__light__1280.png`, `focus-rings/{summary,checkbox}__{light,dark}.png`, `keyboard/disclosure__en__light__1280.json`; `measurements/ring.json`, `walkall.json` (42 walks) | `app/globals.css:25` |
| D6 | Medium | **Focus drops to `<body>` after "Continue to complete replacement".** The focused button unmounts when the correction form opens and nothing receives focus (no heading/first-field target). Re-verified by a separate probe. Spec requires focus to move on explicit transitions (line 122). | `keyboard/correction__en__light__1280.json`, `keyboard/kb-correction-after-replacement__en__light__1280.png`, `screenshots/14-correct-prereq-light-1280.png`, `15-correct-form-light-1280.png` | `DiagnosticIdentity.tsx:62-63,123,133` |
| D7 | Low (spec silent) | **B-only: focus is `<body>` after consume with lost reply and after successful "Retry exact unchanged operation"** (activated button unmounts; alerts do announce). "Check operation status" keeps focus correctly. | `keyboard/bonly__*.json`, `keyboard/kb-bonly-lost__*.png`, `screenshots/53-bonly-lost-light-1280.png`, `54-bonly-lost-dark-1280.png` | `DiagnosticContinuity.tsx` (handoff panel) |

Audit-artifact notes: 4 `clipped-overflow` hits are the Manual decision reference `<input>` at 384 px (value scrolls inside the field, no layout overflow) and are not defects. `walkall.json` flags 4 tall-textarea stops as partly out of viewport; not triaged, treat as unverified.

## Verified passes (rendered)

- **Targets/overflow:** 0 target-size failures (all buttons, selects, fields, summaries, checkbox labels ≥44 px) and 0 page/beyond-viewport overflow across all 464 renders, including 384 px and RU/TK expansion. (`sweep-jobs.csv`)
- **Light text contrast:** no text-node failure in light for any state/locale (worst 7.82:1). Dark failures are only D2.
- **Hover/pressed:** secondary 16.28:1, primary 17.18:1 (`keyboard/hover__*.json`). Disabled controls are exempt (248 disabled-exempt text hits, `disabled:opacity-50`).
- **Native fields/labels:** every field has a visible label with `· Required`/optional; accessible names, invalid/required state and described-by error text in `ax/*.txt`.
- **Capture/identity validation:** blank submit focuses the error summary/first invalid field with `aria-invalid`; with a newly appended identifier the summary lists "Physical identifier 2: …" items, the summary link moves focus to the field/fieldset, Add focuses the new "Physical identifier 2" heading then its kind select, and Remove focuses the surviving row heading. (`keyboard/capture__*.json`, screenshots `05`–`09`, `12`–`13`)
- **Exact A/B pair:** both full chains and supporting images expanded; desktop two columns at ≥1024, stacked at 1023/768/640/384 (`20`–`31`).
- **Image failure recovery:** failure → focus "Comparison recovery" with alert and acknowledgements cleared (0/9); Retry while still failing keeps focus on the heading; Retry after recovery announces status and focuses the image status; ack remains 0/9 and no Issue button until full re-review; Reload comparison focuses the fresh pair heading; Back focuses the candidates heading and removes the pair (`keyboard/pairImage__*.json`, screenshots `32`–`37`; EN light/dark, RU 1280, TK 384, 768).
- **B-only:** list/review/lost/none/done states render (`50`–`59`); across EN/RU/TK the A-leak check found no A-side data and no forbidden requests; only the two intended writes occurred (`measurements/bonlyleak.json`).
- **Disclosure:** Enter and Space toggle native details; summary targets 44 px.
- **Copy/layout consistency:** EN/RU/TK show no clipped or overflowing labels at 384 px.

## Limits of this checkpoint

System/Inter font instead of Geist; `AdminNav` omitted; zoom emulated by viewport width; file input uses a script-set `File` (not the native chooser); the T3 preview snapshot/screenshot tools were unavailable here (tabs reported `visible:false`, snapshot timeouts), so local headless Chrome via CDP was used; the preview tab was only used to attempt this and is closed. RU/TK dark were sampled, not exhaustive.

## Layout

`screenshots/` (55 curated states, numbering in `jobs.json`) · `keyboard/` (suite JSON + focus screenshots) · `ax/` · `focus-rings/` · `measurements/` · `fixture/` (render harness; `vite.config.mts` paths point at this worktree and `/tmp/issue915-render`) · `SHA256SUMS`.

## Cleanup receipt

Vite (:5917), the CDP daemon (:9444) and headless Chrome (:9333) stopped and ports verified free; T3 preview tab closed; no device, staging, provider/livecall or EAS activity; no other agent started. Scratch remains only in `/tmp/issue915-render` (outside the repo). A filtered offline `node_modules` install exists in the worktree (gitignored).
