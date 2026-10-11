import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScrollEdgeFade } from "./ScrollEdgeFade";
import { useTabBarSpace } from "./tabBarHeight";

import { useSystemGlass } from "@/components/ui/glass-surface";
import { cn } from "@/lib/utils";

type TabScreenProps = ViewProps & {
  className?: string;
  /**
   * Lets the content run under the floating tab bar. The screen's scrolling
   * list then ends with `useTabBarSpace()` of padding itself, so its last row
   * can be scrolled clear of the bar, and a state that does not scroll
   * (empty, error, loading) sits in a `TabBarClear`. Without it the screen
   * stops above the bar, which is right for a screen with a button pinned to
   * its bottom; the glass then shows only the page.
   */
  underTabBar?: boolean;
  /**
   * Draws the soft edge above the tab bar, where scrolling content fades
   * into the page. Turn it off on a screen that pins its own bar there
   * (`StickyActionBar` brings its own fade, drawn under the bar).
   *
   * It is left out by itself where the content runs under a tab bar of system
   * glass (`underTabBar` on iOS 26 and later): the fade is the page tone,
   * nearly opaque behind the bar, and glass over it shows only that tone.
   */
  edgeFade?: boolean;
  /**
   * Controls that float over the scrolling content just above the tab bar,
   * such as the Results filter chips. They are drawn above the edge fade.
   */
  overlay?: ReactNode;
};

/**
 * The root of a screen inside the tabs. It keeps the top and side safe areas
 * and the space the floating tab bar needs, on the page surface.
 */
export function TabScreen({
  underTabBar = false,
  edgeFade = true,
  overlay,
  className,
  style,
  children,
  ...props
}: TabScreenProps) {
  const space = useTabBarSpace();
  // The floating Filters chips are glass over the list itself. The tab bar is
  // the same glass, so it must have the list behind it too, not the fade.
  const glassOverContent = useSystemGlass() && underTabBar;
  return (
    <SafeAreaView
      className={cn("flex-1 bg-background", className)}
      edges={["top", "left", "right"]}
      style={[underTabBar ? null : { paddingBottom: space }, style]}
      {...props}
    >
      {children}
      {edgeFade && !glassOverContent ? <ScrollEdgeFade height={space} /> : null}
      {overlay}
    </SafeAreaView>
  );
}

/**
 * Content that does not scroll (an empty, error or loading state) on an
 * `underTabBar` screen: it fills the screen and keeps the tab bar's space
 * below it, so a centred message is centred above the bar, not behind it.
 */
export function TabBarClear({ className, style, children, ...props }: ViewProps & { className?: string }) {
  const space = useTabBarSpace();
  return (
    <View className={cn("flex-1", className)} style={[{ paddingBottom: space }, style]} {...props}>
      {children}
    </View>
  );
}
