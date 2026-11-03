import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

import type { SyntheticClip } from "./fixtures";
import { selectionError, type PreparedClip, type VideoSelection } from "./state";

/** The only preparation/transfer boundary. All output is synthetic descriptor data. */
export interface LocalVideoAdapter {
  prepare(source: SyntheticClip, selection: VideoSelection): Promise<PreparedClip>;
  uploadChunk(prepared: PreparedClip, confirmedPercent: number): number;
  discard(prepared: PreparedClip): void;
}

export function createDeterministicLocalVideoAdapter(): LocalVideoAdapter {
  const staged = new Set<PreparedClip>();
  return {
    async prepare(source, selection) {
      if (selectionError(source, selection)) throw new Error("INVALID_SELECTION");
      // These ASCII UTF-8 bytes describe the selected interval; they are not an
      // encoded video. Digest and byte size cover this exact string, including LF.
      const descriptorUtf8 = JSON.stringify({
        kind: "prepared-descriptor-v1", sourceSha256: source.sha256,
        startSeconds: selection.startSeconds, endSeconds: selection.endSeconds,
        posterSeconds: selection.posterSeconds,
      }) + "\n";
      const output: PreparedClip = {
        kind: "prepared-descriptor-v1", descriptorUtf8,
        sizeBytes: descriptorUtf8.length,
        sha256: await digestStringAsync(CryptoDigestAlgorithm.SHA256, descriptorUtf8),
      };
      staged.add(output);
      return output;
    },
    uploadChunk(prepared, confirmedPercent) {
      if (!staged.has(prepared) || prepared.kind !== "prepared-descriptor-v1") throw new Error("PREPARED_OUTPUT_REQUIRED");
      // Represents confirmed transfer progress. No byte upload or network call.
      return Math.min(100, confirmedPercent + 25);
    },
    discard(prepared) { staged.delete(prepared); },
  };
}
