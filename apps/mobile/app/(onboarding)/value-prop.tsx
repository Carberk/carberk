import { router, useIsFocused } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  BackHandler,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type Text as NativeText,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import { HOME_HREF } from "../../src/navigation/homeHref";
import { setOnboardingCompleted } from "../../src/onboarding/onboardingFlag";

import { IllustrationPanel } from "@/components/onboarding/IllustrationPanel";
import { PagerDots } from "@/components/onboarding/PagerDots";
import { ONBOARDING_MAX_WIDTH_CLASS, useOnboardingLayout } from "@/components/onboarding/useOnboardingLayout";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Enter } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Text } from "@/components/ui/text";
import { duration, useReduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** What the app does today, one page each. The last page carries the button into Home. */
const PAGES = [
  { illustration: "find", title: "findTitle", body: "findBody" },
  { illustration: "chat", title: "chatTitle", body: "chatBody" },
] as const;
const LAST = PAGES.length - 1;

export default function ValuePropScreen() {
  const { t } = useTranslation("onboarding");
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const { compact, columnWidth } = useOnboardingLayout();
  const [pageWidth, setPageWidth] = useState(columnWidth);
  const [index, setIndex] = useState(0);
  const pager = useRef<Animated.ScrollView>(null);
  const titles = useRef<(NativeText | null)[]>([]);
  const offset = useSharedValue(0);
  // A second tap while the pages are still sliding must not act on the next page's button.
  const settlesAt = useRef(0);
  const leaving = useRef(false);

  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.x;
  });

  const goTo = useCallback(
    (next: number) => {
      setIndex(next);
      pager.current?.scrollTo({ x: next * pageWidth, animated: !reduceMotion });
      if (reduceMotion) offset.value = next * pageWidth;
      settlesAt.current = reduceMotion ? 0 : Date.now() + duration.slow;
    },
    [offset, pageWidth, reduceMotion],
  );

  // A page change moves the screen reader to its title. Running in an effect
  // on `index`, not in goTo, the target page is already unhidden from the
  // accessibility tree when the focus request fires.
  const announcedIndex = useRef(0);
  useEffect(() => {
    if (announcedIndex.current === index) return;
    announcedIndex.current = index;
    const title = titles.current[index];
    if (title) AccessibilityInfo.sendAccessibilityEvent?.(title, "focus");
  }, [index]);

  // Skip and the last button end onboarding the same way. Home is already
  // underneath, so this takes the onboarding screens off the stack: nothing
  // can go Back to them. A failed write only means onboarding may show once more.
  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    void setOnboardingCompleted().catch((error: unknown) => {
      console.warn("[onboarding] could not store the onboarding flag", error);
    });
    router.dismissTo(HOME_HREF);
  }, []);

  const back = useCallback(() => {
    if (index > 0) goTo(index - 1);
    else router.back();
  }, [goTo, index]);

  const onMainPress = () => {
    if (Date.now() < settlesAt.current) return;
    if (index === LAST) leave();
    else goTo(index + 1);
  };

  const onSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setIndex(Math.max(0, Math.min(LAST, page)));
  };

  useEffect(() => {
    if (!focused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back, focused]);

  // Keep the current page in view when the window changes width (rotation, split screen).
  const laidOutWidth = useRef(pageWidth);
  useEffect(() => {
    if (laidOutWidth.current === pageWidth) return;
    laidOutWidth.current = pageWidth;
    pager.current?.scrollTo({ x: index * pageWidth, animated: false });
    offset.value = index * pageWidth;
  }, [index, offset, pageWidth]);

  const backLabel = t("common:back");
  const skipLabel = t("common:skip");
  const mainLabel = index === LAST ? t("finish") : t("common:next");

  return (
    <SafeScreen>
      <View className={cn("w-full flex-1 self-center", ONBOARDING_MAX_WIDTH_CLASS)}>
        <View className="h-12 flex-row items-center justify-between px-4">
          <Button
            variant="secondary"
            size="icon"
            hitSlop={2}
            onPress={back}
            accessibilityLabel={backLabel}
          >
            <Icon as={ChevronLeft} className="size-[22px] text-foreground" />
          </Button>
          {/* Skip is only on the first page. Its space stays, so the bar does not jump. */}
          {index === 0 ? (
            <PressableScale
              onPress={leave}
              accessibilityRole="button"
              accessibilityLabel={skipLabel}
              className="min-h-12 min-w-12 items-center justify-center px-2"
            >
              <Text
                maxFontSizeMultiplier={1.3}
                className="text-callout font-medium text-muted-foreground"
              >
                {skipLabel}
              </Text>
            </PressableScale>
          ) : (
            <View className="min-h-12 min-w-12" />
          )}
        </View>

        <Animated.ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onSwipeEnd}
          onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
          testID="onboarding-pager"
          className="flex-1"
        >
          {PAGES.map((page, pageIndex) => {
            const current = pageIndex === index;
            const wordsClassName = cn("px-6", !compact && "min-h-[146px]");
            const words = (
              <>
                <Text
                  ref={(node) => {
                    // The app's Text types its ref as the component class; the node is the instance.
                    titles.current[pageIndex] = node as unknown as NativeText | null;
                  }}
                  accessibilityRole="header"
                  className="font-heading text-title font-bold text-foreground"
                >
                  {t(page.title)}
                </Text>
                <Text className="mt-3 text-body text-muted-foreground">{t(page.body)}</Text>
              </>
            );

            return (
              <View
                key={page.illustration}
                // Only the page in view is read out.
                accessibilityElementsHidden={!current}
                importantForAccessibility={current ? "auto" : "no-hide-descendants"}
                style={{ width: pageWidth }}
              >
                {!compact && (
                  <IllustrationPanel name={page.illustration} enter={pageIndex === 0} />
                )}
                {/* Sized by its content; it scrolls only when large text or a short window leaves no room. */}
                <ScrollView
                  alwaysBounceVertical={false}
                  showsVerticalScrollIndicator={false}
                  className={cn(compact ? "flex-1" : "shrink grow-0")}
                >
                  {/* The first page arrives with the screen; the next one slides in with the pager. */}
                  {pageIndex === 0 ? (
                    <Enter order={1} className={wordsClassName}>
                      {words}
                    </Enter>
                  ) : (
                    <View className={wordsClassName}>{words}</View>
                  )}
                </ScrollView>
              </View>
            );
          })}
        </Animated.ScrollView>

        <View className="px-6 pb-4 pt-6">
          <PagerDots
            count={PAGES.length}
            offset={offset}
            pageWidth={pageWidth}
            label={t("pageOf", { current: index + 1, total: PAGES.length })}
          />
          <Button
            variant="brand"
            size="pill"
            onPress={onMainPress}
            accessibilityLabel={mainLabel}
            className="mt-5"
          >
            <Text maxFontSizeMultiplier={1.3}>{mainLabel}</Text>
          </Button>
        </View>
      </View>
    </SafeScreen>
  );
}
