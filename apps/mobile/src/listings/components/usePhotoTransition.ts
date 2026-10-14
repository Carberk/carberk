import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { duration, spring, timing, useReduceMotion } from "@/lib/motion";
import { returnMode, toModalRect, type PhotoGeometry, type PhotoRect } from "./photoTransitionMath";

export function usePhotoTransition({ origin, getReturnGeometry, onTileHidden, onClose, indexRef, showRef, closeRef }: {
  origin?: PhotoGeometry | null;
  getReturnGeometry?: (index: number) => PhotoGeometry | null;
  onTileHidden?: (index: number | null) => void;
  onClose: (index: number) => void; indexRef: { current: number };
  showRef: { current: () => void }; closeRef: { current: () => void };
}) {
  const reduced = useReduceMotion();
  const root = useRef<View>(null);
  const pager = useRef<View>(null);
  const rootOrigin = useRef({ x: 0, y: 0 });
  const [page, setPage] = useState<PhotoRect | null>(null);
  const [shown, setShown] = useState(false);
  const [displayed, setDisplayed] = useState(false);
  const [geometry, setGeometry] = useState<PhotoGeometry | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [landed, setLanded] = useState(false);
  const closing = useRef(false);
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const chrome = useSharedValue(0);
  const drag = useSharedValue({ x: 0, y: 0 });
  const convert = useCallback((value: PhotoGeometry) => ({ ...value, tile: toModalRect(value.tile, rootOrigin.current), visible: toModalRect(value.visible, rootOrigin.current) }), []);
  const measure = useCallback(() => {
    root.current?.measureInWindow((x, y) => {
      rootOrigin.current = { x, y };
      pager.current?.measureInWindow((px, py, width, height) => {
        if (width > 0 && height > 0) setPage({ x: px - x, y: py - y, width, height });
      });
    });
  }, []);
  useEffect(() => { showRef.current = () => { setShown(true); measure(); }; }, [showRef, measure]);
  useEffect(() => {
    if (!shown || !page || reduced || !origin) return;
    setGeometry(convert(origin));
    setOverlay(true);
  }, [shown, page, reduced, origin, convert]);
  const finishOpen = useCallback(() => {
    setLanded(true);
    setOverlay(false);
    onTileHidden?.(null);
    chrome.value = withTiming(1, timing("fast", "enter"));
  }, [onTileHidden, chrome]);
  useEffect(() => {
    if (!shown || closing.current) return;
    if (reduced || !origin) {
      opacity.value = withTiming(1, { duration: duration.fast, reduceMotion: ReduceMotion.Never });
      chrome.value = opacity.value;
      setLanded(true);
      return;
    }
    if (!displayed || !page) return;
    onTileHidden?.(indexRef.current);
    opacity.value = 1;
    progress.value = withTiming(1, timing("slow"), (finished) => { if (finished) scheduleOnRN(finishOpen); });
  }, [shown, displayed, page, reduced, origin, opacity, chrome, progress, finishOpen, onTileHidden, indexRef]);
  const done = useCallback(() => {
    onTileHidden?.(null);
    // Keep the identical source tile beneath the last overlay frame until Modal removal.
    requestAnimationFrame(() => onClose(indexRef.current));
  }, [onClose, indexRef, onTileHidden]);
  const close = useCallback((velocity?: number) => {
    if (closing.current) return;
    closing.current = true;
    chrome.value = withTiming(0, timing("fast", "exit"));
    const destination = getReturnGeometry?.(indexRef.current);
    if (!reduced && page && returnMode(destination) === "fly" && destination) {
      setGeometry(convert(destination));
      setOverlay(true);
      onTileHidden?.(indexRef.current);
      // Never replace a partly completed opening flight with a fully open frame.
      if (landed) progress.value = 1;
      requestAnimationFrame(() => {
        const callback = (finished?: boolean) => { "worklet"; if (finished) scheduleOnRN(done); };
        progress.value = velocity === undefined
          ? withTiming(0, timing("base"), callback)
          : withSpring(0, { duration: 320, dampingRatio: 1, velocity: 0, reduceMotion: ReduceMotion.System }, callback);
      });
    } else {
      opacity.value = withTiming(0, { ...timing("base", "exit"), duration: reduced ? duration.fast : duration.base, reduceMotion: ReduceMotion.Never }, (finished) => { if (finished) scheduleOnRN(done); });
    }
  }, [chrome, getReturnGeometry, indexRef, reduced, page, convert, onTileHidden, landed, progress, done, opacity]);
  useEffect(() => { closeRef.current = () => close(); }, [closeRef, close]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value * Math.min(progress.value / 0.6 + (reduced || !origin ? 1 : 0), 1) * (1 - 0.7 * Math.min(Math.abs(drag.value.y) / ((page?.height ?? 1) * 0.5), 1)) }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value * (drag.value.y === 0 ? 1 : 0) }));
  const pagerStyle = useAnimatedStyle(() => ({
    opacity: overlay || (!landed && !!origin && !reduced) ? 0 : 1,
    transform: [{ translateX: drag.value.x }, { translateY: drag.value.y }, { scale: 1 - 0.25 * Math.min(Math.abs(drag.value.y) / (page?.height ?? 1), 1) }],
  }));
  const cancelDrag = useCallback(() => { drag.value = reduced ? { x: 0, y: 0 } : withSpring({ x: 0, y: 0 }, spring.snappy); }, [drag, reduced]);
  return { root, pager, measure, page, geometry, overlay, progress, drag, close, cancelDrag, backdropStyle, contentStyle, chromeStyle, pagerStyle, onDisplay: useCallback(() => setDisplayed(true), []) };
}
