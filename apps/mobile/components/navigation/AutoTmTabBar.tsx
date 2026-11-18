import {
  Heart,
  MessageSquare,
  Plus,
  Search,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileType } from "@auto-tm/ui/tokens";
import { CommonActions } from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useUnreadCount } from "../../src/api/conversations/useUnreadCount";
import { queryKeys } from "../../src/api/queryKeys";
import { useRefreshUnreadOnPush } from "../../src/notifications/useRefreshUnreadOnPush";

import {
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING,
  TAB_BAR_SIDE_MARGIN,
  TAB_CONTENT_TOP,
  tabBarBottomOffset,
  tabSlotWidth,
} from "./tabBarHeight";
import { useTabBlurTarget } from "./TabBlurTargets";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { CrossFade } from "@/components/ui/motion";
import { Text } from "@/components/ui/text";
import {
  duration,
  pressScale,
  spring,
  timing,
  useReduceMotion,
  useReduceTransparency,
} from "@/lib/motion";
import { selectionTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Tab labels do not grow past this with the system font size: the bar has a
 * fixed height, and a label that outgrew it would be cut. Long labels shrink
 * to their slot instead (`adjustsFontSizeToFit`).
 */
const LABEL_MAX_FONT_SCALE = 1.3;

/**
 * The selected capsule fills its tab's slot inside the bar's 4 dp padding, so
 * it keeps the same 4 dp from the bar's edge on every side and its 28 dp
 * corners are concentric with the bar's 32 dp ends.
 */
const CAPSULE_HEIGHT = TAB_BAR_HEIGHT - TAB_BAR_PADDING * 2;
const CAPSULE_RADIUS = CAPSULE_HEIGHT / 2;

/** A tab's icon, the row it sits in, and the gap to its label, in dp. */
const TAB_ICON_SIZE = 22;
const TAB_ICON_ROW = 32;
const TAB_LABEL_GAP = 4;
const SELL_PILL_WIDTH = 56;
const BADGE_SIZE = 20;

/**
 * The least room between a label and the capsule's edge. A label's box is its
 * slot less this on each side. All five labels share one type size, set so
 * that the widest of them, in its selected weight, fits the box
 * (`useLabelScale`); none of them ever reaches the capsule's edge.
 */
const LABEL_INSET = 10;

/** The labels never shrink below this share of their size; past it a label is fitted on its own. */
const LABEL_MIN_SCALE = 0.85;

/**
 * The lens: while a finger rests on the bar or slides along it, the selected
 * capsule lifts into a clear lens that follows the finger and enlarges the
 * icons and labels under it. It is taller than the bar by `LENS_BULGE` above
 * and below, and wider than a tab by `LENS_REACH` on each side, so a long
 * label still reads whole when it is enlarged.
 */
const LENS_BULGE = 6;
const LENS_REACH = 12;
const LENS_HEIGHT = TAB_BAR_HEIGHT + LENS_BULGE * 2;

/** How far a finger travels sideways before a press becomes a slide. */
const SLIDE_START = 6;

/** After a slide the lens lands on its tab before it closes. */
const LENS_LANDING = 140;

/** The width the capsule's straight middle is drawn at before it is scaled to the gap between its ends. */
const MIDDLE_BASE = 100;

/** One piece of the capsule, at the bar's leading edge before its transform moves it. */
function pieceStyle(width: number, radius: number) {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height: CAPSULE_HEIGHT,
    borderRadius: radius,
    overflow: "hidden",
  } as const;
}

/**
 * One type size for all the tab labels. Each label is laid out once, unseen,
 * in the selected weight at full size; the widest decides how far all of them
 * shrink to fit `box`. Russian and Turkmen labels are longer than English
 * ones, and a larger system font widens them all.
 */
