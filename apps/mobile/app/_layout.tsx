import "../global.css";
// Registers NativeWind's className->style bridge for expo-image. Must run
// before any screen renders an <Image className="...">.
import "../lib/expo-image-interop";
// Loads the motion tokens and Reanimated's logger setting before the first screen renders.
import "../lib/motion";

import { Stack } from "expo-router";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  useColorScheme as useOsColorScheme,
  type AppStateStatus,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import type { NetInfoState } from "@react-native-community/netinfo";

import { NAV_THEME } from "../lib/theme";
import { ApiError } from "../src/api/client";
import { subscribeAuthSession } from "../src/auth/session";
import { pauseVideoUploads, reconcileVideoUploadOwner } from "../src/listings/videoEditor/VideoUploadTasks";
import { useAuth } from "../src/auth/useAuth";
import { useMyDrafts } from "../src/api/listings/useMyDrafts";
import { useMyListings } from "../src/api/listings/useMyListings";
import { useGlobalConversationSocket } from "../src/conversations/socket/useGlobalConversationSocket";
import { cleanupOrphanDraftDirs } from "../src/listings/uploadStaging/orphanCleanup";
import { usePushTokenSync } from "../src/notifications/usePushTokenSync";
import { initI18n } from "../src/i18n";
import { localeStore } from "../src/locale/localeStore";
import { AppNavigationEffects } from "../src/navigation/AppNavigationEffects";
import { OnboardingLaunch } from "../src/onboarding/OnboardingLaunch";
import {
  resolveOnboardingGate,
  type OnboardingDecision,
} from "../src/onboarding/onboardingGate";
import { LaunchEntrance } from "../src/launch/LaunchEntrance";
import { listingViewInstallId, listingViewsEnabled } from "../src/listings/detail/listingViewIdentity";
import { startNativeMeasurement } from "../src/measurement/nativeMeasurement";
import { themeStore } from "../src/theme/themeStore";

import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Keep the native launch screen visible until fonts and locale resources are
// ready. Expo recommends calling this in module scope so the native screen
// cannot auto-hide before React mounts.
void SplashScreen.preventAutoHideAsync();

// Deep links and publish results go Back to tabs. Onboarding is pushed above
// the tabs on a first launch (`OnboardingLaunch`); it is never the first route.
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Don't retry auth failures or contract violations
        if (error instanceof ApiError) {
          if (error.status === 401 || error.code === "CONTRACT_VIOLATION") {
            return false;
          }
          if (error.status >= 400 && error.status < 500) {
            return false;
          }
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
  if (status !== "active") void pauseVideoUploads();
}

function isOnline(state: NetInfoState): boolean {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return false;
  }
  // isInternetReachable can be null while the OS is still deciding.
  // Do not pause all queries during that unknown window.
  return true;
}

function AuthenticatedOrphanCleanup() {
  const {
    data: draftsData,
    isPending: draftsPending,
    isSuccess: draftsSuccess,
  } = useMyDrafts();
  const {
    data: listingsData,
    isPending: listingsPending,
    isSuccess: listingsSuccess,
  } = useMyListings();
  const cleanupRan = useRef(false);

  useEffect(() => {
    if (
      cleanupRan.current ||
      draftsPending ||
      listingsPending ||
      !draftsSuccess ||
      !listingsSuccess
    ) {
      return;
    }
    cleanupRan.current = true;

    const draftIds = new Set(draftsData?.items.map((draft) => draft.id) ?? []);
    const listingIds = new Set(
      listingsData?.items.map((listing) => listing.id) ?? [],
    );

    void cleanupOrphanDraftDirs(draftIds, listingIds).catch((error) => {
      console.warn("Failed to clean listing staging dirs", error);
    });
  }, [
    draftsData,
    draftsPending,
    draftsSuccess,
    listingsData,
    listingsPending,
    listingsSuccess,
  ]);

  return null;
}

function OrphanCleanupOnBoot() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated !== true) {
    return null;
  }

  return <AuthenticatedOrphanCleanup />;
}

function GlobalConversationSocket() {
  useGlobalConversationSocket();
  return null;
}

// The signed-in app listens for new Messages on every screen, so the Messages
// tab badge and list update live. The shared socket disconnects on sign-out.
function GlobalConversationSocketOnBoot() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated !== true) {
    return null;
  }

  return <GlobalConversationSocket />;
}

function PushTokenSync() {
  usePushTokenSync();
  return null;
}

