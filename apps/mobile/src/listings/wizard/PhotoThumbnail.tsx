import { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { ImageIcon, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import type { StagedPhoto } from "../uploadStaging/types";
import { getPhotoUri } from "../uploadStaging/photoUri";

import { photoPosition, photoTileDescription } from "./photoLabels";
import { getDragTargetIndex, getPhotoTileSize, shiftedIndex, slotOffset } from "./photoGridLayout";
import { PhotoStateOverlay } from "./PhotoStateOverlay";

import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

const LONG_PRESS_MS = 250;
const SHIFT_MS = 150;

/** The grid's one drag, on the UI thread. `from` is -1 while nothing is held. */
export interface PhotoDrag {
  from: SharedValue<number>;
  /** The slot the held photo is over. */
  to: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
}

interface PhotoThumbnailProps {
  photo: StagedPhoto;
  index: number;
  total: number;
  onRemove: (photoId: string) => void;
  /** A tap on the tile: open the photo's action sheet. */
  onOpenActions: (photoId: string) => void;
  drag: PhotoDrag;
  dragEnabled: boolean;
  onDragStart: () => void;
  /** The finger lifted with the photo from `fromIndex` over slot `toIndex`. */
  onDrop: (fromIndex: number, toIndex: number) => void;
}

export function PhotoThumbnail({
  photo,
  index,
  total,
  onRemove,
  onOpenActions,
  drag,
  dragEnabled,
  onDragStart,
  onDrop,
}: PhotoThumbnailProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [imageFailed, setImageFailed] = useState(false);
  const uri = getPhotoUri(photo);
  const tileSize = getPhotoTileSize(width);

  // Held for a moment, the photo follows the finger anywhere in the grid, and
  // the photos between its slot and the one under it move aside (#820). Once
  // the pan is active, the tile's Pressable is cancelled, so no tap follows.
  const pan = Gesture.Pan()
    .enabled(dragEnabled)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      drag.from.value = index;
      drag.to.value = index;
      drag.x.value = 0;
      drag.y.value = 0;
      scheduleOnRN(onDragStart);
    })
    .onUpdate((event) => {
      drag.x.value = event.translationX;
      drag.y.value = event.translationY;
      drag.to.value = getDragTargetIndex({
        fromIndex: index,
        dx: event.translationX,
        dy: event.translationY,
        count: total,
        tileSize,
      });
    })
    .onFinalize(() => {
      // Also runs after a tap or a scroll that never became a drag.
      if (drag.from.value !== index) return;
      scheduleOnRN(onDrop, index, drag.to.value);
    });

  const dragStyle = useAnimatedStyle(() => {
    if (drag.from.value === index) {
      return {
        zIndex: 10,
        opacity: 0.9,
        transform: [{ translateX: drag.x.value }, { translateY: drag.y.value }, { scale: 1.06 }],
      };
    }
    // Back in place at once when the drag ends, as the grid takes the new order.
    if (drag.from.value < 0) {
      return { zIndex: 0, opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    }
    const home = slotOffset(index, tileSize);
    const slot = slotOffset(shiftedIndex(index, drag.from.value, drag.to.value), tileSize);
    return {
      zIndex: 0,
      opacity: 1,
      transform: [
        { translateX: withTiming(slot.x - home.x, { duration: SHIFT_MS }) },
        { translateY: withTiming(slot.y - home.y, { duration: SHIFT_MS }) },
        { scale: 1 },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
    <Animated.View
      key={photo.photoId}
      className="relative overflow-hidden rounded-lg bg-muted"
      style={[{ width: tileSize, height: tileSize }, dragStyle]}
    >
      {/* A tap opens the sheet; the long-press drag is the pan above. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={photoTileDescription(t, photo, index, total)}
        onPress={() => onOpenActions(photo.photoId)}
        style={StyleSheet.absoluteFillObject}
      >
        {uri && !imageFailed ? (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Icon as={ImageIcon} className="size-6 text-muted-foreground" />
          </View>
        )}
      </Pressable>

      {index === 0 && (
        <View
          className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text className="text-micro font-medium text-white">{t("cover")}</Text>
        </View>
      )}

      {/* The tile's label already says the state, so the overlay is for the eye only. */}
      <View
        className="absolute inset-0"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <PhotoStateOverlay photo={photo} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("remove")}: ${photoPosition(t, index, total)}`}
        className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => onRemove(photo.photoId)}
      >
        <Icon as={X} className="size-4 text-white" />
      </Pressable>
    </Animated.View>
    </GestureDetector>
  );
}
