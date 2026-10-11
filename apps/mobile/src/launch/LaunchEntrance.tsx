import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Image, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import splashIcon from "../../assets/images/splash-icon.png";
import { BrandLogo } from "../auth/BrandLogo";

import { Text } from "@/components/ui/text";
import { useReduceMotion } from "@/lib/motion";

const ENTRANCE_MS = 650;
const EXIT_MS = 180;

/** Owns only launch presentation. Startup and navigation continue underneath it. */
export function LaunchEntrance({ ready, children }: PropsWithChildren<{ ready: boolean }>) {
  const reducedMotion = useReduceMotion();
  const [entered, setEntered] = useState(reducedMotion);
  const [laidOut, setLaidOut] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const handedOff = useRef(false);
  const icon = useSharedValue(reducedMotion ? 0 : 1);
  const wordmark = useSharedValue(reducedMotion ? 1 : 0);
  const credit = useSharedValue(reducedMotion ? 1 : 0);
  const opacity = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({ opacity: icon.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmark.value }));
  const creditStyle = useAnimatedStyle(() => ({ opacity: credit.value, transform: [{ translateY: (1 - credit.value) * 4 }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (!laidOut) return;
    if (reducedMotion) {
      icon.value = 0;
      wordmark.value = 1;
      credit.value = 1;
      setEntered(true);
      return;
    }
    icon.value = withTiming(0, { duration: 200 });
    wordmark.value = withDelay(80, withTiming(1, { duration: 460 }));
    credit.value = withDelay(260, withTiming(1, { duration: 300 }));
    // This timer controls the overlay only. It never decides app readiness.
    const timer = setTimeout(() => setEntered(true), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [laidOut, reducedMotion, icon, wordmark, credit]);

  useEffect(() => {
    if (!ready || !entered || dismissed) return;
    if (reducedMotion) {
      setDismissed(true);
      return;
    }
    opacity.value = withTiming(0, { duration: EXIT_MS });
    const timer = setTimeout(() => setDismissed(true), EXIT_MS);
    return () => clearTimeout(timer);
  }, [ready, entered, dismissed, reducedMotion, opacity]);

  return (
    <View className="flex-1">
      {children}
      {!dismissed ? (
        <Animated.View
          testID="launch-entrance"
          pointerEvents="auto"
          className="absolute inset-0 items-center justify-center bg-[#17191D]"
          style={overlayStyle}
          onLayout={() => {
            if (handedOff.current) return;
            handedOff.current = true;
            SplashScreen.hide();
            setLaidOut(true);
          }}
        >
          {/* Destination mounts later; keep the entrance last in the native status-bar stack. */}
          <StatusBar key={ready ? "destination-ready" : "startup"} style="light" />
          <Animated.View style={[StyleSheet.absoluteFill, iconStyle]} className="items-center justify-center">
            {/* Same 160 pt artwork and center as the configured native splash. */}
            <Image source={splashIcon} style={{ width: 160, height: 160 }} />
          </Animated.View>
          <Animated.View style={wordmarkStyle}>
            <BrandLogo width={240} height={44} />
          </Animated.View>
          <Animated.View className="absolute left-0 right-0 items-center" style={[{ top: "50%", marginTop: 42 }, creditStyle]}>
            <Text className="font-sans text-[13px] text-[#AEB4BF]">By Alpha Motors</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}
