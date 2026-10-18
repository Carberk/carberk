export const DIAGNOSTIC_OBJECTS = "DIAGNOSTIC_OBJECTS";
export interface DiagnosticObjects {
  sanitize(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; mime: "image/webp" }>;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  read(key: string, sizeBytes: number, sha256: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
