import * as React from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { duration, pressScale, spring, timing, useReduceMotion } from "@/lib/motion";

type MotionViewProps = ViewProps & {
  className?: string;
  children?: React.ReactNode;
};








const ENTER = {

  section: { rise: 8, step: 40 },

  cell: { rise: 4, step: 24 },
} as const;






function Enter({
  order = 0,
  kind = "section",
  children,
  style: callerStyle,
  ...props
}: MotionViewProps & { order?: number; kind?: keyof typeof ENTER }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const { rise, step } = ENTER[kind];

  React.useEffect(() => {
    progress.value = withDelay(order * step, withTiming(1, timing("base", "enter")));
  }, [order, step, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * rise }],
  }));

  return (
    <Animated.View style={[callerStyle, style]} {...props}>
      {children}
    </Animated.View>
  );
}





function Pop({
  active,
  children,
  style: callerStyle,
  ...props
}: MotionViewProps & { active: boolean }) {
  const scale = useSharedValue(1);
  const wasActive = React.useRef(active);

  React.useEffect(() => {
    if (active && !wasActive.current) {
      scale.value = withSequence(
        withTiming(1.28, timing("press", "enter")),
        withSpring(1, spring.pop),
      );
    }
    wasActive.current = active;
  }, [active, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[callerStyle, style]} {...props}>
      {children}
    </Animated.View>
  );
}





function Pulse({ children, style: callerStyle, ...props }: MotionViewProps) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withTiming(0.55, { duration: duration.pulse / 2 }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[callerStyle, style]} {...props}>
      {children}
    </Animated.View>
  );
}







function CrossFade({
  active,
  on,
  off,
  style: callerStyle,
  ...props
}: Omit<MotionViewProps, "children"> & {
  active: boolean;
  on: React.ReactNode;
  off: React.ReactNode;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  const wasActive = React.useRef(active);

  React.useEffect(() => {
    if (active === wasActive.current) return;
    wasActive.current = active;
    progress.value = withTiming(active ? 1 : 0, timing("fast"));
  }, [active, progress]);

  const onStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const offStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  return (
    <Animated.View style={callerStyle} {...props}>
      <Animated.View style={offStyle}>{off}</Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, onStyle]}
      >
        {on}
      </Animated.View>
    </Animated.View>
  );
}











function usePressScale(feedback: keyof typeof pressScale = "surface") {
  const pressed = useSharedValue(0);
  const target = pressScale[feedback];

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - target) }],
  }));

  const handlers = React.useMemo(
    () => ({
      onPressIn: () => {
        pressed.value = withTiming(1, timing("press"));
      },
      onPressOut: () => {
        pressed.value = withTiming(0, timing("fast"));
      },
    }),
    [pressed],
  );

  return { style, handlers };
}









function useListEntrance(ready: boolean, count = 6) {
  const settled = React.useRef(false);

  React.useEffect(() => {
    if (!ready || settled.current) return;

    const id = setTimeout(() => {
      settled.current = true;
    }, duration.slow);
    return () => clearTimeout(id);
  }, [ready]);

  return React.useCallback(
    (index: number) => (settled.current || index >= count ? undefined : index),
    [count],
  );
}







function EnterOnce({
  order,
  children,
  ...props
}: MotionViewProps & { order?: number }) {
  const [initialOrder] = React.useState(order);
  if (initialOrder === undefined) {
    return <View {...props}>{children}</View>;
  }
  return (
    <Enter order={initialOrder} kind="cell" {...props}>
      {children}
    </Enter>
  );
}


const MotionView = Animated.View;







function Presence({ children, ...props }: MotionViewProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(duration.fast).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(duration.base).reduceMotion(ReduceMotion.System)}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

export {
  CrossFade,
  Enter,
  EnterOnce,
  MotionView,
  Pop,
  Presence,
  Pulse,
  useListEntrance,
  usePressScale,
};
