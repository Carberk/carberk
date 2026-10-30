export interface VideoManifestAsset { path: string; purpose: "poster" | "playback"; }

/** Paths are generation-relative inventory entries, never bucket keys or URLs.
 * Caller reauthorizes actor/grant/generation on every request before reading bytes. */
export class VideoManifestGateway {
  private readonly inventory: ReadonlyMap<string, VideoManifestAsset["purpose"]>;
  constructor(assets: readonly VideoManifestAsset[]) {
    if (!assets.length || assets.some((asset) => !this.safePath(asset.path)) || new Set(assets.map((asset) => asset.path)).size !== assets.length) throw new Error("VIDEO_MANIFEST_INVALID");
    this.inventory = new Map(assets.map((asset) => [asset.path, asset.purpose]));
  }
  allows(path: string, purpose: VideoManifestAsset["purpose"]): boolean { return this.safePath(path) && this.inventory.get(path) === purpose; }
  rewrite(text: string, playlist: string, secret: string): string {
    if (!this.allows(playlist, "playback") || !playlist.endsWith(".m3u8")) throw new Error("VIDEO_ASSET_DENIED");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(secret) || !text.startsWith("#EXTM3U") || Buffer.byteLength(text, "utf8") > 512 * 1024) throw new Error("VIDEO_MANIFEST_INVALID");
    const slash = playlist.lastIndexOf("/"); const directory = slash < 0 ? "" : playlist.slice(0, slash + 1);
    const rewrite = (uri: string): string => {
      if (!this.safePath(uri) || !this.allows(directory + uri, "playback")) throw new Error("VIDEO_ASSET_DENIED");
      return `/video-grants/${secret}/${directory}${uri}`;
    };
    return text.split("\n").map((line) => {
      if (!line.trim()) return line;
      if (!line.startsWith("#")) return rewrite(line.trim());
      if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-SESSION-KEY:")) throw new Error("VIDEO_MANIFEST_INVALID");
      const rewritten = line.replace(/\bURI="([^"]+)"/g, (_match, uri: string) => `URI="${rewrite(uri)}"`);
      if (/\bURI\s*=/.test(rewritten.replace(/\bURI="[^"]*"/g, ""))) throw new Error("VIDEO_MANIFEST_INVALID");
      return rewritten;
    }).join("\n");
  }
  private safePath(path: string): boolean { return /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(path) && path.split("/").every((part) => !!part && part !== "." && part !== ".."); }
}
