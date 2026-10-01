# Mobile component tests

Use `renderMobile` from `apps/mobile/test/render.tsx` for component behavior in
Vitest. It renders React through React Native Testing Library and
`react-test-renderer`, with test-only native hosts. Existing happy-dom hook tests
keep their file-level environment directive and DOM Testing Library imports.
Tests belong beside `src` components or in `test/screens` and `test/routes`, never
inside Expo Router's `app` directory.

Build contracts in a fresh checkout, then run a focused spec:

```bash
pnpm --filter @auto-tm/contracts build
pnpm --filter @auto-tm/mobile test src/listings/wizard/Step4Specs.spec.tsx
```

## Write a behavior test

```tsx
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { renderMobile, fireEvent } from "@/test/render";

it("saves on press", () => {
  const onSave = vi.fn();
  const screen = renderMobile(
    <Button accessibilityLabel="Save" onPress={onSave}><Text>Save</Text></Button>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledOnce();
  expect(screen.getByText("Save")).toBeTruthy();
});
```

The helper creates a fresh i18next instance with bundled translations, English
by default, and a fresh QueryClient with retries disabled. Pass
`{ locale: "ru" }` or `{ locale: "tk" }` to test localized output. Its wrapper
survives `screen.rerender`. The result also exposes `i18n` and `queryClient`.
Unmounts and cache cleanup run after each test.

Use `getByRole`, `getByLabelText`, `getByText`, `getByDisplayValue` and their
`queryBy`/`findBy` variants. For radios, query both options with `checked: true`
or `checked: false`. Use `fireEvent.press` for actions and `fireEvent.changeText`
for inputs. Await async work with `act` or a `findBy` query. Query visible outcomes
and callbacks instead of reading component source. Style props can test a
component's supplied dimensions, but cannot prove native layout.

`routerMock` records `push`, `navigate`, `replace`, `back` and `setParams` calls.
Set `routeParams.id` and other string parameters before rendering a screen.
Router calls and route parameters reset before each test. `canGoBack` defaults
to true; reset any changed return implementation in your spec. Data, auth and
native services still need explicit fixtures or MSW handlers. Prefer mocking
the external service or hook boundary while rendering the actual screen and
feature components. See `listingDetail.spec.tsx` for ownership, contact, retry,
similar navigation and inspection behavior.

## What the adapter does

`vitest.config.ts` aliases the exact `react-native` import to
`test/native-host.cjs`. The setup registers the same adapter in this worker's
Node require cache because RNTL's CommonJS imports bypass Vitest `vi.mock`.
Nothing changes in node_modules, Metro, Babel or the application runtime.

The adapter renders native-named host nodes. It keeps children, event handlers,
accessibility props, disabled input behavior and Pressable's disabled responder
decision. It uses a fixed 390 by 844 window. FlatList renders all supplied items with its header and empty components;
Modal renders children only when visible. `RefreshControl` is an inert host
node: its `refreshing` and `onRefresh` stay props and nothing calls `onRefresh`,
so a spec cannot simulate a pull and must call the handler itself. This is an intentionally small
project adapter, not the upstream Jest React Native preset. Add an explicit
adapter or spec-local mock when a component uses an unsupported native API.

`test/native-setup.ts` also stubs, for every spec, `expo-linking`,
`expo-secure-store`, Gesture Handler, Reanimated, Worklets, the Checkbox and
React Navigation's themes; a spec-local `vi.mock` of the same module wins. Do
not copy these stubs into a spec.

