import { Stack } from "expo-router";
import { Text, View } from "react-native";

import { VideoUploadPrototype } from "../../src/video-prototype/VideoUploadPrototype";

import { SafeScreen } from "@/components/navigation/SafeScreen";

/** Expo replaces __DEV__ with false in production bundles. */
export function reviewerPrototypeEnabled(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export default function VideoUploadPrototypeRoute() {
  if (!reviewerPrototypeEnabled()) {
    return (
      <SafeScreen>
        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "700" }}>
            Review prototype unavailable
          </Text>
          <Text style={{ fontSize: 16, marginTop: 8 }}>
            This local Listing video prototype is disabled in production builds.
          </Text>
        </View>
      </SafeScreen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: "Listing video prototype" }} />
      <VideoUploadPrototype />
    </>
  );
}
