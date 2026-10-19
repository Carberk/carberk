import { createRequire, Module } from "node:module";

import * as ReactNative from "react-native";
import { beforeEach, vi } from "vitest";

// vi.mock cannot intercept CommonJS require. Register the test adapter in Node's
// require cache before RNTL loads in this worker. Node's copy is a different
// module instance from the one Vite inlines for `react-native` imports, so the
// two do not share state such as `scrollRequests`.
const requireNative = createRequire(import.meta.url);
const nativePath = requireNative.resolve("react-native");
const nativeModule = new Module(nativePath);
nativeModule.exports = requireNative("./native-host.cjs");
nativeModule.loaded = true;
requireNative.cache[nativePath] = nativeModule;

// The `react-native` import here goes through the Vite alias, like every spec and
// component import, so this is the array specs read. A setup file shares the
// module graph with its test file.
const scrollRequests = (ReactNative as unknown as { scrollRequests: unknown[] }).scrollRequests;

vi.mock("nativewind", () => ({ cssInterop: vi.fn(), remapProps: vi.fn(),
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: vi.fn() }) }));
vi.mock("lucide-react-native", async () => {
  const React = await import("react");
  return new Proxy({}, { has: () => true, get: (_, name) => name === "then" ? undefined
    : name === "__esModule" ? true : () => React.createElement("Icon", { name }) });
});
vi.mock("expo-image", async () => ({ Image: (await import("react-native")).Image }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const routerMock = vi.hoisted(() => ({
  push: vi.fn(), navigate: vi.fn(), replace: vi.fn(), back: vi.fn(),
  canGoBack: vi.fn(() => true), setParams: vi.fn(),
  dismissTo: vi.fn(), dismissAll: vi.fn(), canDismiss: vi.fn(() => true),
}));
const routeParams = vi.hoisted(() => ({} as Record<string, string>));
// Whether the rendered screen is the focused one; a spec sets `focused` to false
// for a screen that another screen covers.
const screenFocus = vi.hoisted(() => ({ focused: true }));
// The options the rendered screen last gave its own `<Stack.Screen />`, such as
// `gestureEnabled`; the native stack that applies them is not rendered here.
const screenOptions = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("expo-router", () => ({
  router: routerMock, useRouter: () => routerMock,
  useLocalSearchParams: () => routeParams,
  useFocusEffect: vi.fn(),
  useIsFocused: () => screenFocus.focused,
  Stack: {
    Screen: ({ options }: { options?: Record<string, unknown> }) => {
      screenOptions.current = options ?? {};
      return null;
    },
  },
}));
beforeEach(() => {
  scrollRequests.length = 0;
  screenFocus.focused = true;
  screenOptions.current = {};
  Object.values(routerMock).forEach((mock) => mock.mockClear());
  Object.keys(routeParams).forEach((key) => Reflect.deleteProperty(routeParams, key));
});

export { routerMock, routeParams, screenFocus, screenOptions };

// The installed Slot distribution retains JSX in .mjs. Its clone behavior is
// enough for this host adapter; native primitive overlays are mocked per spec.
vi.mock("@rn-primitives/slot", async () => {
  const React = await import("react");
  const Slot = ({ children, ...props }: { children: React.ReactElement; [key: string]: unknown }) =>
    React.cloneElement(children, props);
  return { Slot, Text: Slot, View: Slot, Pressable: Slot };
});

vi.mock("@/components/ui/dropdown-menu", async () => {
  const shell = await import("./native-overlays");
  return { DropdownMenu: shell.Menu, DropdownMenuTrigger: shell.MenuTrigger,
    DropdownMenuContent: shell.MenuContent, DropdownMenuItem: shell.MenuItem,
    DropdownMenuSeparator: shell.Container };
});
vi.mock("@/components/ui/sheet", async () => {
  const shell = await import("./native-overlays");
  return { Sheet: shell.Overlay, SheetContent: shell.Container,
    SheetHeader: shell.Container, SheetTitle: shell.TextContainer,
    SheetDescription: shell.TextContainer, SheetFooter: shell.Container, SheetClose: shell.MenuItem };
});
vi.mock("@/components/ui/alert-dialog", async () => {
  const shell = await import("./native-overlays");
  return { AlertDialog: shell.Overlay, AlertDialogContent: shell.Container,
    AlertDialogAction: shell.MenuItem, AlertDialogCancel: shell.MenuItem,
    AlertDialogHeader: shell.Container, AlertDialogTitle: shell.TextContainer,
    AlertDialogDescription: shell.TextContainer, AlertDialogFooter: shell.Container };
});
vi.mock("@/components/ui/checkbox", async () => ({ Checkbox: (await import("./native-overlays")).CheckboxShell }));
// `lib/theme.ts` derives its schemes from React Navigation's themes, and the real
// package needs the native runtime. Only the two themes it reads are stubbed; a
// spec that needs a hook or context from the package mocks it itself and wins.
vi.mock("@react-navigation/native", () => ({
  DefaultTheme: { dark: false, colors: {} },
  DarkTheme: { dark: true, colors: {} },
}));
vi.mock("@rn-primitives/separator", async () => ({ Root: (await import("react-native")).View }));
// The installed avatar distribution imports an extensionless path Node cannot
// resolve. The shell always renders the fallback beside any image.
vi.mock("@rn-primitives/avatar", async () => {
  const native = await import("react-native");
  return { Root: native.View, Image: native.Image, Fallback: native.View };
});

// Expo modules that load `expo-modules-core`, which needs the native runtime.
// A spec that exercises one of them mocks it itself and wins over these stubs.
vi.mock("expo-linking", () => ({ canOpenURL: vi.fn(async () => false), openURL: vi.fn(async () => {}) }));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn(async () => true) }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

// Gesture Handler, Reanimated and Worklets need a native runtime. These
// adapters keep the component tree, so a spec can render a screen that holds a
// zoomable image; they do not run gestures, shared values or animations.
// Pinch, pan and double-tap are proven on a device.
vi.mock("react-native-gesture-handler", async () => {
  const { View } = await import("react-native");
  const builder = (): unknown =>
    new Proxy(() => undefined, { get: () => builder, apply: () => builder() });
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: new Proxy({}, { get: () => builder }),
  };
});
vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  // An animated component is its plain host here: `createAnimatedComponent(Pressable)`
  // stays a Pressable a spec can press, and nothing animates.
  const createAnimatedComponent = <T,>(component: T) => component;
  // Entering and exiting layout animations, chainable like `FadeInUp.duration(200).delay(40)`.
  const layoutAnimation = (): unknown => {
    const animation: unknown = new Proxy({}, { get: () => () => animation });
    return animation;
  };
  return {
    default: { View, createAnimatedComponent },
    createAnimatedComponent,
    useSharedValue: <T,>(value: T) => ({ value }),
    useDerivedValue: <T,>(derive: () => T) => ({ value: derive() }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useAnimatedScrollHandler: () => () => undefined,
    useReducedMotion: () => false,
    withTiming: <T,>(value: T) => value,
    withSpring: <T,>(value: T) => value,
    withDelay: <T,>(_delay: number, value: T) => value,
    withSequence: <T,>(...values: T[]) => values[values.length - 1],
    withRepeat: <T,>(value: T) => value,
    cancelAnimation: () => undefined,
    interpolate: (value: number) => value,
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[0],
    Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
    ReduceMotion: { System: "system", Always: "always", Never: "never" },
    Easing: new Proxy({}, { get: () => () => (value: number) => value }),
    ...Object.fromEntries(
      ["FadeIn", "FadeOut", "FadeInUp", "FadeOutUp", "FadeInDown", "FadeOutDown",
        "SlideInDown", "SlideOutDown", "ZoomIn", "ZoomOut", "LinearTransition"]
        .map((name) => [name, layoutAnimation()]),
    ),
  };
});
// The app's motion modules are the only callers of the newer Reanimated APIs.
// They are replaced whole, so a spec that brings its own narrow Reanimated
// stub (a sheet or a results screen) still renders buttons and cards. The
// stand-ins keep every prop, role and handler and run no animation.
vi.mock("@/lib/motion", async () => {
  const tokens = await import("@auto-tm/ui/tokens");
  return {
    duration: tokens.mobileDuration,
    pressScale: tokens.mobilePressScale,
    glassOpacity: tokens.mobileGlassOpacity,
    spring: tokens.mobileSpring,
    easing: {},
    timing: (token: keyof typeof tokens.mobileDuration) => ({ duration: tokens.mobileDuration[token] }),
    useReduceMotion: () => false,
    useReduceTransparency: () => false,
  };
});
vi.mock("@/components/ui/motion", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  const Plain = ({ children, className, style, testID }: {
    children?: React.ReactNode; className?: string; style?: unknown; testID?: string;
  }) => React.createElement(View, { className, style, testID } as never, children);
  return { Enter: Plain, Pop: Plain, Pulse: Plain, SlideIndicator: Plain };
});
// expo-glass-effect ships JSX in its build output, which Node cannot load, and
// draws through a native view. Off iOS 26 it is a plain View; that is what a
// spec renders.
vi.mock("expo-glass-effect", async () => {
  const { View } = await import("react-native");
  return {
    GlassView: View,
    GlassContainer: View,
    isLiquidGlassAvailable: () => false,
    isGlassEffectAPIAvailable: () => false,
  };
});
// The portal package ships JSX in its `.mjs`, which Node cannot load. Portal
// content renders where it is declared, so a toast or sheet stays queryable.
vi.mock("@rn-primitives/portal", () => ({
  Portal: ({ children }: { children: unknown }) => children,
  PortalHost: () => null,
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
// react-native-svg draws through native views. The stub keeps each element and
// its props as a host node (`Svg`, `Path`, `Circle`), so a spec can read the
// geometry and colours a component supplied. Nothing is drawn.
vi.mock("react-native-svg", async () => {
  const React = await import("react");
  const host = (name: string) =>
    ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
      React.createElement(name, props, children as never);
  return { default: host("Svg"), Svg: host("Svg"), Path: host("Path"), Circle: host("Circle") };
});
