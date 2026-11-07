import type { VideoUploadPersistence } from "../../videoUpload";

export class InMemoryVideoUploadPersistence implements VideoUploadPersistence {
  private readonly records = new Map<string, string>();

  async get(key: string): Promise<string | null> { return this.records.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.records.set(key, value); }
  async remove(key: string): Promise<void> { this.records.delete(key); }
}
