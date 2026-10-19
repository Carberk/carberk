import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The height a tab screen keeps clear for `AutoTmTabBar`, above the bottom
 * safe-area inset. The bar floats over the content: it is
 * `TAB_BAR_VISUAL_HEIGHT` tall and sits `tabBarBottomOffset` above the screen
 * edge, and its top never rises past `TAB_BAR_HEIGHT + inset`.
 */
export const TAB_BAR_HEIGHT = 64;

/** The floating bar itself. */
export const TAB_BAR_VISUAL_HEIGHT = 60;

/** The gap between the bar and the screen's side edges. */
export const TAB_BAR_SIDE_MARGIN = 12;

/**
 * How far the bar floats above the screen edge. With a home indicator or
 * Android gesture bar it sits partly inside the inset, as system bars do;
 * with no inset (three-button navigation drawn outside the app) it keeps a
 * small margin so it still reads as floating.
 */
export function tabBarBottomOffset(bottomInset: number): number {
  return Math.max(bottomInset - 14, 4);
}

/**
 * The space a tab screen leaves at its bottom so nothing ends up under the
 * floating bar: pad a screen's root with it, or end a scrolling list with a
 * spacer of this height so the list runs under the bar and its last row can
 * still be scrolled clear.
 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom;
}
