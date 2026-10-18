import type { VideoObjectStorage } from "../../domain/ports/VideoObjectStorage";

/** Storage boundary fake can lose successful provider responses. */
export class InMemoryVideoObjectStorage implements VideoObjectStorage {
  initialized = 0;
  loseInitializeResponse = false;
  loseCompleteResponse = false;
  committed = false;
  afterComplete: () => void = () => {};
  async initialize() { this.initialized++; if (this.loseInitializeResponse) throw new Error("VIDEO_STORAGE_UNAVAILABLE"); return "storage-upload-id"; }
  async recoverInitialization() { return this.initialized ? "storage-upload-id" : null; }
  async sourceCommitted() { return this.committed; }
  async listParts() { return []; }
  async partCredential() { return { url: "https://private-storage/temporary", sizeBytes: 100, expiresAt: new Date("2026-10-17T00:15:00Z") }; }
  async complete() { this.committed = true; this.afterComplete(); if (this.loseCompleteResponse) throw new Error("VIDEO_STORAGE_UNAVAILABLE"); }
  async abort() {}
}
