import * as React from "react";
import { Pressable, type PressableProps, type View } from "react-native";

import { cn } from "@/lib/utils";

type PressFeedback = "control" | "surface" | "none";

type PressableScaleProps = PressableProps & {
  className?: string;




  feedback?: PressFeedback;
  ref?: React.Ref<View>;
};








const FEEDBACK: Record<PressFeedback, string> = {
  control: "transition-transform duration-fast ease-out active:scale-press-control active:duration-press",
  surface: "transition-transform duration-fast ease-out active:scale-press-surface active:duration-press",
  none: "",
};







function PressableScale({ feedback = "control", className, ...props }: PressableScaleProps) {
  return <Pressable className={cn(FEEDBACK[feedback], className)} {...props} />;
}

export { PressableScale };
export type { PressableScaleProps, PressFeedback };
