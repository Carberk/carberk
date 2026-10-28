import type { DemoBucket, ObjectStore } from "../../storage";

/** Seedable storage boundary with the same bucket, prefix and selective-delete
 * behavior as S3. Refusal mode proves a caller performs no storage writes. */
export class FakeObjectStore implements ObjectStore {
  private readonly buckets = new Map<DemoBucket, Map<string, Buffer>>();

  constructor(seed: Partial<Record<DemoBucket, ReadonlyMap<string, Buffer>>> = {}, private readonly refuseWrites = false) {
    for (const bucket of ["listing-photos", "chat-attachments"] as const) {
      this.buckets.set(bucket, new Map([...(seed[bucket] ?? [])].map(([key, body]) => [key, Buffer.from(body)])));
    }
  }

  snapshot(bucket: DemoBucket = "listing-photos"): Map<string, Buffer> {
    return new Map([...this.bucket(bucket)].map(([key, body]) => [key, Buffer.from(body)]));
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    this.assertWritable();
    this.bucket("listing-photos").set(key, Buffer.from(body));
  }

  async list(prefix: string, bucket: DemoBucket = "listing-photos"): Promise<string[]> {
    return [...this.bucket(bucket).keys()].filter(key => key.startsWith(prefix));
  }

  async remove(keys: readonly string[], bucket: DemoBucket = "listing-photos"): Promise<void> {
    this.assertWritable();
    for (const key of keys) this.bucket(bucket).delete(key);
  }

  close(): void {}

  private bucket(bucket: DemoBucket): Map<string, Buffer> {
    const objects = this.buckets.get(bucket);
    if (!objects) throw new Error("Unknown storage bucket");
    return objects;
  }

  private assertWritable(): void {
    if (this.refuseWrites) throw new Error("Unexpected storage write");
  }
}
