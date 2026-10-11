import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

export interface CompressionResult {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
}

const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 0.8;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export class CompressionError extends Error {
  constructor(
    message: string,
    public readonly code: "SOURCE_MISSING" | "DESTINATION_MISSING" | "MANIPULATION_FAILED",
  ) {
    super(message);
    this.name = "CompressionError";
  }
}

export async function compressPhoto(
  sourceUri: string,
  destinationUri: string,
  target?: { maxDimension: number; width: number; height: number },
): Promise<CompressionResult> {
  // Checkpoint 1: verify source file exists before manipulation
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new CompressionError(
      "Original photo was deleted — please re-select",
      "SOURCE_MISSING",
    );
  }

  try {
    const context = ImageManipulator.manipulate(sourceUri);
    if (target) {
      const longSide = Math.min(target.maxDimension, Math.max(target.width, target.height));
      context.resize(target.width >= target.height ? { width: longSide } : { height: longSide });
    } else {
      const decoded = await context.renderAsync();
      const longSide = Math.min(MAX_DIMENSION, Math.max(decoded.width, decoded.height));
      context.resize(decoded.width >= decoded.height ? { width: longSide } : { height: longSide });
      decoded.release?.();
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: SaveFormat.WEBP,
      compress: WEBP_QUALITY,
    });

    // Check file size and re-compress with lower quality if needed
    let finalUri = result.uri;
    let fileInfo = await FileSystem.getInfoAsync(finalUri);
    let fileSize = fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0;

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const recompressContext = ImageManipulator.manipulate(finalUri);
      const recompressed = await recompressContext.renderAsync();
      const recompressResult = await recompressed.saveAsync({
        format: SaveFormat.WEBP,
        compress: 0.6,
      });
      finalUri = recompressResult.uri;
      fileInfo = await FileSystem.getInfoAsync(finalUri);
      fileSize = fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0;
    }

    // Copy to staging directory (always copy, never move — moveAsync fails
    // silently on some iOS versions crossing filesystem boundaries, see #118)
    if (finalUri !== destinationUri) {
      try {
        await FileSystem.copyAsync({ from: finalUri, to: destinationUri });
      } catch {
        throw new CompressionError(
          "Failed to transfer compressed photo to staging — disk full or permission denied",
          "DESTINATION_MISSING",
        );
      }
      try {
        await FileSystem.deleteAsync(finalUri, { idempotent: true });
      } catch {
        // Best-effort cleanup; don't fail compression if delete fails
      }
    }

    // Checkpoint 2: verify destination file exists after move/copy
    const destInfo = await FileSystem.getInfoAsync(destinationUri);
    if (!destInfo.exists) {
      throw new CompressionError(
        "Photo file missing after transfer — please remove and re-select",
        "DESTINATION_MISSING",
      );
    }

    return {
      uri: destinationUri,
      width: result.width,
      height: result.height,
      fileSize,
    };
  } catch (err) {
    if (err instanceof CompressionError) {
      throw err;
    }
    throw new CompressionError(
      err instanceof Error ? err.message : "Compression failed",
      "MANIPULATION_FAILED",
    );
  }
}