function useLabelScale(labels: readonly string[], box: number | undefined) {
  const key = labels.join("\n");
  const [measured, setMeasured] = useState<{ key: string; widest: number }>({ key, widest: 0 });
  const widths = useRef<{ key: string; byLabel: Map<string, number> }>({ key, byLabel: new Map() });

  const onMeasure = (label: string, width: number) => {
    if (widths.current.key !== key) widths.current = { key, byLabel: new Map() };
    widths.current.byLabel.set(label, width);
    if (widths.current.byLabel.size < labels.length) return;
    const widest = Math.max(...widths.current.byLabel.values());
    setMeasured((previous) =>
      previous.key === key && previous.widest === widest ? previous : { key, widest },
    );
  };

  const widest = measured.key === key ? measured.widest : 0;
  const scale =
    box && widest > box ? Math.max(box / widest, LABEL_MIN_SCALE) : 1;

  const ruler = (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Wide enough that no label wraps while it is measured.
      className="absolute left-0 top-0 flex-row opacity-0"
      style={{ width: RULER_WIDTH }}
    >
      {labels.map((label) => (
        <Text
          key={label}
          numberOfLines={1}
          maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
          className="text-micro font-semibold"
          onLayout={(event) => onMeasure(label, event.nativeEvent.layout.width)}
        >
          {label}
        </Text>
      ))}
    </View>
  );

  return { scale, ruler };
}

/** Room for the five labels side by side while they are measured. */
const RULER_WIDTH = 1200;

function useTabConfig() {
  const { t } = useTranslation();
  // `fills`: the icon is drawn solid while its tab is selected. The magnifier
  // and the plus have no inside to fill, so they take a heavier stroke.
  return [
    { name: "(search)", label: t("search"), icon: Search, fills: false },
    { name: "favorites", label: t("favorites"), icon: Heart, fills: true },
    { name: "sell", label: t("sell"), icon: Plus, fills: false },
    { name: "chat", label: t("messages"), icon: MessageSquare, fills: true },
    { name: "services", label: t("cabinet"), icon: User, fills: true },
  ] as const;
}

/**
 * A tab's icon in its two drawings: a quiet outline, and the selected one,
 * filled where the shape has an inside and heavier where it does not. The
 * two cross-fade on the UI thread when the tab is chosen.
 */
function TabIcon({
  icon,
  fills,
  selected,
  size = TAB_ICON_SIZE,
}: {
  icon: LucideIcon;
  fills: boolean;
  selected: boolean;
  size?: number;
}) {
  return (
    <CrossFade
      active={selected}
      off={
        <Icon
          as={icon}
          size={size}
          strokeWidth={1.8}
          className="text-muted-foreground"
        />
      }
      on={
        <Icon
          as={icon}
          size={size}
          strokeWidth={fills ? 1.8 : 2.4}
          className={cn("text-foreground", fills && "fill-foreground")}
        />
      }
    />
  );
}

/**
 * A tab's label in its two weights, stacked in one box: medium and quiet, and
 * semibold in the text colour while selected. They cross-fade with the icon,
 * so the weight change never makes the label jump. Both share the box, which
 * keeps `LABEL_INSET` clear of the capsule's edges.
 */
function TabLabel({
  label,
  selected,
  width,
  scale = 1,
}: {
  label: string;
  selected: boolean;
  width: number | undefined;
  /** The lens draws its labels larger; the type itself is set at the larger size, so it stays sharp. */
  scale?: number;
}) {
  const [size, line] = mobileType.micro;
  const text = (face: string) => (
    <Text
      numberOfLines={1}
      // A long label (Russian, Turkmen, a large system font) shrinks to its
      // box before it is cut.
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
      className={cn("text-center text-micro", face)}
      // The line height keeps its place, so a smaller label stays on the same baseline row.
      style={scale === 1 ? undefined : { fontSize: size * scale, lineHeight: line * Math.max(scale, 1) }}
    >
      {label}
    </Text>
  );
  return (
    <CrossFade
      active={selected}
      style={width ? { width } : { alignSelf: "stretch" }}
      off={text("font-medium text-muted-foreground")}
      on={text("font-semibold text-foreground")}
    />
  );
}

