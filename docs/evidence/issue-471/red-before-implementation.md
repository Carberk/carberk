# Issue 471 red run, before the shells and the scroll reset

Base `origin/main` at bc31bc7. Only the new specs are in the tree: `native-setup.ts`, `native-host.cjs` and the app source are unchanged.

Command, from the repository root:

```sh
pnpm --filter @auto-tm/mobile test \
  test/native-shells.spec.tsx \
  test/native-navigation-theme.spec.ts \
  src/listings/search/SearchParametersForm.spec.tsx \
  src/listings/components/PhotoViewer.spec.tsx
```

Result: 4 files failed, 3 tests failed, 26 passed (29 tests). Two files fail at load, so their tests are not counted.

## Behaviour failures

| Criterion | Test | Failure | Why it is the unmet criterion |
|---|---|---|---|
| Rendered proof on the Search parameters form | `SearchParametersForm.spec.tsx` "changes the model selection when a model checkbox is pressed, box and all" | `expected [ ReactTestInstance{ …(1) } ] to have a length of 2 but got 1` | The form's only real checkbox is the model row in the Model picker (the Condition control is a three-segment button group, not a checkbox). Inside each row the `Checkbox` box matches no `checkbox` role, because the spec-local stand-in (`Checkbox: Pressable`) ignores `checked`. `within()` counts the row itself, so 2 means row plus box. |
| Scroll isolation | `PhotoViewer.spec.tsx` "Photo viewer scroll requests" "starts the next test with no scroll requests left by the one before" | `expected [ …(18) ] to have a length of +0 but got 18` | The reset clears the Node-required `native-host.cjs` array, not the one the spec reads, so 18 requests from the earlier tests are still there. |
| Scroll isolation | same block, "asks the pager to scroll when a thumbnail is tapped" | `expected [ …(3) ] to deeply equal [ { method: 'scrollToIndex', …(2) } ]` (the other two are index 0 and index 4 from earlier tests) | Same root cause. This test was written to see only its own request. |

The model-row press itself already changed the selection on the base, because the row, not the box, carries the `onPress`. The test therefore fails on the box state, not on the press.

## Module-load failures (the shells do not exist yet)

`test/native-navigation-theme.spec.ts`: `SyntaxError: Unexpected token 'typeof'`, from the real `@react-navigation/native` that `lib/theme.ts` imports.

`test/native-shells.spec.tsx`: `Error: Cannot find module '…/@rn-primitives/checkbox/dist/checkbox' imported from …/dist/index.mjs`, from the real checkbox primitive.

These two are load errors, which is a setup-type failure, and they fail for the reason the issue exists: no shared shell registers a stand-in, so each spec had to mock the module itself. They do not show how the old stand-in behaves, so the same contract was also run against the stand-in from PR 468 (a temporary spec, not committed, with `vi.mock("@/components/ui/checkbox", async () => ({ Checkbox: (await import("react-native")).Pressable }))`):

```
FAIL  Checkbox stand-in from #468 > reports the value a press toggles to through onCheckedChange
AssertionError: expected "spy" to be called with arguments: [ true ]
Number of calls: 0

FAIL  Checkbox stand-in from #468 > exposes checked as the checkbox accessibility state
Error: Unable to find an element with role: checkbox, name: Ticked, checked state: true

Test Files  1 failed (1)
     Tests  2 failed (2)
```

That is the issue's finding 1: a spec that presses a checkbox through the stand-in gets no `onCheckedChange` call and no checked state.
