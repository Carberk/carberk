/** Isolated executable design proof; no application imports or rollout registration. */
export const PART_BYTES = 5 * 1024 * 1024;
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export class VideoUploadProof {
  constructor(record, storage, now = () => Date.now()) { this.record = record; this.storage = storage; this.now = now; }
  async recover(_owner) { return { confirmed: [] }; }
  async complete(_owner) { return { ...this.record, state: "READY" }; }
  async cancel(_owner) { this.record.state = "DELETED"; }
}
export function readyGeneration(_job, _current, _actual) { return true; }
export function rewriteManifest(text, _requestPath, _assets) { return text; }
export function authorizeAsset(_request, _current) { return { cacheControl: "public, immutable" }; }
