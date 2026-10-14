import { UploadsSchemas } from "@auto-tm/contracts";

const MEDIA_URL = (
  process.env["EXPO_PUBLIC_MEDIA_URL"] ?? ""
).replace(/\/$/, "");

function inferBucket(key: string): string {
  return key.includes(".mp4") || key.includes(".mov")
    ? "listing-videos"
    : "listing-photos";
}

export function buildVariantUrl(
  key: string,
  variant: "thumbnail" | "list" | "detail" | "fullscreen",
): string {
  if (!MEDIA_URL) return "";
  const bucket = inferBucket(key);
  if (key.endsWith(".mp4") || key.endsWith(".mov")) {
    return `${MEDIA_URL}/${bucket}/${key}`;
  }
  const base = key.replace(/\/original\.(jpg|webp|jpeg)$/, "");
  return `${MEDIA_URL}/${bucket}/${base}/${variant}.webp?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}`;
}

export function buildOriginalUrl(key: string): string {
  if (!MEDIA_URL) return "";
  return `${MEDIA_URL}/${inferBucket(key)}/${key}`;
}

type PhotoVariant = "thumbnail" | "list" | "detail" | "fullscreen";

/**
 * The one address of a Listing photo at a size: the URL the API sent for it,
 * or else the one built from its key. Results cards, Listing detail's strip,
 * its preview and the photo viewer all load a photo through this, so a size
 * one of them decoded is the same image cache entry for the others (#816,
 * #864) and a tile can hand its photo to the viewer without a reload (#869).
 */
export function listingPhotoUrl(
  photo: { key: string; variants?: Partial<Record<PhotoVariant, string>> | undefined },
  variant: PhotoVariant,
): string {
  return photo.variants?.[variant] || buildVariantUrl(photo.key, variant);
}
