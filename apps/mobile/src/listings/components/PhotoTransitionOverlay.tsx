import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { containRect, coverRect, dragRect, lerpRect, type PhotoGeometry, type PhotoRect } from "./photoTransitionMath";

/** One absolute clip is the documented layout-animation exception in 76-motion. */
export function PhotoTransitionOverlay({ geometry, page, progress, drag, onDisplay }: {
  geometry: PhotoGeometry; page: PhotoRect; progress: SharedValue<number>;
  drag: SharedValue<{ x: number; y: number }>; onDisplay: () => void;
}) {
  const target = containRect(page, geometry.ratio);
  const clipStyle = useAnimatedStyle(() => {
    const destination = dragRect(target, drag.value.x, drag.value.y, page.height);
    const clip = lerpRect(geometry.visible, destination, progress.value);
    return {
      left: clip.x, top: clip.y, width: clip.width, height: clip.height,
      borderTopLeftRadius: geometry.radii[0] * (1 - progress.value),
      borderTopRightRadius: geometry.radii[1] * (1 - progress.value),
      borderBottomRightRadius: geometry.radii[2] * (1 - progress.value),
      borderBottomLeftRadius: geometry.radii[3] * (1 - progress.value),
    };
  });
  const imageStyle = useAnimatedStyle(() => {
    const destination = dragRect(target, drag.value.x, drag.value.y, page.height);
    const clip = lerpRect(geometry.visible, destination, progress.value);
    const photo = lerpRect(coverRect(geometry.tile, geometry.ratio), destination, progress.value);
    return {
      left: page.x - clip.x, top: page.y - clip.y,
      transform: [
        { translateX: photo.x + photo.width / 2 - target.x - target.width / 2 },
        { translateY: photo.y + photo.height / 2 - target.y - target.height / 2 },
        { scale: photo.width / target.width },
      ],
    };
  });
  return (
    <Animated.View testID="photo-transition-overlay" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.clip, clipStyle]}>
      <Animated.View style={[{ position: "absolute", width: page.width, height: page.height }, imageStyle]}>
        <Image source={{ uri: geometry.uri }} contentFit="contain" style={StyleSheet.absoluteFill} cachePolicy="memory-disk" transition={0} onDisplay={onDisplay} />
      </Animated.View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({ clip: { position: "absolute", overflow: "hidden" } });
