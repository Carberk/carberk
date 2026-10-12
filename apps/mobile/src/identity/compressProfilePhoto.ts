import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

import { compressPhoto, CompressionError } from "../listings/uploadStaging/compressor";

const SIDE = 512;

/** Produces a square Profile Photo using the decoded, orientation-corrected image. */
export async function compressProfilePhoto(sourceUri: string, destinationUri: string) {
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let decoded: ImageRef | undefined;
  let square: ImageRef | undefined;
  let intermediateUri: string | undefined;
  try {
    context = ImageManipulator.manipulate(sourceUri);
    decoded = await context.renderAsync();
    const scale = SIDE / Math.min(decoded.width, decoded.height);
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);
    context.resize({ width, height });
    context.crop({ originX: Math.floor((width - SIDE) / 2), originY: Math.floor((height - SIDE) / 2), width: SIDE, height: SIDE });
    square = await context.renderAsync();
    const saved = await square.saveAsync({ format: SaveFormat.WEBP, compress: 1 });
    intermediateUri = saved.uri;
    return await compressPhoto(saved.uri, destinationUri, { maxDimension: SIDE, width: SIDE, height: SIDE });
  } catch (error) {
    if (error instanceof CompressionError) throw error;
    throw new CompressionError(error instanceof Error ? error.message : "Photo decoding failed", "MANIPULATION_FAILED");
  } finally {
    square?.release();
    decoded?.release();
    context?.release();
    if (intermediateUri) await FileSystem.deleteAsync(intermediateUri, { idempotent: true }).catch(() => {});
  }
}
