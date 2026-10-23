export interface PreparedVideoSource {
    path: string;
    sha256: string;
    posterMs: number;
}
export interface ProcessedVideoAsset {
    path: string;
    sizeBytes: number;
    sha256: string;
    purpose: "poster" | "playback";
    contentType: string;
}
export interface ProcessedVideo {
    directory: string;
    durationMs: number;
    width: number;
    height: number;
    sourceSha256: string;
    renditions: {
        label: 240 | 360 | 720;
        width: number;
        height: number;
    }[];
    assets: ProcessedVideoAsset[];
    dispose(): Promise<void>;
}
/** Only worker-owned local prepared source paths enter this boundary. No URLs.
 * Caller uploads every exact asset/readbacks before CAS readiness, then disposes. */
export interface VideoMediaProcessor {
    process(source: PreparedVideoSource): Promise<ProcessedVideo>;
}
