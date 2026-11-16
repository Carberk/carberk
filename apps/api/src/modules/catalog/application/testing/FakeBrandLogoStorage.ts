import type { BrandLogoStorage } from "../../domain/ports/BrandLogoStorage";

export class FakeBrandLogoStorage implements BrandLogoStorage {
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  deleted: string[] = [];
  deletedVersions: string[] = [];
  failDelete = false;
  failDeleteVersion = false;

  async presignUpload(): Promise<{ url: string; headers: Record<string, string> }> {
    throw new Error("not used");
  }

  async get(key: string, maxBytes: number) {
    const object = this.objects.get(key);
    if (!object) return null;
    return object.bytes.byteLength > maxBytes ? "too-large" as const : object;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { bytes, contentType });
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new Error("storage down");
    this.deleted.push(key);
    this.objects.delete(key);
  }

  async deleteLogoVersion(key: string): Promise<void> {
    this.deletedVersions.push(key);
    if (this.failDeleteVersion) throw new Error("storage down");
    const directory = key.slice(0, key.lastIndexOf("/") + 1);
    for (const existing of this.objects.keys()) {
      if (existing.startsWith(directory)) this.objects.delete(existing);
    }
  }

  publicUrl(key: string): string {
    return `https://media.example/catalog-assets/${key}`;
  }
}
