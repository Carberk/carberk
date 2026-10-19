import * as React from "react";
import { Pressable, type PressableProps, type View } from "react-native";

import { cn } from "@/lib/utils";

type PressFeedback = "control" | "surface" | "none";

type PressableScaleProps = PressableProps & {
  className?: string;
  /**
   * How far the surface gives under a finger: `control` for buttons, chips and
   * icon buttons, `surface` for cards and rows, `none` to opt out.
   */
  feedback?: PressFeedback;
  ref?: React.Ref<View>;
};

/**
 * The press scale is a NativeWind transition on `transform`. NativeWind runs
 * transitions through Reanimated on the UI thread, so the scale costs no
 * layout and no JavaScript frame, and Reanimated's system setting turns it
 * into an instant change under Reduce Motion. The scales and the duration are
 * tokens (`mobilePressScale`, `mobileDuration.fast`).
 */
const FEEDBACK: Record<PressFeedback, string> = {
  control: "transition-transform duration-fast active:scale-press-control",
  surface: "transition-transform duration-fast active:scale-press-surface",
  none: "",
};

/**
 * A `Pressable` that gives under a finger and returns on release. It is a
 * drop-in for `Pressable`: every prop, role, label and handler passes through.
 * A disabled surface does not move, because a disabled Pressable is never
 * `active`.
 */
function PressableScale({ feedback = "control", className, ...props }: PressableScaleProps) {
  return <Pressable className={cn(FEEDBACK[feedback], className)} {...props} />;
}

export { PressableScale };
export type { PressableScaleProps, PressFeedback };
