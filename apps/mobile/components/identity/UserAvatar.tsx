import { View } from "react-native";
import { useColorScheme } from "nativewind";
import Svg, { Circle, Path } from "react-native-svg";

import { Photo as Image, usePhotoFailure } from "../../src/media/photoRoute";
import { buildVariantUrl } from "../../src/listings/detail/buildVariantUrl";
import { carAvatarAt, carAvatarTint } from "../../src/identity/carAvatars";

export interface UserAvatarProps {
  /** Diameter in points. */
  size: number;
  /** The User's Assigned Avatar; any number draws a mark. */
  avatarIndex: number;
  /** Object key of the profile photo. The photo shows only when this is set. */
  avatarKey?: string | null;
  /** Address of that photo. */
  avatarUrl?: string | null;
  /**
   * Read by a screen reader as one image. Leave it out where the User's name
   * is beside the avatar: the avatar is then skipped.
   */
  accessibilityLabel?: string;
}

/**
 * A User's avatar at any size: their profile photo, or the car mark the server
 * assigned them on its tinted circle. A photo that is missing or fails to load
 * falls back to the mark, so the circle is never empty.
 */
export function UserAvatar({ size, avatarIndex, avatarKey, avatarUrl, accessibilityLabel }: UserAvatarProps) {
  const { colorScheme } = useColorScheme();
  const candidateUrl = avatarKey ? avatarUrl || buildVariantUrl(avatarKey, "thumbnail") : null;
  const { failed, onError } = usePhotoFailure(candidateUrl);
  const photoUrl = failed ? null : candidateUrl;
  const mark = carAvatarAt(avatarIndex);
  const tint = carAvatarTint(mark, colorScheme === "dark" ? "dark" : "light");
  const glyph = Math.round(size * 0.62);

  return (
    <View
      {...(accessibilityLabel
        ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel }
        : {
            accessible: false,
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
          })}
      className="items-center justify-center overflow-hidden"
      // The size and the tint are data, so they are style values, not classes.
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint.background }}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={onError}
        />
      ) : (
        <Svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke={tint.foreground}
          // Small marks need a heavier line to stay readable.
          strokeWidth={size < 40 ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {mark.paths.map((d) => (
            <Path key={d} d={d} />
          ))}
          {mark.circles.map(([cx, cy, r]) => (
            <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />
          ))}
        </Svg>
      )}
    </View>
  );
}
