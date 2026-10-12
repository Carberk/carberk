export interface ImageVariantGenerator {
  generate(originalKey: string, options?: { writeProtocol?: "legacy" | "conditional-v1" }): Promise<{
    variants: {
      thumbnail: string;
      list: string;
      detail: string;
      fullscreen: string;
    };
    /** The upright photo's ThumbHash, standard padded base64 (#824). */
    thumbHash: string;
  }>;
}

export const IMAGE_VARIANT_GENERATOR = Symbol("ImageVariantGenerator");