/**
 * The selected tab's capsule, drawn as two round ends and a straight middle so
 * that it can stretch while it moves using transforms alone: no width is laid
 * out again on any frame.
 *
 * `start` and `end` are its edges in the bar. When it travels, the edge on
 * the side it is heading to arrives first and the other follows, so it
 * reaches toward the new tab, then settles into it. `lift` grows it with its
 * tab while that tab is pressed; it grows about its own centre.
 *
 * The fill is opaque, so the overlapping pieces never show a seam.
 */
function TabCapsule({
  start,
  end,
  lift,
  visible,
  lens,
}: {
  start: SharedValue<number>;
  end: SharedValue<number>;
  lift: DerivedValue<number>;
  visible: SharedValue<number>;
  /** 0 to 1 as the lens opens; the capsule gives way to it. */
  lens: SharedValue<number>;
}) {
  const r = CAPSULE_RADIUS;

  // The edges with the press scale applied about the capsule's centre. Every
  // shared value is read here directly, so the styles below follow each frame.
  const edges = useDerivedValue(() => {
    const s = lift.value;
    const centre = (start.value + end.value) / 2;
    return {
      s,
      from: centre - (centre - start.value) * s,
      to: centre + (end.value - centre) * s,
    };
  });

  const frame = useAnimatedStyle(() => ({
    opacity: visible.value * (1 - lens.value),
    transform: [{ scaleY: lift.value }],
  }));
  const startCap = useAnimatedStyle(() => {
    const { s, from } = edges.value;
    return { transform: [{ translateX: from - r + r * s }, { scaleX: s }] };
  });
  const endCap = useAnimatedStyle(() => {
    const { s, to } = edges.value;
    return { transform: [{ translateX: to - r - r * s }, { scaleX: s }] };
  });
  const middle = useAnimatedStyle(() => {
    const { s, from, to } = edges.value;
    // One dp of overlap under each end.
    const length = Math.max(to - from - 2 * r * s + 2, 0);
    return {
      transform: [
        { translateX: (from + to) / 2 - MIDDLE_BASE / 2 },
        { scaleX: length / MIDDLE_BASE },
      ],
    };
  });

  // The animated views take plain styles only; the themed fill is a child.
  const fill = <View className="flex-1 bg-secondary dark:bg-accent" />;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", left: 0, right: 0, top: TAB_BAR_PADDING, height: CAPSULE_HEIGHT },
        frame,
      ]}
    >
      <Animated.View style={[pieceStyle(MIDDLE_BASE, 0), middle]}>{fill}</Animated.View>
      <Animated.View style={[pieceStyle(CAPSULE_HEIGHT, r), startCap]}>{fill}</Animated.View>
      <Animated.View style={[pieceStyle(CAPSULE_HEIGHT, r), endCap]}>{fill}</Animated.View>
    </Animated.View>
  );
}

/**
 * Where the capsule sits and how it moves between tabs. The first placement
 * is immediate; later ones travel with the leading edge on `glide` and the
 * trailing edge on `settle`, both without overshoot. Reduce Motion makes the
 * move an instant change (the springs carry `ReduceMotion.System`).
 */
