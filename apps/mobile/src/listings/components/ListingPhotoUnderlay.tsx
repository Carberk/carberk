import { StyleSheet } from "react-native";
import { Image } from "expo-image";

import { isAboutFourByThree } from "./thumbHashShape";

/**
 * Where a photo sits in Listing detail's 4:3 frame (#864). A photo wider than
 * the frame rests on the title below it, and its spare height goes to the top,
 * behind the status bar and Back. A taller photo stays centred between side
 * bands.
 */
export const LISTING_PHOTO_POSITION = "bottom";

/**
 * What Listing detail's frame shows under a photo until that photo loads, so
 * nothing in the frame moves when it does. The card's `list` size is a 3:2
 * crop of the photo's centre. Only for an about 4:3 photo does that crop sit,
 * whole at the frame's centre, where that part of the photo lands, with the
 * photo's blurred colours filling the frame around it. Any other shape shows
 * only its blurred colours, at the shape its ThumbHash gives and pinned as the
 * photo is. Without a hash the shape is unknown, and the crop shows as before.
 */
export function ListingPhotoUnderlay({
  thumbHash,
  listUri,
}: {
  thumbHash?: string | null | undefined;
  /** The card's cached `list` size, for the cover only. */
  listUri?: string | undefined;
}) {
  const fourByThree = thumbHash ? isAboutFourByThree(thumbHash) : true;
  return (
    <>
      {thumbHash && (
        <Image
          source={{ thumbhash: thumbHash }}
          style={StyleSheet.absoluteFill}
          contentFit={fourByThree ? "cover" : "contain"}
          contentPosition={fourByThree ? undefined : LISTING_PHOTO_POSITION}
        />
      )}
      {listUri && fourByThree && (
        <Image
          source={{ uri: listUri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      )}
    </>
  );
}
