import { beforeEach, describe, expect, it } from "vitest";

import { AttachMedia } from "../application/AttachMedia";
import { UploadAdoptionGuard } from "../application/UploadAdoptionGuard";
import { InMemoryMediaWorld } from "../application/testing/InMemoryMediaWorld";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import { Listing } from "../domain/Listing";
import type { ImageVariantGenerator } from "../domain/ports/ImageVariantGenerator";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { MediaContentClassifierPort } from "../domain/ports/MediaContentClassifierPort";

import { ProfilePhotoUploadAdapter } from "./ProfilePhotoUploadAdapter";

const KEY = "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp";
const SECOND_KEY = "pending/1c0a4d2f-3e5b-4d7c-9f20-4b6c8d0e2f3a/original.webp";
const FIVE_MB = 5 * 1024 * 1024;

class FakeVariantGenerator implements ImageVariantGenerator {
  calls: Array<{ key: string; writeProtocol: string | undefined }> = [];
  /** Runs while the generator holds the upload, before it returns. */
  during: ((key: string) => Promise<void> | void) | undefined;

  async generate(originalKey: string, options?: { writeProtocol?: "legacy" | "conditional-v1" }) {
    this.calls.push({ key: originalKey, writeProtocol: options?.writeProtocol });
    await this.during?.(originalKey);
    return {
      variants: {
        thumbnail: `${originalKey}/thumbnail.webp`,
        list: `${originalKey}/list.webp`,
        detail: `${originalKey}/detail.webp`,
        fullscreen: `${originalKey}/fullscreen.webp`,
      },
    };
  }
}

