import { useLocalSearchParams } from "expo-router";

import { ListingVideoPlayer } from "../../../../src/listings/video/ListingVideoPlayer";
import type {
  PlaybackAudience,
  PlaybackTargetType,
} from "../../../../src/listings/video/useListingPlayback";
import { useSafeBack } from "../../../../src/navigation/useSafeBack";

const AUDIENCES: PlaybackAudience[] = ["viewer", "owner-preview", "moderator"];

/**
 * Dedicated player route (#1046). Play buttons (#1051) link here; closing
 * returns to wherever the player was opened from.
 */
export default function ListingVideoPlayerScreen() {
  const { id, audience, type } = useLocalSearchParams<{
    id: string;
    audience?: string;
    type?: string;
  }>();
  const goBack = useSafeBack();

  return (
    <ListingVideoPlayer
      audience={AUDIENCES.includes(audience as PlaybackAudience) ? (audience as PlaybackAudience) : "viewer"}
      type={type === "draft" ? (type as PlaybackTargetType) : "listing"}
      id={id ?? ""}
      onClose={goBack}
    />
  );
}