- **Checkbox.** `@/components/ui/checkbox` resolves to the `CheckboxShell` in
  `test/native-overlays.tsx`, because the real `@rn-primitives/checkbox` cannot
  load in Node. The shell is a Pressable with the `checkbox` role. It maps `checked`
  to `accessibilityState.checked` and a press to `onCheckedChange(!checked)`, then
  calls the caller's `onPress`, as the primitive's Trigger does. A press when
  `disabled` calls neither. It draws no box. Query it with
  `getByRole("checkbox", { checked })` and press it with `fireEvent.press`. Where a
  component wraps it in a row that carries its own role and `onPress` (the Model
  picker's `ModelCheckRow`), the row and the shell both match the role, and
  `within(row)` counts the row itself. See `test/native-shells.spec.tsx` and the
  Model picker test in `SearchParametersForm.spec.tsx`.
- **Navigation themes.** `@react-navigation/native` is stubbed to `DefaultTheme`
  and `DarkTheme` with only `dark` and empty `colors`; other theme fields such as
  `fonts` are undefined. That is enough for a spec to import `@/lib/theme`
  unmocked. Reading any other export (`usePreventRemove`, `NavigationContext`,
  `CommonActions`) throws vitest's `No "<name>" export is defined on the mock`
  error. A spec that needs one mocks the package itself and replaces the whole
  stub, as `useOtpAuthNavigation.spec.tsx` does.
- **Reanimated.** The stub provides only `default.View`, `useSharedValue`,
  `useAnimatedStyle`, `withTiming` and `withSpring`, and no gesture, shared-value
  update or animation runs, so a component that uses `FadeIn` or `Animated.Text`
  needs the stub extended.

A `FlatList` ref records `scrollToIndex` and `scrollToOffset` calls into the
`scrollRequests` export of `react-native`. Specs and `native-setup.ts` import
`react-native` through the Vite alias, which Vite inlines as one module instance,
and `native-setup.ts` empties that array before each test. The copy registered in
Node's require cache for RNTL is a separate instance with its own array; resetting
that one does nothing for specs. `PhotoViewer.spec.tsx` proves the reset with an
empty `scrollRequests` at the start of a second scroll test.

Real app Button, Text, Input, Icon and feature components execute. NativeWind
`className` passes through and `cssInterop`/`remapProps` are no-ops. Lucide icons,
Expo Image and safe-area values use native test substitutes. Slot clones its
child because the installed primitive package retains JSX in its `.mjs` file.
Sheet, dropdown and alert-dialog test shells model open/closed visibility and
callbacks. They do not run portal or animation implementations. The detail spec
also mocks the ReportSheet boundary; it does not verify reporting behavior.

## Limits and evidence

These tests prove React branches, state changes, localized copy, query-provider
execution, callback payloads and navigation intent. The smoke spec exercises
real Query and i18n providers, a real app Button, role/label/text queries and a
router call. Step4's required-answer assertion was also run against the buggy
Step4 from commit `9718fec` before PR #453's fix and failed because the required
copy was absent. The current component passes that same assertion.

The adapter does not prove NativeWind utility resolution, theme colors, measured
layout, image loading, list virtualization, native responder timing, real
camera/filesystem/share services, animations, portals, keyboard behavior,
screen-reader output, or focus effects. `useFocusEffect` is a no-op. Router mocks
do not mount a navigation tree or prove a route exists. Use Expo Router's
`renderRouter` integration setup for navigation-tree behavior when needed.
RNTL's Jest-dependent fake-timer and `userEvent` paths are not covered here;
these specs use real timers and `fireEvent`. React 19 prints the upstream
react-test-renderer deprecation warning; it is retained in test output.

Run [mobile/Expo checks](mobile-expo.md) for dependency and bundle evidence.
A development build and captured device evidence remain necessary for visible
or native runtime changes. No product UI changed when adding this test adapter.

## Documentation consulted

Context7 results for `/callstack/react-native-testing-library/v13.3.3` verified
render wrappers, query/event APIs, cleanup and exact React/renderer peer
matching. `/vitest-dev/vitest` supplied setupFiles, aliases and mock guidance;
the installed Vitest 2.1 configuration was checked by the suite.
`/tanstack/query` supplied fresh clients, retry/GC configuration and clear.
`/websites/react_i18next` supplied real provider testing.
`/nativewind/nativewind/nativewind_4.2.0` described class interop and build-time
CSS processing. `/expo/expo/__branch__sdk-55` supplied router testing and
`renderRouter`. NativeWind's versioned result includes main-branch snippets, so
it was used only to establish the boundary, not to change app styling APIs.

Remaining source-search tests are inventoried in the #457 PR. Migrate feature
specs by area using this helper, preserving behavioral coverage. Keep structural
checks such as the prohibition on specs under `app` and build-configuration
checks where reading files is the behavior being verified.