// A granted-but-unregistered push token (first attempt failed, token rotated)
// is retried on launch and on return to the foreground. The hook never
// prompts; the one-shot prompt stays with the first chat action.
function PushTokenSyncOnBoot() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated !== true) {
    return null;
  }

  return <PushTokenSync />;
}

export default function RootLayout() {
  useEffect(startNativeMeasurement, []);
  const osColorScheme = useOsColorScheme();
  const { colorScheme: appliedScheme, setColorScheme } = useNativeWindColorScheme();
  const theme = themeStore((state) => state.theme);
  const hydrateTheme = themeStore((state) => state.hydrate);
  const resolvedScheme =
    theme === "system" ? (osColorScheme ?? "light") : theme;
  const scheme = resolvedScheme === "dark" ? "dark" : "light";
  const [i18nReady, setI18nReady] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [startupAppearanceReady, setStartupAppearanceReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "Geist-Light": require("../assets/fonts/Geist-Light.ttf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "Geist-Regular": require("../assets/fonts/Geist-Regular.ttf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "Geist-Medium": require("../assets/fonts/Geist-Medium.ttf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "Geist-SemiBold": require("../assets/fonts/Geist-SemiBold.ttf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "Geist-Bold": require("../assets/fonts/Geist-Bold.ttf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "GeistMono-Regular": require("../assets/fonts/GeistMono-Regular.ttf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "GeistMono-Medium": require("../assets/fonts/GeistMono-Medium.ttf"),
  });
  const [onboarding, setOnboarding] = useState<OnboardingDecision | null>(null);
  const appReady = (fontsLoaded || !!fontError) && i18nReady && startupAppearanceReady && onboarding !== null;

  useEffect(() => {
    // Started first: the gate reads storage before anything in this launch
    // can write to it. It answers within a second.
    void resolveOnboardingGate().then((decision) => {
      setOnboarding(decision);
      // Preserve the fresh-install storage check before creating this identifier.
      if (listingViewsEnabled()) {
        void listingViewInstallId().catch(() => { /* Counting must never block launch. */ });
      }
    });
    void localeStore.getState().hydrate()
      .catch((error) => console.warn("[launch] locale storage unavailable", error))
      .then(() => initI18n())
      .catch((error) => console.warn("[launch] locale initialization failed", error))
      .finally(() => setI18nReady(true));
    void hydrateTheme()
      .catch((error) => console.warn("[launch] theme storage unavailable", error))
      .finally(() => setThemeReady(true));
  }, [hydrateTheme]);

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);
  useEffect(() => {
    // Only startup waits for the native styling system. Later theme changes
    // update the mounted screens without resetting navigation or local drafts.
    if (themeReady && appliedScheme === scheme) setStartupAppearanceReady(true);
  }, [themeReady, appliedScheme, scheme]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", onAppStateChange);
    const unsubscribe = subscribeAuthSession(() => { void reconcileVideoUploadOwner(); });
    return () => { sub.remove(); unsubscribe(); };
  }, []);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      onlineManager.setOnline(isOnline(state));
    });

    const unsub = NetInfo.addEventListener((state) => {
      onlineManager.setOnline(isOnline(state));
    });

    return () => unsub();
  }, []);

  // The presentation mounts while startup runs; readiness alone mounts navigation.
  if (!appReady) {
    return <LaunchEntrance ready={false} />;
  }

  return (
    // Gesture Handler needs one root view above every gesture (the tab bar's slide, the photo zoom).
    <LaunchEntrance ready={true}>
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <AppNavigationEffects />
      <ThemeProvider value={NAV_THEME[scheme]}>
        <ToastProvider>
          <OrphanCleanupOnBoot />
          <GlobalConversationSocketOnBoot />
          <PushTokenSyncOnBoot />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <SafeAreaProvider>
            <ErrorBoundary>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                {/* Opens under the launch screen, so it does not animate in. No swipe back to Home. */}
                <Stack.Screen
                  name="(onboarding)"
                  options={{ animation: "none", gestureEnabled: false }}
                />
                <Stack.Screen name="(public)" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="conversations/[id]" />
                <Stack.Screen name="conversations/open-listing" />
                <Stack.Screen name="(auth)/phone" />
                <Stack.Screen name="(auth)/email" />
                <Stack.Screen name="(auth)/otp" />
              </Stack>
              <OnboardingLaunch decision={onboarding} />
            </ErrorBoundary>
          </SafeAreaProvider>
          <PortalHost />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
    </LaunchEntrance>
  );
}
