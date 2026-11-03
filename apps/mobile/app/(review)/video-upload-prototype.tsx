import { useMemo } from "react";
import { Stack } from "expo-router";
import { View } from "react-native";

import { usePrototypeCopy } from "../../src/video-prototype/copy";
import { createDeterministicLocalVideoAdapter } from "../../src/video-prototype/localAdapter";
import { VideoUploadPrototype } from "../../src/video-prototype/VideoUploadPrototype";

import { SafeScreen } from "@/components/navigation/SafeScreen";
import { Text } from "@/components/ui/text";

/** Expo replaces __DEV__ with false in production bundles. Missing globals deny access. */
export function reviewerPrototypeEnabled(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function DevelopmentPrototype() {
  const adapter = useMemo(createDeterministicLocalVideoAdapter, []);
  return <VideoUploadPrototype adapter={adapter} />;
}

export default function VideoUploadPrototypeRoute() {
  const t = usePrototypeCopy();
  if (!reviewerPrototypeEnabled()) {
    return <SafeScreen>
      <View className="flex-1 justify-center gap-2 p-6">
        <Text variant="h2">{t("deniedTitle")}</Text>
        <Text>{t("denied")}</Text>
      </View>
    </SafeScreen>;
  }
  return <>
    <Stack.Screen options={{ headerShown: false, title: t("title") }} />
    <DevelopmentPrototype />
  </>;
}
