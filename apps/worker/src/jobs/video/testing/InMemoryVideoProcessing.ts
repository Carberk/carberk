import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { VideoProcessingLedger, VideoProcessingLease, VideoProcessingFacts, VideoProcessingObjects, VideoPublishedAsset } from "../VideoProcessingPorts";

export class InMemoryVideoProcessingLedger implements VideoProcessingLedger {
  cancelled = false;
  planned: VideoPublishedAsset[] = [];
  ready: VideoProcessingFacts | null = null;
  failure: string | null = null;
  constructor(readonly lease: VideoProcessingLease) {}
  async claim() { return this.cancelled ? null : this.lease; }
  async plan(_lease: VideoProcessingLease, assets: VideoPublishedAsset[]) { if (this.cancelled) return false; this.planned = structuredClone(assets); return true; }
  async adopt(_lease: VideoProcessingLease, facts: VideoProcessingFacts) { if (this.cancelled) return false; this.ready = structuredClone(facts); return true; }
  async fail(_lease: VideoProcessingLease, reason: string) { this.failure = reason; }
}
/** Storage boundary fake retains actual uploaded bytes and proves their hashes. */
export class InMemoryVideoProcessingObjects implements VideoProcessingObjects {
  readonly bytes = new Map<string, Buffer>();
  corruptReadback = false;
  afterPublish: () => void = () => {};
  constructor(private readonly sourcePath: string, private readonly ledger: InMemoryVideoProcessingLedger) {}
  async download() { return { path: this.sourcePath, dispose: async () => {} }; }
  async publish(directory: string, asset: VideoPublishedAsset) {
    if (!this.ledger.planned.some(planned => planned.key === asset.key)) throw new Error("VIDEO_INTENT_MISSING");
    this.bytes.set(asset.key, await readFile(join(directory, asset.path)));
    this.afterPublish();
  }
  async verify(asset: VideoPublishedAsset) {
    const bytes = this.bytes.get(asset.key);
    return !this.corruptReadback && !!bytes && bytes.length === asset.sizeBytes && createHash("sha256").update(bytes).digest("hex") === asset.sha256;
  }
}
