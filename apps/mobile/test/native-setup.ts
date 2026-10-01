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
vi.mock("expo-router", () => ({
  router: routerMock, useRouter: () => routerMock,
  useLocalSearchParams: () => routeParams,
  useFocusEffect: vi.fn(),
}));
beforeEach(() => {
  scrollRequests.length = 0;
  Object.values(routerMock).forEach((mock) => mock.mockClear());
  Object.keys(routeParams).forEach((key) => Reflect.deleteProperty(routeParams, key));
});

export { routerMock, routeParams };

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

// Expo modules that load `expo-modules-core`, which needs the native runtime.
// A spec that exercises one of them mocks it itself and wins over these stubs.
vi.mock("expo-linking", () => ({ canOpenURL: vi.fn(async () => false), openURL: vi.fn(async () => {}) }));
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
  return {
    default: { View },
    useSharedValue: <T,>(value: T) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: <T,>(value: T) => value,
    withSpring: <T,>(value: T) => value,
  };
});
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
