import * as React from "react";
import type { ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { duration, spring, timing, useReduceMotion } from "@/lib/motion";

type MotionViewProps = ViewProps & {
  className?: string;
  children?: React.ReactNode;
};

/** The caller's static `style` is merged ahead of the animated one, so it is passed separately. */
function withoutStyle<T extends { style?: unknown }>(props: T): Omit<T, "style"> {
  const { style: _style, ...rest } = props;
  return rest;
}

/**
 * Motion building blocks for screens (docs/prd/ui/76-motion.md). Each one has
 * a single job, runs on the UI thread, and animates transform and opacity
 * only. With Reduce Motion on, each renders its end state at once.
 */

/**
 * A screen's content arriving: a short fade and an 8 dp rise, once, on mount.
 * `order` staggers siblings by 40 ms each. Use it for the first paint of a
 * screen or a section, not for every row of a scrolling list.
 */
function Enter({
  order = 0,
  children,
  ...props
}: MotionViewProps & { order?: number }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  React.useEffect(() => {
    progress.value = withDelay(order * 40, withTiming(1, timing("base", "enter")));
  }, [order, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }],
  }));

  return (
    <Animated.View style={[props.style, style]} {...withoutStyle(props)}>
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
    <Animated.View style={[props.style, style]} {...withoutStyle(props)}>
      {children}
    </Animated.View>
  );
}

/**
 * A slow opacity pulse for something that is waiting: a placeholder, a
 * sending state. Reduce Motion leaves it still.
 */
function Pulse({ children, ...props }: MotionViewProps) {
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
    <Animated.View style={[props.style, style]} {...withoutStyle(props)}>
      {children}
    </Animated.View>
  );
}

/**
 * The selected marker of a segmented row such as the tab bar: one shape that
 * slides to the selected slot instead of a highlight that jumps. `slot` is
 * the width of one slot and `index` the selected slot; the first placement is
 * immediate, later ones spring.
 */
function SlideIndicator({
  index,
  slot,
  children,
  ...props
}: MotionViewProps & { index: number; slot: number }) {
  const offset = useSharedValue(index * slot);
  const placed = React.useRef(slot > 0);

  React.useEffect(() => {
    const target = index * slot;
    if (placed.current) {
      offset.value = withSpring(target, spring.settle);
    } else {
      offset.value = target;
      placed.current = slot > 0;
    }
  }, [index, slot, offset]);

  const style = useAnimatedStyle(() => ({
    width: slot,
    transform: [{ translateX: offset.value }],
  }));

  return (
    <Animated.View style={[props.style, style]} {...withoutStyle(props)}>
      {children}
    </Animated.View>
  );
}

export { Enter, Pop, Pulse, SlideIndicator };
