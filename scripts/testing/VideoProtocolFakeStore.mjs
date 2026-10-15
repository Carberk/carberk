export class VideoProtocolFakeStore {
  parts = [];
  object = null;
  holdCompletion;
  abortLeavesLatePart = false;
  deleted = false;
  async listParts() { return structuredClone(this.parts); }
  async complete(parts) {
    if (this.holdCompletion) await this.holdCompletion;
    this.object = { size: parts.reduce((total, part) => total + part.size, 0), sha256: "a".repeat(64) };
    this.parts = [];
    return this.object;
  }
  async head() { return this.object; }
  async abort() { if (!this.abortLeavesLatePart) this.parts = []; }
  async delete() { this.object = null; this.deleted = true; }
}