function useCapsule(
  index: number,
  slot: number,
  stepAside: boolean,
  /** Set after a slide: the lens carried the selection, so the capsule is placed without travelling. */
  placeAtOnce: React.RefObject<boolean>,
) {
  const start = useSharedValue(0);
  const end = useSharedValue(0);
  const visible = useSharedValue(0);
  const placed = useRef<number | null>(null);

  useEffect(() => {
    if (slot <= 0 || index < 0) {
      visible.value = 0;
      placed.current = null;
      return;
    }
    if (stepAside) {
      // Sell's red pill is its own marker. The capsule fades where it stands
      // and, when it returns, fades in already at its new tab: it never
      // slides out of a slot the eye has stopped following.
      visible.value = withTiming(0, timing("fast", "exit"));
      placed.current = null;
      return;
    }
    const from = TAB_BAR_PADDING + index * slot;
    const to = from + slot;
    const previous = placed.current;
    const atOnce = placeAtOnce.current;
    placeAtOnce.current = false;
    if (previous === null || atOnce) {
      start.value = from;
      end.value = to;
    } else if (previous !== index) {
      const forward = index > previous;
      start.value = withSpring(from, forward ? spring.settle : spring.glide);
      end.value = withSpring(to, forward ? spring.glide : spring.settle);
    } else {
      // Same tab, a new slot width (rotation, a font change): follow at once.
      start.value = from;
      end.value = to;
    }
    placed.current = index;
    if (previous === null) visible.value = withTiming(1, timing("fast", "enter"));
  }, [index, slot, stepAside, start, end, visible, placeAtOnce]);

  return { start, end, visible };
}

/**
 * A tab's icon row and label, as the bar draws them and as the lens repeats
 * them. The lens passes `scale`: every size is then laid out larger, never a
 * drawn tab stretched, so icons and type stay sharp under the lens.
 */
