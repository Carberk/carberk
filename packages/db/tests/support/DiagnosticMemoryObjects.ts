import { diagnosticTestSha } from "./DiagnosticMemoryDatabase";
/** Exact-object storage fake with integrity checks and controllable I/O barriers. */
export class DiagnosticMemoryObjects {
  readonly bytes = new Map<string, Uint8Array>();
  afterPut: (() => Promise<void>) | null = null;
  async put(key: string, bytes: Uint8Array) { this.bytes.set(key, bytes.slice()); await this.afterPut?.(); }
  async read(key: string, size: number, sha: string) {
    const bytes = this.bytes.get(key);
    if (!bytes) throw Object.assign(new Error("Not found"), { $metadata: { httpStatusCode: 404 } });
    if (bytes.length !== size || diagnosticTestSha(bytes) !== sha) throw new Error("Integrity mismatch");
    return bytes.slice();
  }
  async deleteAndVerify(keys: string[]) { for (const key of keys) this.bytes.delete(key); }
}
