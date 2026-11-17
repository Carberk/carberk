
export interface LogoImageProcessor {

  probe(bytes: Uint8Array): Promise<{ format: string; width: number; height: number } | null>;

  rasterizeSvg(bytes: Uint8Array, size: number): Promise<Uint8Array>;
}

export const LOGO_IMAGE_PROCESSOR = Symbol("LogoImageProcessor");
