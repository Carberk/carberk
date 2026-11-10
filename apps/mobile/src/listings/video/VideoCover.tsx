import { Image } from "expo-image";
import { Play } from "lucide-react-native";
import { View } from "react-native";

import { PhotoChip } from "../feed/ListingPhoto";

import { formatMmss } from "./listingVideo";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const PLAY_SIZE = { small: "size-6", regular: "size-14", large: "size-[72px]" } as const;
const GLYPH_SIZE = { small: "size-3", regular: "size-6", large: "size-8" } as const;

/**
 * A Ready video drawn as its cover (#1051): the cover image, a round Play
 * mark and the duration, in whatever frame the caller sizes. It never loads
 * or plays the video; the frame's caller owns the tap and its label.
 *
 * Cover URLs carry a five-minute grant, so they are kept in memory only: a
 * disk cache would outlive the authorisation it was served under (ADR-0112).
 * Without a cover yet, the frame stays dark with Play.
 */
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
  return (
    <View className="h-full w-full overflow-hidden bg-black" pointerEvents="none">
      {uri ? (
        <Image testID="video-cover-image" source={{ uri }} style={FILL} contentFit={contentFit} cachePolicy="memory" />
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
