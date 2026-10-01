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

The full mobile suite on 42a03ac: 167 files, 1293 tests passed, with the seven specs that carried their own `@react-navigation/native` mock and the four that carried their own checkbox mock using the shared shells.

## Each new assertion fails without its fix

- Scroll reset: the red run is the proof. At bc31bc7 the reset emptied the Node-required array, and the viewer spec saw 18 leftover requests.
- Checkbox press mapping: with the shell calling `onCheckedChange(checked)` instead of `onCheckedChange(!checked)`, `native-shells.spec.tsx` "reports the value a press toggles to" failed with `expected last "spy" call to have been called with [ true ]`. Restored afterwards.
- Checkbox disabled: with `disabled` no longer passed to the Pressable, "does not report a press when it is disabled" failed with `expected "spy" to not be called at all, but actually been called 1 times`. Restored afterwards.
- Checked state on the box: the red run (`expected … a length of 2 but got 1`).
