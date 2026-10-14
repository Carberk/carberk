import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { dismissDecision } from "./photoTransitionMath";
import {
  clampScale,
  clampTranslation,
  doubleTapScale,
  fittedSize,
  focalTranslation,
} from "./zoomMath";

export interface ZoomableImageProps {
  width: number;
  height: number;
  /** The photo's width / height, so panning stops at its edges; the frame's shape until known. */
  aspectRatio?: number;
  /** True for the photo the viewer is on; any other photo snaps back to fitted. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  /** Called as a zoom begins, so the viewer can start loading the sharper photo. */
  onZoomStart?: () => void;
  children: ReactNode;
  drag?: SharedValue<{ x: number; y: number }>;
  onDismiss?: (velocity: number) => void;
  onDismissCancel?: () => void;
}

/** Below this a pinch counts as back at fitted size. */
const FITTED = 1.02;

const noop = () => {};

/**
 * Pinch, drag and double-tap zoom for one photo. Gestures run on the UI thread
 * through Gesture Handler and Reanimated shared values; only the zoomed or
 * fitted flag crosses back to React, so the viewer can lock paging while a
 * photo is zoomed. A double-tap or pinch zooms around the point under the
 * finger, and a zoomed photo pans only until its own edge reaches the frame,
 * so a letterboxed photo never shows the bands around it. One-finger
 * dragging is enabled only while zoomed, so a fitted photo never competes
 * with the pager's swipe. The detector sits on the untransformed frame, so
 * touch points are frame coordinates at any zoom.
 */
export function ZoomableImage({
  width,
  height,
  aspectRatio,
  active,
  onZoomChange,
  onZoomStart = noop,
  children,
  drag,
  onDismiss,
  onDismissCancel,
}: ZoomableImageProps) {
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  // While two fingers pinch, the pinch alone moves the photo: on iOS an
  // active one-finger pan is not cancelled when a second finger lands.
  const pinching = useSharedValue(false);

  // Read through a ref, so a new callback each render never rebuilds the
  // gestures, which would cancel a pinch in progress.
  const zoomStartRef = useRef(onZoomStart);
  useEffect(() => {
    zoomStartRef.current = onZoomStart;
  }, [onZoomStart]);
  const startZoom = useCallback(() => zoomStartRef.current(), []);

  const reportZoom = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
    },
    [onZoomChange],
  );

  // A photo the viewer has moved off returns to fitted without telling the
  // viewer: it already unlocked paging when the buyer picked another photo.
  useEffect(() => {
    if (active) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    setZoomed(false);
  }, [active, scale, savedScale, translateX, translateY, savedX, savedY]);

  const gesture = useMemo(() => {
    const photo = fittedSize(width, height, aspectRatio);
    const centreX = width / 2;
    const centreY = height / 2;

    const pinch = Gesture.Pinch()
      .onStart((event) => {
        pinching.value = true;
        savedScale.value = scale.value;
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        focalX.value = event.focalX - centreX;
        focalY.value = event.focalY - centreY;
        scheduleOnRN(startZoom);
      })
      .onUpdate((event) => {
        const next = clampScale(savedScale.value * event.scale);
        scale.value = next;
        // The start point stays under the fingers, and moving both fingers pans.
        const movedX = event.focalX - centreX - focalX.value;
        const movedY = event.focalY - centreY - focalY.value;
        translateX.value = clampTranslation(
          focalTranslation(focalX.value, savedScale.value, savedX.value, next) + movedX,
          next,
          photo.width,
          width,
        );
        translateY.value = clampTranslation(
          focalTranslation(focalY.value, savedScale.value, savedY.value, next) + movedY,
          next,
          photo.height,
          height,
        );
      })
      .onFinalize(() => {
        pinching.value = false;
      })
      .onEnd(() => {
        const fitted = scale.value < FITTED;
        if (fitted) {
          scale.value = withTiming(1);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          savedScale.value = 1;
          savedX.value = 0;
          savedY.value = 0;
        } else {
          savedScale.value = scale.value;
          savedX.value = translateX.value;
          savedY.value = translateY.value;
        }
        scheduleOnRN(reportZoom, !fitted);
      });

    const pan = Gesture.Pan()
      .enabled(zoomed)
      .maxPointers(1)
      // Moves by each step rather than from the start point, so a finger left
      // down after a pinch carries on from where the pinch put the photo.
      .onChange((event) => {
        if (pinching.value) return;
        translateX.value = clampTranslation(
          translateX.value + event.changeX,
          scale.value,
          photo.width,
          width,
        );
        translateY.value = clampTranslation(
          translateY.value + event.changeY,
          scale.value,
          photo.height,
          height,
        );
      })
      .onEnd(() => {
        savedX.value = translateX.value;
        savedY.value = translateY.value;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((event, success) => {
        if (!success) return;
        const next = doubleTapScale(scale.value);
        let x = 0;
        let y = 0;
        if (next > 1) {
          scheduleOnRN(startZoom);
          // The tapped point stays under the finger.
          x = clampTranslation(
            focalTranslation(event.x - centreX, scale.value, translateX.value, next),
            next,
            photo.width,
            width,
          );
          y = clampTranslation(
            focalTranslation(event.y - centreY, scale.value, translateY.value, next),
            next,
            photo.height,
            height,
          );
        }
        scale.value = withTiming(next);
        savedScale.value = next;
        translateX.value = withTiming(x);
        translateY.value = withTiming(y);
        savedX.value = x;
        savedY.value = y;
        scheduleOnRN(reportZoom, next > 1);
      });

    const dismiss = Gesture.Pan()
      .enabled(active && !zoomed && !!drag && !!onDismiss)
      .activeOffsetY([-12, 12])
      .failOffsetX([-12, 12])
      .maxPointers(1)
      .onChange((event) => {
        if (pinching.value || scale.value >= FITTED || !drag) return;
        drag.value = { x: drag.value.x + event.changeX, y: drag.value.y + event.changeY };
      })
      .onEnd((event) => {
        if (!drag || !onDismiss || pinching.value || scale.value >= FITTED) return;
        if (dismissDecision(drag.value.y, event.velocityY, height)) scheduleOnRN(onDismiss, event.velocityY);
        else if (onDismissCancel) scheduleOnRN(onDismissCancel);
      })
      .onFinalize((_event, success) => {
        if (!success && onDismissCancel) scheduleOnRN(onDismissCancel);
      });
    return Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan, dismiss));
  }, [
    zoomed,
    active,
    drag,
    onDismiss,
    onDismissCancel,
    width,
    height,
    aspectRatio,
    reportZoom,
    startZoom,
    scale,
    savedScale,
    translateX,
    translateY,
    savedX,
    savedY,
    focalX,
    focalY,
    pinching,
  ]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: "hidden" }}>
        <Animated.View style={[{ width, height }, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
