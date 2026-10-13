# Mobile component tests

Use `renderMobile` from `apps/mobile/test/render.tsx` for component behavior in
Vitest 5. It renders React through React Native Testing Library (RNTL) 14 and
`test-renderer`, with test-only native hosts. `test-renderer`'s 1.x line follows
the React minor: `~1.2.0` matches React 19.2 (react-reconciler 0.33); move it with
React. Existing happy-dom hook tests keep their file-level environment directive
and DOM Testing Library imports.
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

it("saves on press", async () => {
  const onSave = vi.fn();
  const screen = await renderMobile(
    <Button accessibilityLabel="Save" onPress={onSave}><Text>Save</Text></Button>,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledOnce();
  expect(screen.getByText("Save")).toBeTruthy();
});
```

The helper creates a fresh i18next instance with bundled translations, English
by default, and a fresh QueryClient with retries disabled. Pass
`{ locale: "ru" }` or `{ locale: "tk" }` to test localized output. Its wrapper
survives `screen.rerender`. The result also exposes `i18n` and `queryClient`.
Unmounts and cache cleanup run after each test.

`renderMobile`, `fireEvent`, `act`, `rerender` and `unmount` are async in RNTL 14;
await each. `render` settles every pending update before it returns, so a state
that only exists between mount and the first data (a loading flash) is gone by
the first assertion; hold such a state with a promise the spec controls, or
observe renders with a `Profiler` mounted through `rerender`
(`test/routes/listings-edit-sections.spec.tsx`). An awaited `fireEvent` also
waits for the promise its handler returns. When a press must leave its handler
running, such as two quick taps or a publish the spec finishes later, fire it
inside `act` without awaiting it: `await act(async () => { void fireEvent.press(button); })`
(`test/routes/sell-check.spec.tsx`).

Use `getByRole`, `getByLabelText`, `getByText`, `getByDisplayValue` and their
`queryBy`/`findBy` variants. For radios, query both options with `checked: true`
or `checked: false`. Use `fireEvent.press` for actions and `fireEvent.changeText`
for inputs. Await async work with `act` or a `findBy` query. Query visible outcomes
and callbacks instead of reading component source. Style props can test a
component's supplied dimensions, but cannot prove native layout. RNTL's matchers,
such as `toHaveTextContent`, are typed for Vitest by `test/rntl-matchers.d.ts`.

RNTL 14 removed the `UNSAFE_*ByType` and `UNSAFE_*ByProps` queries, and
`test-renderer` keeps only host elements. When no role, label or text identifies
an element, `queryAllHosts`, `getAllHosts`, `queryHost` and `getHost` from
`test/render.tsx` find host elements below a root (usually `screen.container`) by
the native name the adapter renders (`Image`, `Modal`, `RCTScrollView`, `Icon`,
`View`) and optional props. A host instance offers `type`, `props`, `parent`,
`children` and `queryAll(predicate)`; `findAll`, `findByType` and composite
components are gone. `within(element)` searches only below the element, not the
element itself.

`routerMock` records `push`, `navigate`, `replace`, `back` and `setParams` calls.
Set `routeParams.id` and other string parameters before rendering a screen.
Router calls and route parameters reset before each test. `canGoBack` defaults
to true; reset any changed return implementation in your spec. `useIsFocused`
returns `screenFocus.focused`, true before each test; set it to false and
rerender for a screen that another screen covers. Data, auth and
native services still need explicit fixtures or MSW handlers. Render the actual
screen and feature components and mock the external service. For a new spec,
[Coding standards](coding-standards.md#tests) prefer MSW with the real API
hooks over a stubbed hook; a new test in an existing spec follows that spec. See `listingDetail.spec.tsx` for ownership, contact, retry,
similar navigation and inspection behavior.

## What the adapter does

`vitest.config.mts` aliases the exact `react-native` import to
`test/native-host.cjs`. The setup registers the same adapter in this worker's
Node require cache because RNTL's CommonJS imports bypass Vitest `vi.mock`.
Nothing changes in node_modules, Metro, Babel or the application runtime.

The adapter renders native-named host nodes. It keeps children, event handlers,
accessibility props, disabled input behavior and Pressable's disabled responder
decision. It uses a fixed 390 by 844 window. FlatList renders all supplied items with its header and empty components
into an `RCTScrollView` host that keeps `data` and the list's other props;
Modal renders children only when visible, on a `Modal` host that keeps `visible`.
A ref to a `View`, `Text`, `TextInput`, `Image`, `ScrollView` or other adapter host
receives React Native's imperative methods (`focus`, `blur`, `clear`, `scrollTo`,
`scrollToEnd`, `measure` and so on) as no-ops, plus the host's `type` and latest
`props`; nothing focuses or scrolls. `RefreshControl` is an inert host
node: its `refreshing` and `onRefresh` stay props and nothing calls `onRefresh`,
so a spec cannot simulate a pull and must call the handler itself. This is an intentionally small
project adapter, not the upstream Jest React Native preset. Add an explicit
adapter or spec-local mock when a component uses an unsupported native API.

`test/native-setup.ts` also stubs, for every spec, `expo-linking`,
`expo-secure-store`, `expo-splash-screen`, Gesture Handler, Reanimated, Worklets, `react-native-svg`, the Checkbox and
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
  `within(row)` finds only the box, so match the row itself by name. See
  `test/native-shells.spec.tsx` and the Model picker test in
  `SearchParametersForm.spec.tsx`.
- **Navigation themes.** `@react-navigation/native` is stubbed to `DefaultTheme`
  and `DarkTheme` with only `dark` and empty `colors`; other theme fields such as
  `fonts` are undefined. That is enough for a spec to import `@/lib/theme`
  unmocked. Reading any other export (`usePreventRemove`, `NavigationContext`,
  `CommonActions`) throws vitest's `No "<name>" export is defined on the mock`
  error. A spec that needs one mocks the package itself and replaces the whole
  stub, as `useOtpAuthNavigation.spec.tsx` does.
- **Reanimated.** The stub provides only `default.View`, `useSharedValue`,
  `useAnimatedStyle`, `withTiming`, `withSpring` and the `FadeIn`/`FadeOut`
  (plus `Up` and `Down`) layout animations, whose `.duration()` returns the same
  object. No gesture, shared-value update or animation runs, so a component that
  uses another animation or `Animated.Text` needs the stub extended.
  `Animated.ScrollView` is the host scroll view; its ref records `scrollTo`
  calls in `scrollRequests` with `method: "scrollTo"`, as the onboarding pager
  spec reads them (`test/routes/onboarding-flow.spec.tsx`).
- **SVG.** `react-native-svg` exports only `default`, `Svg`, `Path` and
  `Circle`. Each renders a host node of that name with the props it was given,
  so a spec can read geometry and colours; nothing is drawn. Any other export
  fails in every spec until the stub in `test/native-setup.ts` gains it.
- **Portal.** `@rn-primitives/portal` cannot load in Node, so `Portal` renders its
  children where it is declared and `PortalHost` renders nothing. A spec can wrap
  a screen in the real `ToastProvider` and query its toasts, as
  `test/screens/favorites.spec.tsx` does.
- **Announcements.** `AccessibilityInfo.announceForAccessibility` records each
  message in the adapter's `AccessibilityInfo.announcements` array and speaks
  nothing; a spec empties the array before asserting, as `toast.spec.tsx` does.

`BackHandler` is a recording stub: `addEventListener` registers the handler and
returns `{ remove }`, and the adapter's `pressHardwareBack()` calls them newest
first until one returns true, like Android's back button. A spec reads it from the
aliased module, as it does `scrollRequests`, and wraps the press in `act`
(`test/routes/sell-close.spec.tsx`). Listeners from a spec's unmounted screens are
removed by their own cleanup. Nothing exits the app.

A `FlatList` ref records `scrollToIndex` and `scrollToOffset` calls into the
`scrollRequests` export of `react-native`. Specs and `native-setup.ts` import
`react-native` through the Vite alias, which Vite inlines as one module instance,
and `native-setup.ts` empties that array before each test. The copy registered in
Node's require cache for RNTL is a separate instance with its own array; resetting
that one does nothing for specs. `PhotoViewer.spec.tsx` proves the reset with an
empty `scrollRequests` at the start of a second scroll test.

Real app Button, Text, Input, Icon and feature components execute. NativeWind
`className` passes through and `cssInterop`/`remapProps` are no-ops. Lucide icons,
Expo Image and safe-area values use native test substitutes; each Lucide icon is
an `Icon` host with its `name` and the props it was given, such as `className`. Slot clones its
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
these specs use real timers and `fireEvent`. A spec that must pass a long wait
fakes only `setTimeout` and `clearTimeout` with Vitest and advances them inside
`act`, as the close-wait cases in `test/routes/sell-close.spec.tsx` do.

Run [mobile/Expo checks](mobile-expo.md) for dependency and bundle evidence.
A development build and captured device evidence remain necessary for visible
or native runtime changes. No product UI changed when adding this test adapter.

## Documentation consulted

For the RNTL 14 and Vitest 5 move (#854): the
[RNTL v14 migration guide](https://oss.callstack.com/react-native-testing-library/docs/start/migration-v14)
verified async `render`/`fireEvent`/`act`, the removed `UNSAFE_*` queries,
`createNodeMock` and `concurrentRoot`, and that the `test-renderer` line follows
the React minor; the installed RNTL 14.1.0 and `test-renderer` 1.2.0 sources
verified the host names, `within` and `fireEvent`'s returned handler promise.
The Vitest [v3](https://v3.vitest.dev/guide/migration),
[v4](https://v4.vitest.dev/guide/migration) and
[v5](https://vitest.dev/guide/migration) migration guides and the
[Vite 8 guide](https://vite.dev/guide/migration) supplied the config changes.
Earlier, Context7 results for `/callstack/react-native-testing-library/v13.3.3`
verified render wrappers, query/event APIs and cleanup, and `/vitest-dev/vitest`
supplied setupFiles, aliases and mock guidance. `/tanstack/query` supplied fresh clients, retry/GC configuration and clear.
`/websites/react_i18next` supplied real provider testing.
`/nativewind/nativewind/nativewind_4.2.0` described class interop and build-time
CSS processing. `/expo/expo/__branch__sdk-55` supplied router testing and
`renderRouter`. NativeWind's versioned result includes main-branch snippets, so
it was used only to establish the boundary, not to change app styling APIs.

Remaining source-search tests are inventoried in the #457 PR. Migrate feature
specs by area using this helper, preserving behavioral coverage. Keep structural
checks such as the prohibition on specs under `app` and build-configuration
checks where reading files is the behavior being verified.
