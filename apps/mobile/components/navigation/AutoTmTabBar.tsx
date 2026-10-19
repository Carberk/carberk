import {
  Heart,
  MessageSquare,
  Plus,
  Search,
  User,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
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

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { CrossFade } from "@/components/ui/motion";
import { Text } from "@/components/ui/text";
import { pressScale, spring, timing } from "@/lib/motion";
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

/**
 * The least room between a label and the capsule's edge. A label's box is its
 * slot less this on each side, and a label that would outgrow the box (in its
 * bold, selected face) shrinks to fit, so no label ever reaches the edge.
 */
const LABEL_INSET = 8;

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
}: {
  icon: LucideIcon;
  fills: boolean;
  selected: boolean;
}) {
  return (
    <CrossFade
      active={selected}
      off={
        <Icon
          as={icon}
          size={22}
          strokeWidth={1.8}
          className="text-muted-foreground"
        />
      }
      on={
        <Icon
          as={icon}
          size={22}
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
}: {
  label: string;
  selected: boolean;
  width: number | undefined;
}) {
  const text = (face: string) => (
    <Text
      numberOfLines={1}
      // A long label (Russian, Turkmen, a large system font) shrinks to its
      // box before it is cut.
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
      className={cn("text-center text-micro", face)}
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
}: {
  start: SharedValue<number>;
  end: SharedValue<number>;
  lift: DerivedValue<number>;
  visible: SharedValue<number>;
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
    opacity: visible.value,
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
function useCapsule(index: number, slot: number, stepAside: boolean) {
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
    if (previous === null) {
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
  }, [index, slot, stepAside, start, end, visible]);

  return { start, end, visible };
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

/**
 * The five-tab bar (ADR-0051), drawn as a floating capsule on the glass
 * surface. Tab screens run underneath it. The selected tab sits in one
 * lighter capsule that encloses its icon and its label; the capsule stretches
 * toward the next tab and settles into it when the selection moves, the icon
 * cross-fades from outline to filled and the label to semibold. Sell is a
 * brand red pill, level with its neighbours' icons; it is its own marker, so
 * the capsule steps aside while Sell is selected.
 * See docs/prd/ui/hifi/mobile-tabs-_layout.md.
 */
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
  const slot = tabSlotWidth(barWidth, TAB_CONFIG.length);
  const capsule = useCapsule(focusedIndex, slot, focusedName === "sell");
  // The capsule grows only with its own tab.
  const lift = useDerivedValue(() =>
    pressed.value === focusedIndex ? press.value : 1,
  );

  if (tabBarStyle?.display === "none") {
    return <View style={{ height: 0 }} />;
  }

  const labelWidth = slot > 0 ? slot - LABEL_INSET * 2 : undefined;

  return (
    <>
      {/* Absolute, so tab screens run underneath; they keep `useTabBarSpace()` clear. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: TAB_BAR_SIDE_MARGIN + insets.left,
          right: TAB_BAR_SIDE_MARGIN + insets.right,
          bottom: tabBarBottomOffset(insets.bottom),
        }}
      >
        <GlassSurface
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
          />

          {TAB_CONFIG.map((tab, index) => {
            const route = state.routes.find((r) => r.name === tab.name);
            if (!route) return null;

            const isFocused = focusedName === tab.name;
            const descriptor = descriptors[route.key];

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.dispatch({
                  ...CommonActions.navigate(route.name, route.params),
                  target: state.key,
                });
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            const isSell = tab.name === "sell";
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
                {/* Every tab draws its icon in the same 32 dp row, so the labels share one baseline. */}
                <View className="h-8 items-center justify-center">
                  {isSell ? (
                    <View className="h-8 w-14 items-center justify-center rounded-full bg-primary">
                      <Icon
                        as={Plus}
                        className="text-primary-foreground"
                        size={22}
                        strokeWidth={2.6}
                      />
                    </View>
                  ) : (
                    <View>
                      <TabIcon
                        icon={tab.icon}
                        fills={tab.fills}
                        selected={isFocused}
                      />
                      {badgeCount > 0 ? (
                        // Absolute, so the badge never changes the tab's size.
                        <View
                          testID="messages-tab-badge"
                          className="absolute -right-3 -top-1.5 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1"
                        >
                          <Text
                            className="text-micro font-semibold text-primary-foreground"
                            maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
                          >
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
                <TabLabel label={tab.label} selected={isFocused} width={labelWidth} />
              </TabButton>
            );
          })}
        </GlassSurface>
      </View>
    </>
  );
}
