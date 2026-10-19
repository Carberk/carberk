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

/**
 * Motion building blocks for screens (docs/prd/ui/76-motion.md). Each one has
 * a single job, runs on the UI thread, and animates transform and opacity
 * only. With Reduce Motion on, each renders its end state at once.
 */

/** How a screen's content arrives (`Enter`): its rise in dp and the stagger between siblings in ms. */
const ENTER = {
  /** A screen or a section: an empty state, a first paint. */
  section: { rise: 8, step: 40 },
  /** Cells of a list replacing their skeletons: barely a rise, a short stagger. */
  cell: { rise: 4, step: 24 },
} as const;

/**
 * A screen's content arriving: a short ease-out fade and a small rise, once,
 * on mount. `order` staggers siblings. Use it for the first paint of a screen
 * or a section, not for every row of a scrolling list.
 */
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

/**
 * A one-shot confirmation: when `active` turns true the content swells and
 * settles, as the favorite heart does when it fills. Turning false is quiet.
 */
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

/**
 * A slow opacity pulse for something that is waiting: a placeholder, a
 * sending state. Reduce Motion leaves it still.
 */
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

/**
 * Two drawings of one thing, for example a tab's outline and filled icon.
 * `active` cross-fades from `off` to `on`, a plain fade with no swell. Both
 * layers stay mounted and stacked, so nothing is laid out again. Reduce Motion
 * swaps them at once.
 */
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

/**
 * Press feedback for a surface whose pressable is only a part of it: a
 * Listing card gives as a whole under a finger, while its heart and its
 * contact buttons stay controls of their own beside the pressable area.
 * Spread `handlers` on the pressable and put `style` on a `MotionView`
 * around the whole surface. `PressableScale` covers the common case where the
 * pressable is the surface.
 *
 * The scale runs on the UI thread; Reduce Motion makes it an instant change.
 */
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

/**
 * Decides, once, which of a list's cells arrive with `Enter`. The first
 * `count` cells of the first page fade in, a beat apart; every cell that
 * mounts later (a cell scrolled back into the window, a next page) is simply
 * there. `ready` is true once the list has its first content.
 *
 * Returns the stagger order for an index, or `undefined` for no entrance.
 */
function useListEntrance(ready: boolean, count = 6) {
  const settled = React.useRef(false);

  React.useEffect(() => {
    if (!ready || settled.current) return;
    // Long enough for the first cells to mount; after it nothing enters again.
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

/**
 * A list cell that may arrive with `Enter`: the skeletons it replaces fade
 * into content with a 4 dp settle, not a cascade. The choice is made when the
 * cell mounts and never changes, so a re-render cannot replay or drop the
 * entrance.
 */
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

/** A view that takes an animated style, for `usePressScale`. */
const MotionView = Animated.View;

/**
 * One of a row of items that come and go, such as an active filter chip. It
 * fades in when it is added and out when it is removed, and its neighbours
 * slide to close the gap instead of jumping. The slide is a transform on the
 * UI thread. Reduce Motion drops all three.
 */
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
