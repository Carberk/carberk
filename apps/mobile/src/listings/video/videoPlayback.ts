/**
 * Pure playback choices for the Listing video player (#1046).
 * The server returns one HLS master URL plus the renditions it made;
 * manual quality picks a variant playlist from that master, Auto keeps
 * the master so the native player adapts on its own.
 */

export type VideoQualityChoice = "auto" | "data-saver" | 240 | 360 | 720;

export interface QualityOption {
  choice: VideoQualityChoice;
  /** Rendition height for a fixed quality; absent for Auto/Data saver. */
  height?: 240 | 360 | 720;
}

/** Auto, Data saver, then only the renditions this video has, highest first. */
export function qualityOptions(qualities: readonly number[]): QualityOption[] {
  const fixed = [...new Set(qualities)]
    .filter((q): q is 240 | 360 | 720 => q === 240 || q === 360 || q === 720)
    .sort((a, b) => b - a)
    .map((height): QualityOption => ({ choice: height, height }));
  return [{ choice: "auto" }, { choice: "data-saver" }, ...fixed];
}

/**
 * Variant playlist URLs by rendition tier, parsed from a master playlist.
 * The tier is the short side: the worker scales portrait video to
 * `tier` wide (`360x640` is the 360 tier), landscape to `tier` high.
 */
export function parseMasterPlaylist(text: string): Map<number, string> {
  const variants = new Map<number, string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const resolution = /RESOLUTION=(\d+)x(\d+)/.exec(line);
    const uri = lines[i + 1]?.trim();
    if (resolution && uri && !uri.startsWith("#")) {
      variants.set(Math.min(Number(resolution[1]), Number(resolution[2])), uri);
    }
  }
  return variants;
}

/**
 * The URL to load for a quality choice. Data saver caps at 360p and falls
 * back to the lowest rendition (or the master) when nothing fits the cap.
 */
export function variantUrlFor(
  choice: VideoQualityChoice,
  masterUrl: string,
  variants: ReadonlyMap<number, string>,
): string {
  if (choice === "auto") return masterUrl;
  if (choice === "data-saver") {
    const capped = [...variants.keys()].filter((h) => h <= 360).sort((a, b) => b - a)[0];
    const lowest = [...variants.keys()].sort((a, b) => a - b)[0];
    return variants.get(capped ?? lowest ?? 0) ?? masterUrl;
  }
  return variants.get(choice) ?? masterUrl;
}
