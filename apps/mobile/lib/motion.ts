import {
  mobileDuration,
  mobileGlassOpacity,
  mobilePressScale,
  mobileSpring,
} from "@auto-tm/ui/tokens";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import {
  configureReanimatedLogger,
  Easing,
  ReanimatedLogLevel,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";

// NativeWind runs `transition-*` and `animate-*` classes through Reanimated and
// reads its shared values while rendering. Reanimated's strict mode reports
// every such read in development, which buries real warnings; the transitions
// themselves are correct. Strict mode is a development-only check.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

/**
 * Motion for the mobile app, from the tokens in packages/ui/tokens/mobile.ts
 * (docs/prd/ui/76-motion.md). Everything here runs on the UI thread through
 * Reanimated, and animates only transform and opacity.
 *
 * Reduce Motion: springs and timings below carry `ReduceMotion.System`, so
 * Reanimated jumps to the end value when the setting is on. Components that
 * start a loop or an entrance read `useReduceMotion()` and skip it.
 */

export const duration = mobileDuration;
export const pressScale = mobilePressScale;
export const glassOpacity = mobileGlassOpacity;

/** Springs in Reanimated's duration and damping-ratio form. */
export const spring = {
  snappy: { ...mobileSpring.snappy, reduceMotion: ReduceMotion.System },
  settle: { ...mobileSpring.settle, reduceMotion: ReduceMotion.System },
  pop: { ...mobileSpring.pop, reduceMotion: ReduceMotion.System },
} as const;

/** Easing curves. `enter` decelerates into place; `exit` accelerates away. */
export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  enter: Easing.bezier(0, 0, 0.2, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
} as const;

/** `withTiming` config for a duration token. */
export function timing(
  token: keyof typeof mobileDuration,
  curve: keyof typeof easing = "standard",
) {
  return {
    duration: mobileDuration[token],
    easing: easing[curve],
    reduceMotion: ReduceMotion.System,
  } as const;
}

/** True when the system asks for reduced motion. */
export function useReduceMotion(): boolean {
  return useReducedMotion();
}

/**
 * True when the system asks for reduced transparency. Only iOS has the
 * setting; on Android the glass fallback is already close to opaque.
 */
export function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceTransparencyChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return reduced;
}
