/* global require, module */
// Test-only host components. Both Vite imports and RNTL's CommonJS require use
// this adapter, so no React Native native bridge or Flow source runs in Node.
// CommonJS is required here because RNTL loads React Native with require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require("react");
const host = (name, defaults = {}) => {
  const Component = React.forwardRef(({ children, ...props }, ref) =>
    React.createElement(name, { ...defaults, ...props, ref }, children));
  Component.displayName = name;
  return Component;
};
const View = host("View");
const Text = host("Text");
const Pressable = React.forwardRef(({ children, disabled, accessibilityState, ...props }, ref) =>
  React.createElement("View", {
    accessible: true, ...props, ref, disabled,
    onStartShouldSetResponder: () => !disabled,
    accessibilityState: { ...accessibilityState, disabled: disabled ?? accessibilityState?.disabled },
  }, typeof children === "function" ? children({ pressed: false }) : children));
Pressable.displayName = "Pressable";
const scrollRequests = [];
const slot = (component) => component == null || React.isValidElement(component)
  ? component ?? null : React.createElement(component);
// Header renders first, the empty component only when there is no data, and the
// footer last, like the native list. A component or an element is accepted for each.
const FlatList = React.forwardRef(({
  data = [], renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, ListFooterComponent,
  ...props
}, ref) => {
  React.useImperativeHandle(ref, () => ({
    scrollToIndex: (args) => scrollRequests.push({ method: "scrollToIndex", ...args }),
    scrollToOffset: (args) => scrollRequests.push({ method: "scrollToOffset", ...args }),
  }));
  return React.createElement("RCTScrollView", props, slot(ListHeaderComponent),
    data.map((item, index) => React.createElement(React.Fragment,
      { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index }))),
    data.length ? null : slot(ListEmptyComponent), slot(ListFooterComponent));
});
FlatList.displayName = "FlatList";
const flatten = (style) => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style || {};
module.exports = {
  View, Text, Pressable, TextInput: host("TextInput"), Image: host("Image"),
  ScrollView: host("RCTScrollView"), ActivityIndicator: host("ActivityIndicator"),
  Switch: host("RCTSwitch", { accessible: true }),
  KeyboardAvoidingView: host("KeyboardAvoidingView"),
  Modal: ({ visible = true, children, ...props }) => visible
    ? React.createElement("Modal", props, children) : null,
  RefreshControl: host("RefreshControl"),
  FlatList,
  // Scroll requests the list received, newest last. Specs read this to prove a
  // component moved a list; the adapter never scrolls anything itself.
  scrollRequests,
  Platform: { OS: "ios", select: (options) => options.ios ?? options.native ?? options.default },
  StyleSheet: { create: (styles) => styles, flatten, hairlineWidth: 1,
    absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  Share: { share: async () => ({ action: "sharedAction" }) },
  // Announcements a spec can read; nothing is spoken.
  AccessibilityInfo: { announcements: [], announceForAccessibility(message) { this.announcements.push(message); } },
  useColorScheme: () => "light",
};
