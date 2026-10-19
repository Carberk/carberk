import {
  Heart,
  MessageSquare,
  Plus,
  Search,
  User,
} from "lucide-react-native";
import { View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useUnreadCount } from "../../src/api/conversations/useUnreadCount";
import { queryKeys } from "../../src/api/queryKeys";
import { useRefreshUnreadOnPush } from "../../src/notifications/useRefreshUnreadOnPush";

import {
  TAB_BAR_SIDE_MARGIN,
  TAB_BAR_VISUAL_HEIGHT,
  tabBarBottomOffset,
} from "./tabBarHeight";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { SlideIndicator } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** Inner padding between the bar's edge and the first and last tab. */
const BAR_PADDING = 6;

function useTabConfig() {
  const { t } = useTranslation();
  return [
    { name: "(search)", label: t("search"), icon: Search, fills: false },
    { name: "favorites", label: t("favorites"), icon: Heart, fills: true },
    { name: "sell", label: t("sell"), icon: Plus, fills: false },
    { name: "chat", label: t("messages"), icon: MessageSquare, fills: true },
    { name: "services", label: t("cabinet"), icon: User, fills: true },
  ] as const;
}

/**
 * The five-tab bar (ADR-0051), drawn as a floating pill on the glass surface.
 * Content scrolls underneath it. The selected tab sits in a capsule that
 * slides between tabs, with a filled icon and a heavier label; Sell is the
 * brand-red action, level with its neighbours.
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
  const currentDescriptor = currentRoute ? descriptors[currentRoute.key] : undefined;
  const tabBarStyle = currentDescriptor?.options
    ?.tabBarStyle as { display?: string } | undefined;

  if (tabBarStyle?.display === "none") {
    return <View style={{ height: 0 }} />;
  }

  const focusedName = currentRoute?.name;
  const focusedIndex = TAB_CONFIG.findIndex((tab) => tab.name === focusedName);
  const slot = barWidth > 0 ? (barWidth - BAR_PADDING * 2) / TAB_CONFIG.length : 0;
  // Sell keeps its own red capsule, so the sliding capsule skips it.
  const showIndicator = slot > 0 && focusedIndex >= 0 && focusedName !== "sell";

  return (
    // Absolute, so tab screens run underneath; they keep `useTabBarSpace()` clear.
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
        className="flex-row items-stretch rounded-3xl"
        style={{ height: TAB_BAR_VISUAL_HEIGHT, paddingHorizontal: BAR_PADDING }}
        onLayout={(event: LayoutChangeEvent) =>
          setBarWidth(event.nativeEvent.layout.width)
        }
      >
        {showIndicator ? (
          <SlideIndicator
            index={focusedIndex}
            slot={slot}
            className="absolute bottom-1.5 top-1.5 px-0.5"
            style={{ left: BAR_PADDING }}
          >
            <View className="flex-1 rounded-2xl bg-foreground/10" />
          </SlideIndicator>
        ) : null}

        {TAB_CONFIG.map((tab) => {
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
            <PressableScale
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={accessibilityLabel}
              testID={descriptor?.options.tabBarButtonTestID}
              className="flex-1 items-center justify-center gap-0.5"
              onPress={onPress}
              onLongPress={onLongPress}
            >
              {/* Every tab draws its icon in the same 28 dp row, so the labels share one baseline. */}
              <View className="h-7 items-center justify-center">
                {isSell ? (
                  <View className="h-7 w-11 items-center justify-center rounded-full bg-primary">
                    <Icon
                      as={Plus}
                      className="text-primary-foreground"
                      size={20}
                      strokeWidth={2.5}
                    />
                  </View>
                ) : (
                  <View>
                    <Icon
                      as={tab.icon}
                      size={24}
                      strokeWidth={isFocused ? 2.2 : 1.8}
                      className={cn(
                        isFocused ? "text-foreground" : "text-muted-foreground",
                        isFocused && tab.fills && "fill-foreground",
                      )}
                    />
                    {badgeCount > 0 ? (
                      // Absolute, so the badge never changes the tab's size.
                      <View
                        testID="messages-tab-badge"
                        className="absolute -right-3 -top-1.5 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1"
                      >
                        <Text className="text-micro font-medium text-primary-foreground">
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                className={cn(
                  "text-micro",
                  isFocused
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground",
                )}
              >
                {tab.label}
              </Text>
            </PressableScale>
          );
        })}
      </GlassSurface>
    </View>
  );
}
