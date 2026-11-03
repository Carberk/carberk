import type { PreparedClip, SyntheticClip, VideoSelection } from "./state";

/**
 * The prototype's only media boundary. It produces metadata for a synthetic
 * clip; it never reads a library URI and never sends bytes over the network.
 */
export type LocalVideoAdapter = {
  prepare: (source: SyntheticClip, selection: VideoSelection) => PreparedClip;
  uploadChunk: (prepared: PreparedClip, completedChunks: number) => number;
};

export function createDeterministicLocalVideoAdapter(): LocalVideoAdapter {
  return {
    prepare: (_source, _selection) => ({
      id: "prepared-synthetic-clip-v1",
      sizeBytes: 8_400_000,
      sha256: "sha256:prepared-synthetic-clip-v1",
    }),
    uploadChunk: (prepared, completedChunks) => {
      // The argument makes it explicit that upload progress is for prepared
      // output only. The original source has no upload method in this adapter.
      if (prepared.id !== "prepared-synthetic-clip-v1") {
        throw new Error("VIDEO_PROTOTYPE_PREPARED_OUTPUT_REQUIRED");
      }
      return Math.min(100, (completedChunks + 1) * 25);
    },
  };
}
