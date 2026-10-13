/**
 * A photo's approximate width / height, read from its base64 ThumbHash header.
 * Ported from `thumbHashToApproximateAspectRatio` in thumbhash 0.1.1, which
 * the API uses to make the hashes. Undefined when the hash is too short.
 */
export function thumbHashAspectRatio(hash: string): number | undefined {
  let bytes: string;
  try {
    bytes = atob(hash);
  } catch {
    return undefined;
  }
  if (bytes.length < 5) return undefined;
  const header = bytes.charCodeAt(3);
  const hasAlpha = bytes.charCodeAt(2) & 0x80;
  const isLandscape = bytes.charCodeAt(4) & 0x80;
  const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7;
  const ly = isLandscape ? header & 7 : hasAlpha ? 5 : 7;
  return ly > 0 ? lx / ly : undefined;
}

/**
 * Whether a photo is about 4:3: its hash reads 7:5, as a 4:3 or a 3:2 photo
 * does, and no other common shape.
 */
export function isAboutFourByThree(hash: string): boolean {
  return thumbHashAspectRatio(hash) === 7 / 5;
}
