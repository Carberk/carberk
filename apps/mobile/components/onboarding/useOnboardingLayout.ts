import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The content column stops growing here on tablets and in landscape. */
export const ONBOARDING_MAX_WIDTH = 480;
/**
 * The content column's max-width class. NativeWind compiles class literals at
 * build time, so this stays one static string; keep its value in step with
 * ONBOARDING_MAX_WIDTH above.
 */
export const ONBOARDING_MAX_WIDTH_CLASS = "max-w-[480px]";
/** Below this usable height the picture gives its room to the words. */
const COMPACT_HEIGHT = 520;
/** From this system font scale the picture gives its room to the words. */
const COMPACT_FONT_SCALE = 1.3;

export function useOnboardingLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const usableHeight = height - insets.top - insets.bottom;

  return {
    compact: fontScale >= COMPACT_FONT_SCALE || usableHeight < COMPACT_HEIGHT,
    columnWidth: Math.min(width - insets.left - insets.right, ONBOARDING_MAX_WIDTH),
  };
}
