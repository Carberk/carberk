/** Isolated executable design proof; no application imports or rollout registration. */
import path from "node:path";

export const PART_BYTES = 5 * 1024 * 1024;
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const unavailable = () => new Error("UNAVAILABLE");

export class VideoUploadProof {
  constructor(record, storage, now = () => Date.now()) { this.record = record; this.storage = storage; this.now = now; }
  authorize(owner) {
    if (owner !== this.record.owner || this.now() >= this.record.expiresAt || this.record.cancelled) throw unavailable();
  }
  async recover(owner) {
    this.authorize(owner);
    const confirmed = await this.storage.listParts();
    this.authorize(owner);
    for (const part of confirmed) {
      const expected = Math.min(PART_BYTES, this.record.bytes - (part.number - 1) * PART_BYTES);
      if (!Number.isInteger(part.number) || part.number < 1 || part.size !== expected || !part.etag) throw new Error("PARTS_INVALID");
    }
    if (new Set(confirmed.map((part) => part.number)).size !== confirmed.length) throw new Error("PARTS_INVALID");
    let nextPart = 1;
    while (confirmed.some((part) => part.number === nextPart)) nextPart++;
    return { confirmed, nextPart, credentialExpiresAt: Math.min(this.now() + 15 * 60_000, this.record.expiresAt) };
  }
  async complete(owner) {
    this.authorize(owner);
    if (this.record.state === "PROCESSING") return structuredClone(this.record);
    const reconciled = await this.storage.head();
    this.authorize(owner);
    if (reconciled) {
      if (reconciled.size !== this.record.bytes) throw new Error("OBJECT_INVALID");
      this.record.state = "PROCESSING";
      return structuredClone(this.record);
    }
    const { confirmed } = await this.recover(owner);
    const count = Math.ceil(this.record.bytes / PART_BYTES);
    if (confirmed.length !== count || confirmed.reduce((sum, part) => sum + part.size, 0) !== this.record.bytes) throw new Error("PARTS_INVALID");
    this.record.state = "COMPLETING";
    this.record.inFlight = true;
    try {
      // Unique key allows reconciling storage completion after a lost database/HTTP response.
      const existing = await this.storage.head();
      const object = existing ?? await this.storage.complete([...confirmed].sort((a, b) => a.number - b.number));
      if (this.record.cancelled) {
        await this.storage.delete();
        throw new Error("CANCELLED");
      }
      if (object.size !== this.record.bytes) throw new Error("OBJECT_INVALID");
      // Bytes still require authoritative decode/hash/poster/transcode validation before READY.
      this.record.state = "PROCESSING";
      return structuredClone(this.record);
    } finally {
      this.record.inFlight = false;
      if (this.record.cancelled) await this.cleanup();
    }
  }
  async cancel(owner) {
    if (owner !== this.record.owner || this.record.state === "ADOPTED") throw unavailable();
    this.record.cancelled = true;
    this.record.state = "CLEANUP_PENDING";
    await this.cleanup();
    return structuredClone(this.record);
  }
  async cleanup() {
    await this.storage.abort();
    await this.storage.delete();
    const remaining = await this.storage.listParts();
    const object = await this.storage.head();
    this.record.state = !this.record.inFlight && remaining.length === 0 && object === null ? "DELETED" : "CLEANUP_PENDING";
  }
}

export function readyGeneration(job, current, actual) {
  return !current.removed && current.pending === job.generation && actual.validated === true &&
    Number.isSafeInteger(job.posterMs) && job.posterMs >= 0 && job.posterMs < actual.durationMs &&
    Number.isFinite(actual.durationMs) && actual.durationMs > 0 && actual.durationMs <= 90_000 &&
    ["source.mp4", "poster.webp", "master.m3u8"].every((key) => actual.required.includes(key)) &&
    actual.required.some((key) => /\.(ts|m4s)$/.test(key)) && actual.required.length >= 4 && new Set(actual.required).size === actual.required.length &&
    actual.required.every((key) => actual.accessible.includes(key));
}

export function authorizeAsset(request, current) {
  const { grant, owner, asset, purpose } = request;
  if (!current.enabled || !current.tester || !current.activeAccount || !current.listingVisible ||
    current.listing !== grant.listing || current.generation !== grant.generation || grant.revoked === true || !Number.isFinite(grant.expiresAt) || !Number.isFinite(current.now) || current.now >= grant.expiresAt || owner !== grant.owner ||
    purpose !== grant.purpose || !grant.assets.includes(asset)) throw unavailable();
  return { cacheControl: "private, no-store" };
}

export function rewriteManifest(text, requestPath, assets) {
  const match = /^(\/proof-grants\/[a-zA-Z0-9_-]+\/)([^?#]+)$/.exec(requestPath);
  if (!match) throw new Error("MANIFEST_INVALID");
  const [, prefix, currentAsset] = match;
  if (!assets.has(currentAsset) || currentAsset.split("/").includes("..")) throw new Error("MANIFEST_INVALID");
  const rewrite = (uri) => {
    // Worker-produced V1 manifests use plain relative asset paths only, no external/key URLs.
    if (!/^[a-zA-Z0-9_./-]+$/.test(uri) || uri.startsWith("/") || uri.split("/").includes("..")) throw new Error("MANIFEST_INVALID");
    const asset = path.posix.join(path.posix.dirname(currentAsset), uri);
    if (!assets.has(asset)) throw new Error("MANIFEST_INVALID");
    return prefix + asset;
  };
  return text.split("\n").map((line) => {
    if (/URI=(?!")/.test(line)) throw new Error("MANIFEST_INVALID");
    if (!line || line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_all, uri) => `URI="${rewrite(uri)}"`);
    return rewrite(line.trim());
  }).join("\n");
}
