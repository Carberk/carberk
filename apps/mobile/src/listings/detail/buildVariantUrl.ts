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
