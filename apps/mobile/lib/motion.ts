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

configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

export const duration = mobileDuration;
export const pressScale = mobilePressScale;
export const glassOpacity = mobileGlassOpacity;

export const spring = {
  snappy: { ...mobileSpring.snappy, reduceMotion: ReduceMotion.System },
  settle: { ...mobileSpring.settle, reduceMotion: ReduceMotion.System },
  glide: { ...mobileSpring.glide, reduceMotion: ReduceMotion.System },
  pop: { ...mobileSpring.pop, reduceMotion: ReduceMotion.System },
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  enter: Easing.bezier(0, 0, 0.2, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
} as const;

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

export function useReduceMotion(): boolean {
  return useReducedMotion();
}

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
