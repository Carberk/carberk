import { Image } from "expo-image";
import { Play } from "lucide-react-native";
import { View } from "react-native";
import { useEffect, useState } from "react";

import { PhotoChip } from "../feed/ListingPhoto";
import { videoRouteHeaders } from "../../api/routes";

import { formatMmss } from "./listingVideo";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const PLAY_SIZE = { small: "size-6", regular: "size-14", large: "size-[72px]" } as const;
const GLYPH_SIZE = { small: "size-3", regular: "size-6", large: "size-8" } as const;

export function VideoCover({
  uri,
  durationMs,
  size = "regular",
  contentFit = "cover",
}: {
  uri?: string | undefined;
  durationMs: number;
  /** `small` is a thumbnail: a little Play mark and no duration. */
  size?: keyof typeof PLAY_SIZE;
  contentFit?: "cover" | "contain";
}) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> }>();
  useEffect(() => {
    let live = true;
    setSource(undefined);
    if (uri) {
      void videoRouteHeaders(uri).then(headers => {
        if (live) setSource({ uri, headers });
      }).catch(() => {});
    }
    return () => { live = false; };
  }, [uri]);
  return (
    <View className="h-full w-full overflow-hidden bg-black" pointerEvents="none">
      {source?.uri === uri && source ? (
        <Image testID="video-cover-image" source={source} style={FILL} contentFit={contentFit} cachePolicy="none" />
      ) : null}
      <View className="absolute inset-0 items-center justify-center">
        <View testID="video-cover-play" className={cn("items-center justify-center rounded-full bg-black/60", PLAY_SIZE[size])}>
          <Icon as={Play} className={cn("fill-white text-white", GLYPH_SIZE[size])} strokeWidth={2} />
        </View>
      </View>
      {size === "small" ? null : <PhotoChip label={formatMmss(durationMs / 1000)} className="bottom-2 right-2" />}
    </View>
  );
}

const FILL = { width: "100%", height: "100%" } as const;