describe("ProfilePhotoUploadAdapter", () => {
  let world: InMemoryMediaWorld;
  let generator: FakeVariantGenerator;
  let classifier: MediaContentClassifierPort;
  let photos: ProfilePhotoUploadAdapter;
  let attach: AttachMedia;

  /** A presigned upload whose file has reached storage. */
  function presignedUpload(
    key: string,
    options: { kind?: "image" | "video"; userId?: string; stored?: boolean } = {},
  ): string {
    const kind = options.kind ?? "image";
    const id = `upload-${key}`;
    world.uploads.push({
      id,
      userId: options.userId ?? "user-1",
      key,
      kind,
      contentType: kind === "image" ? "image/webp" : "video/mp4",
      sizeBytes: 1024,
      writeProtocol: "conditional-v1",
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    if (options.stored !== false) world.completeUpload(key);
    return id;
  }

  function attachToListing(key: string) {
    return attach.execute({
      listingId: "listing-1", userId: "user-1", key, kind: "image", sortOrder: 0,
    });
  }

  beforeEach(() => {
    world = new InMemoryMediaWorld();
    generator = new FakeVariantGenerator();
    classifier = { classify: async () => ({ isAcceptable: true, confidence: 1 }) };
    const guard = new UploadAdoptionGuard(world.uploadRepo, world.inspector);
    photos = new ProfilePhotoUploadAdapter(guard, world.claims, classifier, generator, world.photoLink);

    const listing = Listing.create({
      id: "listing-1",
      publicNumber: 1,
      sellerId: "user-1",
      status: "active",
      brandId: "brand-1",
      modelId: "model-1",
      cityId: "city-1",
      priceAmount: 100000,
      priceCurrency: "TMT",
      allowCalls: true,
      allowChat: true,
      publishedAt: new Date("2026-05-01T00:00:00Z"),
    });
    const listings = { findById: async (id: string) => (id === listing.id ? listing : null) };
    attach = new AttachMedia(
      listings as unknown as ListingRepository,
      world.mediaRepo,
      classifier,
      generator,
      guard,
      world.claims,
    );
  });

  it("attach and Profile Photo refusals expose the same key details without the internal upload id", async () => {
    presignedUpload(KEY);
    world.putObject(KEY, { contentType: "image/png", sizeBytes: 100 });
    for (const attempt of [() => attachToListing(KEY), () => photos.adopt({ userId: "user-1", key: KEY })]) {
      const error = await attempt().catch((err: unknown) => err);
      const response = (error as { getResponse(): { details: unknown } }).getResponse();
      expect(response.details).toEqual({ key: KEY });
      expect(world.stateOfKey(KEY)).toBe("AVAILABLE");
    }
  });

  it.each(["attach", "profile"] as const)("%s names the unusable image key when generation rejects it, keeping terminal adoption", async (target) => {
    presignedUpload(KEY);
    generator.during = () => { throw new DomainError(LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID, "Corrupt image"); };
    const error = await (target === "attach" ? attachToListing(KEY) : photos.adopt({ userId: "user-1", key: KEY }))
      .catch((err: unknown) => err);
    expect(error).toMatchObject({ response: { code: "UPLOAD_OBJECT_INVALID", details: { key: KEY } } });
    expect(world.stateOfKey(KEY)).toBe("RETIRED");
    expect(world.cleanups).toEqual([`upload-${KEY}`]);
  });

  describe("adopting an upload", () => {
    it("makes the variants for the key and links the upload to the User", async () => {
      const uploadId = presignedUpload(KEY);

      await expect(photos.adopt({ userId: "user-1", key: KEY })).resolves.toEqual({ key: KEY });

      expect(generator.calls).toEqual([{ key: KEY, writeProtocol: "conditional-v1" }]);
      expect(world.profilePhotos.get("user-1")).toEqual({ uploadId, key: KEY });
      expect(world.stateOfKey(KEY)).toBe("ADOPTED");
    });

    it("reserves the upload for the User's profile before any variant is generated", async () => {
      const uploadId = presignedUpload(KEY);
      let duringGeneration: unknown;
      generator.during = () => {
        duringGeneration = world.claimOf(uploadId);
      };

      await photos.adopt({ userId: "user-1", key: KEY });

      expect(duringGeneration).toMatchObject({
        state: "PREPARING", target: { type: "profile", id: "user-1" },
      });
    });

    it.each([
      ["a made-up key", () => "pending/made-up/original.webp"],
      ["a key another User presigned", () => {
        presignedUpload(KEY, { userId: "user-2" });
        return KEY;
      }],
      ["a video key", () => {
        presignedUpload("pending/clip/original.mp4", { kind: "video" });
        return "pending/clip/original.mp4";
      }],
    ])("refuses %s with the one indistinguishable error and changes nothing", async (_name, seed) => {
      const key = seed();

      await expect(photos.adopt({ userId: "user-1", key })).rejects.toMatchObject({
        status: 400,
        response: { code: "UPLOAD_NOT_AVAILABLE", message: "Upload is not available for this User" },
      });
      expect(generator.calls).toEqual([]);
      expect(world.profilePhotos.size).toBe(0);
      expect(world.cleanups).toEqual([]);
    });

    it("refuses an upload presigned without the fenced write protocol, whose bytes could never be deleted", async () => {
      const uploadId = presignedUpload(KEY);
      const upload = world.uploads.find((u) => u.id === uploadId);
      if (upload) upload.writeProtocol = "legacy";

      await expect(photos.adopt({ userId: "user-1", key: KEY })).rejects.toMatchObject({
        status: 400,
        response: { code: "UPLOAD_NOT_AVAILABLE", message: "Upload is not available for this User" },
      });
      expect(generator.calls).toEqual([]);
      expect(world.profilePhotos.size).toBe(0);
      expect(world.stateOfKey(KEY)).toBe("AVAILABLE");
    });

    it.each([
      ["missing", undefined],
      ["empty", { contentType: "image/webp", sizeBytes: 0 }],
      ["over 5 MB", { contentType: "image/webp", sizeBytes: FIVE_MB + 1 }],
      ["of another content type than presigned", { contentType: "image/png", sizeBytes: 1024 }],
    ])("refuses a key whose stored object is %s and changes nothing", async (_name, object) => {
      presignedUpload(KEY, { stored: false });
      if (object) world.putObject(KEY, object);

      await expect(photos.adopt({ userId: "user-1", key: KEY })).rejects.toMatchObject({
        status: 400,
        response: { code: "UPLOAD_OBJECT_INVALID" },
      });
      expect(generator.calls).toEqual([]);
      expect(world.profilePhotos.size).toBe(0);
      expect(world.stateOfKey(KEY)).toBe("AVAILABLE");
    });

    it("accepts a stored object of exactly 5 MB", async () => {
      presignedUpload(KEY, { stored: false });
      world.putObject(KEY, { contentType: "image/webp", sizeBytes: FIVE_MB });

      await expect(photos.adopt({ userId: "user-1", key: KEY })).resolves.toEqual({ key: KEY });
    });

    it("succeeds and changes nothing when the key is already the current photo", async () => {
      presignedUpload(KEY);
      await photos.adopt({ userId: "user-1", key: KEY });
      const before = world.profilePhotos.get("user-1");

      await expect(photos.adopt({ userId: "user-1", key: KEY })).resolves.toEqual({ key: KEY });

      expect(generator.calls).toHaveLength(1);
      expect(world.profilePhotos.get("user-1")).toEqual(before);
      expect(world.cleanups).toEqual([]);
    });
  });

  describe("one adopter across Listings and profiles", () => {
    it("refuses an upload already attached to a Listing", async () => {
      presignedUpload(KEY);
      await attachToListing(KEY);

      await expect(photos.adopt({ userId: "user-1", key: KEY })).rejects.toMatchObject({
        status: 409,
        response: {
          code: "UPLOAD_ALREADY_ATTACHED",
          details: { reason: "UPLOAD_ATTACHED_TO_LISTING" },
        },
      });
      expect(world.profilePhotos.size).toBe(0);
      expect(world.media).toHaveLength(1);
      expect(world.stateOfKey(KEY)).toBe("ADOPTED");
    });

    it("keeps an upload adopted as a Profile Photo off a Listing", async () => {
      presignedUpload(KEY);
      await photos.adopt({ userId: "user-1", key: KEY });

      await expect(attachToListing(KEY)).rejects.toMatchObject({
        status: 409,
        response: { code: "UPLOAD_ALREADY_ATTACHED" },
      });
      expect(world.media).toHaveLength(0);
      expect(world.profilePhotos.get("user-1")?.key).toBe(KEY);
    });

    it("lets exactly one of a concurrent profile adoption and Listing attach win", async () => {
      const uploadId = presignedUpload(KEY);

      const [profile, listing] = await Promise.allSettled([
        photos.adopt({ userId: "user-1", key: KEY }),
        attachToListing(KEY),
      ]);

      expect([profile.status, listing.status].sort()).toEqual(["fulfilled", "rejected"]);
      const loser = profile.status === "rejected" ? profile : (listing as PromiseRejectedResult);
      expect(loser.reason).toMatchObject({ response: { code: "UPLOAD_ALREADY_ATTACHED" } });
      const adopters = world.media.length + world.profilePhotos.size;
      expect(adopters).toBe(1);
      // The loser never held the claim, so it must not retire the winner's upload.
      expect(world.claimOf(uploadId).state).toBe("ADOPTED");
      expect(world.cleanups).toEqual([]);
    });

    it("prepares one key once when two requests for it overlap, and refuses the second", async () => {
      const uploadId = presignedUpload(KEY);

      const [first, second] = await Promise.allSettled([
        photos.adopt({ userId: "user-1", key: KEY }),
        photos.adopt({ userId: "user-1", key: KEY }),
      ]);

      // Two generators writing the same objects would fail each other's
      // conditional writes, and the failure would retire the upload.
      expect(first).toEqual({ status: "fulfilled", value: { key: KEY } });
      expect(second).toMatchObject({
        status: "rejected",
        reason: {
          status: 409,
          response: { code: "UPLOAD_ALREADY_ATTACHED", details: { reason: "UPLOAD_PREPARING" } },
        },
      });
      expect(generator.calls).toHaveLength(1);
      expect(world.profilePhotos.get("user-1")).toEqual({ uploadId, key: KEY });
      expect(world.cleanups).toEqual([]);
    });
  });

  describe("replacing the photo", () => {
    it("links the second upload and retires the first with its deletion work", async () => {
      const first = presignedUpload(KEY);
      const second = presignedUpload(SECOND_KEY);
      await photos.adopt({ userId: "user-1", key: KEY });

      await photos.adopt({ userId: "user-1", key: SECOND_KEY });

      expect(world.profilePhotos.get("user-1")).toEqual({ uploadId: second, key: SECOND_KEY });
      expect(world.stateOfKey(KEY)).toBe("RETIRED");
      expect(world.cleanups).toEqual([first]);
    });

    it("never accepts the replaced upload again", async () => {
      presignedUpload(KEY);
      presignedUpload(SECOND_KEY);
      await photos.adopt({ userId: "user-1", key: KEY });
      await photos.adopt({ userId: "user-1", key: SECOND_KEY });

      await expect(photos.adopt({ userId: "user-1", key: KEY })).rejects.toMatchObject({
        response: { code: "UPLOAD_NOT_AVAILABLE" },
      });
      expect(world.profilePhotos.get("user-1")?.key).toBe(SECOND_KEY);
    });
  });

  describe("a failed preparation", () => {
    it("retires the new upload and keeps the current photo when generation fails", async () => {
      const first = presignedUpload(KEY);
      const second = presignedUpload(SECOND_KEY);
      await photos.adopt({ userId: "user-1", key: KEY });
      generator.during = () => {
        throw new Error("Sharp failed");
      };

      await expect(photos.adopt({ userId: "user-1", key: SECOND_KEY })).rejects.toThrow("Sharp failed");

      expect(world.profilePhotos.get("user-1")).toEqual({ uploadId: first, key: KEY });
      expect(world.stateOfKey(SECOND_KEY)).toBe("RETIRED");
      expect(world.cleanups).toEqual([second]);
    });

    it("retires the upload when the User may no longer change their profile", async () => {
      const uploadId = presignedUpload(KEY);
      world.ineligibleUsers.add("user-1");

      await expect(photos.adopt({ userId: "user-1", key: KEY })).rejects.toThrow(
        "User may not change their profile",
      );

      expect(world.profilePhotos.size).toBe(0);
      expect(world.cleanups).toEqual([uploadId]);
    });

    it("refuses an upload the classifier rejects and retires it", async () => {
      const uploadId = presignedUpload(KEY);
      classifier.classify = async () => ({ isAcceptable: false, confidence: 1, reason: "nsfw" });

      await expect(photos.adopt({ userId: "user-1", key: KEY })).rejects.toMatchObject({
        status: 400,
        response: { code: "UPLOAD_OBJECT_INVALID", details: { key: KEY } },
      });

      expect(generator.calls).toEqual([]);
      expect(world.profilePhotos.size).toBe(0);
      expect(world.cleanups).toEqual([uploadId]);
    });

    it("does not retire a claim another request for the same key is still preparing", async () => {
      const uploadId = presignedUpload(KEY);
      let overlapping: unknown;
      generator.during = async () => {
        // A second request arrives, once, while the first one is generating.
        generator.during = undefined;
        overlapping = await photos.adopt({ userId: "user-1", key: KEY }).catch((err: unknown) => err);
      };

      await expect(photos.adopt({ userId: "user-1", key: KEY })).resolves.toEqual({ key: KEY });

      expect(overlapping).toMatchObject({
        status: 409,
        response: { code: "UPLOAD_ALREADY_ATTACHED", details: { reason: "UPLOAD_PREPARING" } },
      });
      expect(generator.calls).toHaveLength(1);
      expect(world.profilePhotos.get("user-1")).toEqual({ uploadId, key: KEY });
      expect(world.cleanups).toEqual([]);
    });
  });

  describe("releasing the photo", () => {
    it("clears the link, retires the upload and records its deletion work", async () => {
      const uploadId = presignedUpload(KEY);
      await photos.adopt({ userId: "user-1", key: KEY });

      await expect(photos.release("user-1")).resolves.toEqual({ removedKey: KEY });

      expect(world.profilePhotos.size).toBe(0);
      expect(world.stateOfKey(KEY)).toBe("RETIRED");
      expect(world.cleanups).toEqual([uploadId]);
    });

    it("answers null for a User with no photo and retires nothing", async () => {
      await expect(photos.release("user-1")).resolves.toEqual({ removedKey: null });
      expect(world.cleanups).toEqual([]);
    });

    it("runs inside the caller's transaction when one is given", async () => {
      presignedUpload(KEY);
      await photos.adopt({ userId: "user-1", key: KEY });
      const tx = { name: "moderation transaction" };

      await photos.release("user-1", tx);

      expect(world.unbindTransactions).toEqual([tx]);
    });
  });
});
