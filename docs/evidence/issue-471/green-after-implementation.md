# Issue 471 green run

Same command as the [red run](red-before-implementation.md), on the commit that adds the shells and the scroll reset (7968e87), and again after the import-order lint fix (42a03ac):

```sh
pnpm --filter @auto-tm/mobile test \
  test/native-shells.spec.tsx \
  test/native-navigation-theme.spec.ts \
  src/listings/search/SearchParametersForm.spec.tsx \
  src/listings/components/PhotoViewer.spec.tsx
```

Result: 4 files passed, 33 tests passed (red: 3 failed, 26 passed, 2 files failed to load).

The full mobile suite on 42a03ac: 167 files, 1293 tests passed, with the seven specs that carried their own `@react-navigation/native` mock and the five that carried their own checkbox mock now using the shared shells. `useOtpAuthNavigation.spec.tsx` keeps its own mock: it records `usePreventRemove` arguments, which the stub does not provide.

## Each new assertion fails without its fix

- Scroll reset: the red run is the proof. At bc31bc7 the reset emptied the Node-required array, and the viewer spec saw 18 leftover requests.
- Checkbox press mapping: with the shell calling `onCheckedChange(checked)` instead of `onCheckedChange(!checked)`, `native-shells.spec.tsx` "reports the value a press toggles to" failed with `expected last "spy" call to have been called with [ true ]`. Restored afterwards.
- Checkbox disabled: with `disabled` no longer passed to the Pressable, "does not report a press when it is disabled" failed with `expected "spy" to not be called at all, but actually been called 1 times`. Restored afterwards.
- Checked state on the box: the red run (`expected … a length of 2 but got 1`).

## Fix round: caller's `onPress` on the checkbox shell

`CheckboxShell` now keeps `onPress` in its props and, as `@rn-primitives/checkbox@1.4.0` does (`dist/checkbox.mjs:38-45`), returns early when `disabled`, otherwise calls `onCheckedChange(!checked)` and then the caller's `onPress`. Red run: [red-before-implementation.md](red-before-implementation.md#fix-round-callers-onpress-dropped-by-the-checkbox-shell) (`4b8fa33`, 1 failed, 4 passed).

```sh
pnpm --filter @auto-tm/mobile test test/native-shells.spec.tsx
```

Result: 1 file, 5 tests passed (red: 1 failed, 4 passed). The four-file command above: 4 files, 35 tests passed. The full mobile suite: 167 files, 1295 tests passed. `pnpm --filter @auto-tm/mobile typecheck` and `lint` pass.

The same round restores the space in `vi.mock("@rn-primitives/separator", async` and corrects the navigation-stub paragraph in `docs/agents/mobile-testing.md`.
