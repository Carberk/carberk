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

/**
 * Auto, then Data saver when a rendition fits its 360p cap, then only the
 * renditions this video has, highest first.
 */
export function qualityOptions(qualities: readonly number[]): QualityOption[] {
  const fixed = [...new Set(qualities)]
    .filter((q): q is 240 | 360 | 720 => q === 240 || q === 360 || q === 720)
    .sort((a, b) => b - a)
    .map((height): QualityOption => ({ choice: height, height }));
  const saver: QualityOption[] = fixed.some((option) => (option.height ?? Infinity) <= 360) ? [{ choice: "data-saver" }] : [];
  return [{ choice: "auto" }, ...saver, ...fixed];
}

/**
 * Variant playlist URLs by rendition tier, parsed from a master playlist.
 * The worker lists variants in ascending tier order, so the i-th variant is
 * the i-th granted quality. RESOLUTION is not used: rotated phone clips
 * come out with sizes (202x360, 404x720) that name no tier. When the
 * playlist and the qualities disagree, nothing is mapped.
 */
export function parseMasterPlaylist(text: string, qualities: readonly number[]): Map<number, string> {
  const uris: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const uri = lines[i + 1]?.trim();
    if (uri && !uri.startsWith("#")) uris.push(uri);
  }
  const tiers = [...new Set(qualities)].sort((a, b) => a - b);
  if (tiers.length !== uris.length) return new Map();
  return new Map(uris.map((uri, index) => [tiers[index] ?? 0, uri]));
}

/**
 * The URL to load for a quality choice: the master for Auto, otherwise this
 * grant's variant (Data saver: the highest at or under 360p). Undefined
 * when no variant fits, so a manual choice never silently plays the master.
 */
export function variantUrlFor(
  choice: VideoQualityChoice,
  masterUrl: string,
  variants: ReadonlyMap<number, string>,
): string | undefined {
  if (choice === "auto") return masterUrl;
  if (choice === "data-saver") {
    const capped = [...variants.keys()].filter((h) => h <= 360).sort((a, b) => b - a)[0];
    return capped === undefined ? undefined : variants.get(capped);
  }
  return variants.get(choice);
}
