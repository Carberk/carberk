import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

/** ThumbHash encodes an image of at most 100 x 100 pixels. */
const THUMBHASH_MAX_SIDE = 100;

/**
 * The ThumbHash of an upright image (issue #824): a 100 px downscale encoded
 * by the reference `thumbhash` package, as standard padded base64, the form
 * the contracts' `ThumbHashSchema` accepts and expo-image takes as
 * `placeholder={{ thumbhash }}`. The packages/db backfill script encodes the same way.
 */
export async function computeThumbHash(image: Buffer, limitInputPixels?: number): Promise<string> {
  const { data, info } = await sharp(image, limitInputPixels === undefined ? {} : { limitInputPixels })
    .resize(THUMBHASH_MAX_SIDE, THUMBHASH_MAX_SIDE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}
