# Search #486 release reconciliation (2026-10-20)

Bounded research for #897/#904 acceptance-matrix rows M9/U6 (`87ed0c1456013396019078aad58a53262c219646`). Read-only toward GitHub, source, tests and PR557. No build, device, staging or CI was run. This record establishes source presence and test assertions at the pins below. It does not prove native, hosted or release behavior.

## Pins

| Ref | SHA | Observed state |
|---|---|---|
| Candidate (#904 `agent/spec-897-campaign` head) | `93f158c367240e3864b924ba36fec49eb3aea7b8` | open; this record's base |
| `origin/main` | `9fde309c3da17f2661fe9c266504e6e56a1b97c9` | unchanged from parent observation |
| PR557 head `claude/project-thread-vip05r` | `7698dd386f1b044d6ba24f5c4c633cde9563bd52` | **CLOSED** unmerged 2026-10-18T17:58Z, still draft; not an ancestor of the candidate |
| PR557 merge-base with candidate | `70aaa48fc1492865ce85daef66d1ded87148718b` | diff base for the old-branch comparison |
| PR549 merge (stale-count fix) | `bd62c0305a3ffa1e605b9d1c6086cd947041fff3` | ancestor of candidate |
| #486 checkpoint / assembly / ICU-order test fix | `264667ce…`, `bc4b8db1…`, `15e17115…` | all ancestors of candidate |
| #760 (`showResultsCount` explicit-form helper) | `eaae23c4` | ancestor of candidate and of main |

Live #486 is OPEN. Its Execution section says the stale fix shipped in #549, the count/plural/City and Retry/cached-count work is assembled in #904 instead of being held only in PR557, and native Hermes RU 0/5/21 plus City visual acceptance remain open. The `assembly-486-*-20261018.md` files that section cites are not in the candidate tree. They are host-local records and are not re-verified here.

Correction to the 2026-10-18 audit rows 95/111: those rows call PR557 a "draft" to keep. Live state is closed, unmerged and still marked draft. Its branch and review history remain on GitHub.

## Old-branch comparison

`git diff 70aaa48f..7698dd38` touches 12 files (+339/−10). Every file exists in the candidate. Every added line in 9 of those files is present verbatim. The rest differ only as listed below, and each difference is a later superset or a later rework:

- `pluralRules.ts`: Russian categories are reordered `one,few,many,other` (#486 `15e17115`). The spec now compares sorted category sets, and exact `select()` checks are unchanged.
- `resources.spec.ts`: the `baseKeys` set comparison is replaced by a per-locale check, `define every plural category the locale's rules use` (lines 20–30).
- `SearchParametersForm{,.count}.spec.tsx`: the City-heading, Retry-press and Show N cases are present under the same names. The count spec adds a seller-type case.
- `useListingCount.spec.tsx`: adds the loading-without-request and cached-count-until-settle cases (lines 176, 193). PR557's cached-count assertion is covered here.
- `CityFilterControl.tsx`: has no City heading `Text`, as PR557 required. #760-era work later reworked it to `GroupedList`/`PickerRow grouped`/`Button`. Region and City accessibility labels are unchanged (`SearchParametersForm.spec.tsx:60-61,84-89`).
- Not in PR557: rendered buttons call `listings/search/showResultsCount.ts` (#760). That helper chooses `_one/_few/_many/_other` explicitly and interpolates without i18next's `count` option, so the rendered label skips `Intl.PluralRules`. The `ensurePluralRules()` shim from PR557 is also installed in `initI18n` (`i18n/index.ts:20`). The candidate therefore has two Hermes-safe paths.

## Criterion table

| #486 criterion | Candidate source/test at `93f158c3` | Disposition |
|---|---|---|
| 1. Invalid→valid regression: no invalid request after the fix, valid count updates | `useListingCount.ts:40-60` gates on `enabled` and on `settled`. Hook tests are at spec 126–210, and rendered year-range cases are at count.spec 47 and 62. The red-before-fix result is historical: #549 and PR557 table row 1. | **Present.** The source fix comes from merged #549. Regression evidence is the historical red/green record, not this read. |
| 2. Current/stale/debounced/count-error/Retry still covered | Hook tests: debounce (89), error+refetch (221), cached-count pending (193). Rendered Retry press (count.spec 86–94). | **Present, equivalent or superset** to PR557's added gaps. |
| 3. Count copy 0/1/many in ru/tk/en | ru `_one/_few/_many/_other` and en/tk keys are at `resources.ts:562-566,1404-1408`. Translator tests cover en 0/1/2/21, ru 0/1/2/4/5/11/12/21/22/111 and tk 0/1/5 (`i18n/showResultsCount.spec.ts`). The Hermes-like startup test covers ru 5/21/3 (`i18n/index.spec.ts`). Rendered tests cover en 0/1/12, ru 1/3/5 and tk 1 (count.spec 110–118). | **Present** in JS tests. Hermes runtime behavior is **native-proof-only**. |
| 4. Region/City clear and accessible, no redundant City heading; native capture | Rendered test `labels Region and City once each, with no separate City heading` (`SearchParametersForm.spec.tsx:84`). | Source/test **present**. Native capture is **missing** and was never produced by PR557 (its body: "native capture missing"). |

Nothing from PR557 is missing from the candidate. Nothing is superseded in a way that drops a requirement: the City layout rework and the #760 helper keep each criterion's intent. No spec change narrowing #486 was found or assumed.

## Remaining release-blocking gaps (not source)

1. Native Hermes release-bundle capture in Russian of Search parameters Show N at counts 0, 5 and 21, as required by M9. Also capture the City field showing Region and City labelled once each. Screenshots or recording must identify the exact release build SHA.
2. Current-candidate hosted GREEN and paired reviews covering these files at the final #904 pin. Historical counts belong to their own pins only.
3. Minor test-only note, which the root may optionally take into #904 and which is not required by criteria text: no rendered test asserts RU 0 or 21 through the #760 helper, and `ModelPicker` Show N has no rendered count test. The native capture covers the release requirement either way.

## Recommended minimal next action

- **Implementation:** none required for #486 in #904. Do not revive, rebase or merge PR557. It is closed and its content is in the candidate.
- **Acceptance:** run M9 as written on the candidate's Hermes release build. RU locale, seed or filter so the count is 0, 5 and 21 (expect `Показать 0 объявлений`, `Показать 5 объявлений`, `Показать 21 объявление`). Make one invalid→valid year edit with no 400 or LogBox and a current count afterwards. Capture the City field with Region/City labels and no extra heading. Attach the screenshots to M9 and #486.
- **Matrix U6:** resolve as "reconciled in source; native M9 proof outstanding". #486 native release proof stays required and is not deferred here.
