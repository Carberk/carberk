
export interface BrandLogoStorage {

  presignUpload(
    key: string,
    contentType: string,
    expirySeconds: number,
    sizeBytes: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;

  get(
    key: string,
    maxBytes: number,
  ): Promise<{ bytes: Uint8Array; contentType: string } | "too-large" | null>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;






  deleteLogoVersion(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export const BRAND_LOGO_STORAGE = Symbol("BrandLogoStorage");