function TabFace({
  tab,
  selected,
  badgeCount,
  labelWidth,
  labelScale,
  scale = 1,
  decorative = false,
}: {
  tab: { name: string; label: string; icon: LucideIcon; fills: boolean };
  selected: boolean;
  badgeCount: number;
  labelWidth: number | undefined;
  /** The shared size of the five labels, as a share of the type role. */
  labelScale: number;
  scale?: number;
  /** The lens's copy: drawn for the eye only, so it carries no test id. */
  decorative?: boolean;
}) {
  const [badgeType, badgeLine] = mobileType.micro;
  return (
    <>
      {/* Every tab draws its icon in the same row, so the labels share one baseline. */}
      <View
        className="items-center justify-center"
        style={{ height: TAB_ICON_ROW * scale }}
      >
        {tab.name === "sell" ? (
          <View
            className="items-center justify-center rounded-full bg-primary"
            style={{ height: TAB_ICON_ROW * scale, width: SELL_PILL_WIDTH * scale }}
          >
            <Icon
              as={Plus}
              className="text-primary-foreground"
              size={TAB_ICON_SIZE * scale}
              strokeWidth={2.6}
            />
          </View>
        ) : (
          <View>
            <TabIcon
              icon={tab.icon}
              fills={tab.fills}
              selected={selected}
              size={TAB_ICON_SIZE * scale}
            />
            {badgeCount > 0 ? (
              // Absolute, so the badge never changes the tab's size.
              <View
                testID={decorative ? undefined : "messages-tab-badge"}
                className="absolute items-center justify-center rounded-full bg-primary px-1"
                style={{
                  right: -12 * scale,
                  top: -6 * scale,
                  height: BADGE_SIZE * scale,
                  minWidth: BADGE_SIZE * scale,
                }}
              >
                <Text
                  className="text-micro font-semibold text-primary-foreground"
                  maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
                  style={
                    scale === 1
                      ? undefined
                      : { fontSize: badgeType * scale, lineHeight: badgeLine * scale }
                  }
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
      <TabLabel
        label={tab.label}
        selected={selected}
        width={labelWidth === undefined ? undefined : labelWidth * scale}
        scale={scale * labelScale}
      />
    </>
  );
}

/**
 * What the lens is made of: the bar's own glass tone with a bright rim and a
 * soft floating shadow, so it reads as a clear drop of glass raised off the
 * bar. It is nearly solid on purpose: the quiet row under it must not show
 * through its enlarged drawing.
 */
function LensMaterial() {
  const reduceTransparency = useReduceTransparency();
  return (
    <View
      className={cn(
        "absolute inset-0 rounded-full border-hairline border-glass-edge dark:border-glass-edge/25 shadow-floating",
        reduceTransparency ? "bg-card dark:bg-accent" : "bg-glass/95",
      )}
    />
  );
}

/**
 * The lens over the bar. `x` is its centre in the bar, `open` runs 0 to 1 as
 * it opens. Inside it the whole tab row is drawn again in its selected look
 * and enlarged about the lens's centre, so what is under the lens reads as
 * magnified while the row outside stays quiet. Only transforms and opacity
 * change, on the UI thread.
 */
function TabLens({
  x,
  open,
  barWidth,
  slot,
  children,
}: {
  x: SharedValue<number>;
  open: SharedValue<number>;
  barWidth: number;
  slot: number;
  children: React.ReactNode;
}) {
  const width = slot + LENS_REACH * 2;
  const magnify = pressScale.magnify;

  const frame = useAnimatedStyle(() => ({
    opacity: open.value,
    // It opens from the capsule's size.
    transform: [
      { translateX: x.value - width / 2 },
      { scale: 0.86 + 0.14 * open.value },
    ],
  }));
  // The row inside is laid out `magnify` times larger, so a point `p` of the
  // bar sits at `magnify * p` in it; sliding it puts that point at
  // `width / 2 + magnify * (p - x)` inside the lens.
  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: width / 2 - magnify * x.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: "absolute",
          left: 0,
          top: -LENS_BULGE,
          width,
          height: LENS_HEIGHT,
          borderRadius: LENS_HEIGHT / 2,
          overflow: "hidden",
        },
        frame,
      ]}
    >
      <LensMaterial />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: (LENS_HEIGHT - TAB_BAR_HEIGHT * magnify) / 2,
            width: barWidth * magnify,
            height: TAB_BAR_HEIGHT * magnify,
            flexDirection: "row",
            paddingHorizontal: TAB_BAR_PADDING * magnify,
          },
          row,
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * One tab. Under a finger it grows a little (`pressScale.lift`) on a quick
 * spring with no overshoot, and returns the same way on release or when the
 * finger slides off; the selected capsule grows with its own tab. The scale
 * is a transform on the UI thread.
 */
function TabButton({
  index,
  pressed,
  press,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Pressable>, "children" | "style"> & {
  index: number;
  pressed: SharedValue<number>;
  press: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value === index ? press.value : 1 }],
  }));
  return (
    <Pressable
      className="flex-1"
      onPressIn={() => {
        pressed.value = index;
        press.value = withSpring(pressScale.lift, spring.snappy);
      }}
      onPressOut={() => {
        press.value = withSpring(1, spring.snappy);
      }}
      {...props}
    >
      {/* Laid out from the top, so the icon row keeps its place whatever
          height the label takes at a larger system font. */}
      <Animated.View style={[{ flex: 1 }, style]}>
        <View className="flex-1 items-center gap-1" style={{ paddingTop: TAB_CONTENT_TOP }}>
          {children}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function AutoTmTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const TAB_CONFIG = useTabConfig();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const unreadCount = useUnreadCount();
  useRefreshUnreadOnPush();
  const [barWidth, setBarWidth] = useState(0);
  // The tab under a finger and its press scale, shared with the capsule.
  const pressed = useSharedValue(-1);
  const press = useSharedValue(1);

  const messagesFocused = state.routes[state.index]?.name === "chat";
  // The count also refreshes on foreground and push (see their hooks) and after
  // a Conversation is read; here, each time the Messages tab gains focus.
  useEffect(() => {
    if (messagesFocused) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.unreadCounts(),
      });
    }
  }, [messagesFocused, queryClient]);

  const currentRoute = state.routes[state.index];
  const currentDescriptor = currentRoute
    ? descriptors[currentRoute.key]
    : undefined;
  const tabBarStyle = currentDescriptor?.options?.tabBarStyle as
    { display?: string } | undefined;

  const focusedName = currentRoute?.name;
  const focusedIndex = TAB_CONFIG.findIndex((tab) => tab.name === focusedName);
  // Android 12 and later blur the open screen behind the bar.
  const blurTarget = useTabBlurTarget(currentRoute?.key);
  const slot = tabSlotWidth(barWidth, TAB_CONFIG.length);
  const placeAtOnce = useRef(false);
  const capsule = useCapsule(focusedIndex, slot, focusedName === "sell", placeAtOnce);
  // The capsule grows only with its own tab.
  const lift = useDerivedValue(() =>
    pressed.value === focusedIndex ? press.value : 1,
  );

  const reduceMotion = useReduceMotion();
  // The lens: its centre in the bar, how far it is open, and the bar's swell.
  const lensX = useSharedValue(0);
  const lensOpen = useSharedValue(0);
  const swell = useSharedValue(1);
  const slid = useSharedValue(0);
  // The tab under the lens, so crossing into another one ticks once.
  const lensTab = useSharedValue(-1);
  // The lens's copy of the row is mounted with the first touch and stays.
  const [lensMounted, setLensMounted] = useState(false);
  const mountLens = useCallback(() => setLensMounted(true), []);

  const pendingTick = useRef<string | null>(null);
  useEffect(() => { pendingTick.current = null; }, [focusedName]);

  // A tab chosen by tap or by letting go of a slide over it.
  const selectTab = (name: string, tick = false) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const isFocused = focusedName === name;
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      if (tick && pendingTick.current !== name) {
        pendingTick.current = name;
        selectionTick();
      }
      navigation.dispatch({
        ...CommonActions.navigate(route.name, route.params),
        target: state.key,
      });
    }
  };
  const selectRef = useRef(selectTab);
  selectRef.current = selectTab;
  const tabNames = TAB_CONFIG.map((tab) => tab.name);
  const namesRef = useRef<readonly string[]>(tabNames);
  namesRef.current = tabNames;
  const focusedRef = useRef(focusedIndex);
  focusedRef.current = focusedIndex;
  // Letting go of a slide chooses the tab under the lens. Ending on the tab
  // that is already open changes nothing: only a tap re-selects a tab.
  const selectFromSlide = useCallback((index: number) => {
    if (index === focusedRef.current) return;
    const name = namesRef.current[index];
    if (!name) return;
    placeAtOnce.current = true;
    selectRef.current(name);
  }, []);

  const tabCount = TAB_CONFIG.length;
  const slide = useMemo(() => {
    const first = TAB_BAR_PADDING + slot / 2;
    const last = barWidth - TAB_BAR_PADDING - slot / 2;
    // Plain values for the worklets below: `timing` itself runs on the JS thread.
    const opening = timing("fast", "enter");
    const closing = timing("fast", "exit");
    const hold = duration.press;
    const swollen = pressScale.swell;
    const quick = spring.snappy;
    const landing = spring.settle;
    const tabAt = (x: number) => {
      "worklet";
      return Math.min(Math.max(Math.floor((x - TAB_BAR_PADDING) / slot), 0), tabCount - 1);
    };
    return Gesture.Pan()
      .enabled(slot > 0)
      .activeOffsetX([-SLIDE_START, SLIDE_START])
      .onBegin((event) => {
        slid.value = 0;
        lensTab.value = tabAt(event.x);
        lensX.value = Math.min(Math.max(event.x, first), last);
        // A quick tap never opens the lens; a finger that rests does.
        lensOpen.value = withDelay(hold, withTiming(1, opening));
        if (!reduceMotion) swell.value = withSpring(swollen, quick);
        scheduleOnRN(mountLens);
      })
      .onStart(() => {
        slid.value = 1;
        lensOpen.value = withTiming(1, opening);
      })
      .onUpdate((event) => {
        lensX.value = Math.min(Math.max(event.x, first), last);
        const index = tabAt(event.x);
        if (index !== lensTab.value) {
          lensTab.value = index;
          scheduleOnRN(selectionTick);
        }
      })
      .onEnd((event) => {
        const index = tabAt(event.x);
        lensX.value = withSpring(TAB_BAR_PADDING + (index + 0.5) * slot, landing);
        scheduleOnRN(selectFromSlide, index);
      })
      .onFinalize(() => {
        swell.value = withSpring(1, quick);
        lensOpen.value = withDelay(slid.value ? LENS_LANDING : 0, withTiming(0, closing));
      });
  }, [barWidth, slot, tabCount, reduceMotion, lensX, lensOpen, swell, slid, lensTab, mountLens, selectFromSlide]);
  const swellStyle = useAnimatedStyle(() => ({ transform: [{ scale: swell.value }] }));

  const labelWidth = slot > 0 ? slot - LABEL_INSET * 2 : undefined;
  const labelFit = useLabelScale(TAB_CONFIG.map((tab) => tab.label), labelWidth);

  if (tabBarStyle?.display === "none") {
    return <View style={{ height: 0 }} />;
  }

  return (
    <>
      {/* Absolute, so tab screens run underneath; they keep `useTabBarSpace()` clear. */}
      <GestureDetector gesture={slide}>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: TAB_BAR_SIDE_MARGIN + insets.left,
          right: TAB_BAR_SIDE_MARGIN + insets.right,
          bottom: tabBarBottomOffset(insets.bottom),
        }}
      >
        {/* The bar swells under a finger. The lens is not inside it: it is
            drawn at its final size, so nothing in it is ever stretched. */}
        <Animated.View style={swellStyle}>
        <GlassSurface
          blurTarget={blurTarget}
          accessibilityRole="tablist"
          // items-stretch, not items-center: with align-items:center each tab
          // Pressable sizes to its own content instead of filling the bar,
          // leaving every tab target below Android's 48dp minimum.
          className="flex-row items-stretch rounded-full"
          style={{ height: TAB_BAR_HEIGHT, paddingHorizontal: TAB_BAR_PADDING }}
          onLayout={(event: LayoutChangeEvent) =>
            setBarWidth(event.nativeEvent.layout.width)
          }
        >
          <TabCapsule
            start={capsule.start}
            end={capsule.end}
            visible={capsule.visible}
            lift={lift}
            lens={lensOpen}
          />

          {TAB_CONFIG.map((tab, index) => {
            const route = state.routes.find((r) => r.name === tab.name);
            if (!route) return null;

            const isFocused = focusedName === tab.name;
            const descriptor = descriptors[route.key];

            const onPress = () => selectTab(tab.name, true);

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            const badgeCount = tab.name === "chat" ? unreadCount : 0;
            const accessibilityLabel =
              badgeCount > 0
                ? t("messagesTabUnread", { count: badgeCount })
                : (descriptor?.options.tabBarAccessibilityLabel ?? tab.label);

            return (
              <TabButton
                key={tab.name}
                index={index}
                pressed={pressed}
                press={press}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={accessibilityLabel}
                testID={descriptor?.options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
              >
                <TabFace
                  tab={tab}
                  selected={isFocused}
                  badgeCount={badgeCount}
                  labelWidth={labelWidth}
                  labelScale={labelFit.scale}
                />
              </TabButton>
            );
          })}
        </GlassSurface>
        </Animated.View>
        {labelFit.ruler}
        {lensMounted && slot > 0 ? (
          <TabLens x={lensX} open={lensOpen} barWidth={barWidth} slot={slot}>
            {TAB_CONFIG.map((tab) => (
              <View
                key={tab.name}
                className="flex-1 items-center"
                style={{
                  paddingTop: TAB_CONTENT_TOP * pressScale.magnify,
                  gap: TAB_LABEL_GAP * pressScale.magnify,
                }}
              >
                <TabFace
                  tab={tab}
                  selected
                  badgeCount={tab.name === "chat" ? unreadCount : 0}
                  labelWidth={labelWidth}
                  labelScale={labelFit.scale}
                  scale={pressScale.magnify}
                  decorative
                />
              </View>
            ))}
          </TabLens>
        ) : null}
      </View>
      </GestureDetector>
    </>
  );
}
