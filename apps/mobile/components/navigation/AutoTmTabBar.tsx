import {
  Heart,
  MessageSquare,
  Plus,
  Search,
  User,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";

import { TAB_BAR_HEIGHT } from "./tabBarHeight";

import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

function useTabConfig() {
  const { t } = useTranslation();
  return [
    { name: "(search)", label: t("search"), icon: Search },
    { name: "favorites", label: t("favorites"), icon: Heart },
    { name: "sell", label: t("sell"), icon: Plus },
    { name: "chat", label: t("messages"), icon: MessageSquare },
    { name: "services", label: t("cabinet"), icon: User },
  ] as const;
}

export function AutoTmTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const TAB_CONFIG = useTabConfig();

  const currentRoute = state.routes[state.index];
  const currentDescriptor = currentRoute ? descriptors[currentRoute.key] : undefined;
  const tabBarStyle = currentDescriptor?.options
    ?.tabBarStyle as { display?: string } | undefined;

  if (tabBarStyle?.display === "none") {
    return <View style={{ height: 0 }} />;
  }

  return (
    <View
      accessibilityRole="tablist"
      // items-stretch, not items-center: with align-items:center each tab
      // Pressable sizes to its own content (~41dp measured) instead of filling
      // the 64dp bar, leaving every tab target below Android's 48dp minimum.
      className="flex-row items-stretch border-t border-border bg-background/90"
      style={{
        paddingBottom: insets.bottom,
        height: TAB_BAR_HEIGHT + insets.bottom,
      }}
    >
      {TAB_CONFIG.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;

        const isFocused = state.routes[state.index]?.name === tab.name;
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

        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={
              descriptor?.options.tabBarAccessibilityLabel ?? tab.label
            }
            testID={descriptor?.options.tabBarButtonTestID}
            className="flex-1 items-center justify-center"
            onPress={onPress}
            onLongPress={onLongPress}
          >
            {isSell ? (
              <View className="items-center justify-center gap-0">
                <View
                  className="items-center justify-center rounded-full bg-foreground"
                  style={{ width: 56, height: 32 }}
                >
                  <Icon
                    as={Plus}
                    className="text-background"
                    size={20}
                    strokeWidth={2}
                  />
                </View>
                <Text
                  className={cn(
                    "mt-1 text-[11px] font-medium",
                    isFocused ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {tab.label}
                </Text>
              </View>
            ) : (
              <View className="items-center justify-center gap-[3px]">
                <Icon
                  as={tab.icon}
                  size={24}
                  strokeWidth={1.8}
                  className={isFocused ? "text-foreground" : "text-muted-foreground"}
                />
                <Text
                  className={cn(
                    "text-[11px] font-medium",
                    isFocused ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {tab.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
