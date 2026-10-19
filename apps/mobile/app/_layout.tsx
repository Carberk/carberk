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
  Platform,
  useColorScheme as useOsColorScheme,
  type AppStateStatus,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import type { NetInfoState } from "@react-native-community/netinfo";

import { NAV_THEME } from "../lib/theme";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/useAuth";
import { useMyDrafts } from "../src/api/listings/useMyDrafts";
import { useMyListings } from "../src/api/listings/useMyListings";
import { cleanupOrphanDraftDirs } from "../src/listings/uploadStaging/orphanCleanup";
import { initI18n } from "../src/i18n";
import { localeStore } from "../src/locale/localeStore";
import { AppNavigationEffects } from "../src/navigation/AppNavigationEffects";
import { themeStore } from "../src/theme/themeStore";

import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Keep the native launch screen visible until fonts and locale resources are
// ready. Expo recommends calling this in module scope so the native screen
// cannot auto-hide before React mounts.
void SplashScreen.preventAutoHideAsync();

// Start first-time users in the onboarding flow. Returning users are
// redirected to the feed from the splash screen once the flag is read.
export const unstable_settings = {
  initialRouteName: "(onboarding)",
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

export default function RootLayout() {
  const osColorScheme = useOsColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();
  const theme = themeStore((state) => state.theme);
  const hydrateTheme = themeStore((state) => state.hydrate);
  const resolvedScheme =
    theme === "system" ? (osColorScheme ?? "light") : theme;
  const scheme = resolvedScheme === "dark" ? "dark" : "light";
  const [i18nReady, setI18nReady] = useState(false);

  const [fontsLoaded] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "UberMove-Bold": require("../assets/fonts/UberMoveBold.otf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "UberMove-Medium": require("../assets/fonts/UberMoveMedium.otf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "UberMoveText-Bold": require("../assets/fonts/UberMoveTextBold.otf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "UberMoveText-Light": require("../assets/fonts/UberMoveTextLight.otf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "UberMoveText-Medium": require("../assets/fonts/UberMoveTextMedium.otf"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    "UberMoveText-Regular": require("../assets/fonts/UberMoveTextRegular.otf"),
    ...(Platform.OS === "ios"
      ? {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          "UberMoveMono-Medium": require("../assets/fonts/UberMoveMono-Medium.ttf"),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          "UberMoveMono-Regular": require("../assets/fonts/UberMoveMono-Regular.ttf"),
        }
      : {}),
  });
  const appReady = fontsLoaded && i18nReady;

  useEffect(() => {
    void localeStore.getState().hydrate().then(() => {
      void initI18n().then(() => {
        setI18nReady(true);
      });
    });
    void hydrateTheme();
  }, [hydrateTheme]);

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (appReady) {
      SplashScreen.hide();
    }
  }, [appReady]);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      onlineManager.setOnline(isOnline(state));
    });

    const unsub = NetInfo.addEventListener((state) => {
      onlineManager.setOnline(isOnline(state));
    });

    return () => unsub();
  }, []);

  if (!appReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppNavigationEffects />
      <ThemeProvider value={NAV_THEME[scheme]}>
        <ToastProvider>
          <OrphanCleanupOnBoot />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <SafeAreaProvider>
            <ErrorBoundary>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(onboarding)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(public)" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="conversations/[id]" />
                <Stack.Screen name="conversations/open-listing" />
                <Stack.Screen name="(auth)/phone" />
                <Stack.Screen name="(auth)/email" />
                <Stack.Screen name="(auth)/otp" />
              </Stack>
            </ErrorBoundary>
          </SafeAreaProvider>
          <PortalHost />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
