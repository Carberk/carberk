import { describe, it, expect, beforeEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { MediaContentClassifierPort } from "../domain/ports/MediaContentClassifierPort";
import type { ImageVariantGenerator } from "../domain/ports/ImageVariantGenerator";

import { AttachMedia } from "./AttachMedia";
import { PresignUpload } from "./PresignUpload";
import { RemoveMedia } from "./RemoveMedia";
import { UploadAdoptionGuard } from "./UploadAdoptionGuard";
import { InMemoryMediaWorld } from "./testing/InMemoryMediaWorld";

// Issue #536: two Users, distinct Listings, one consistent in-memory world.
// User B's Listing publicly exposes its media key (GetListingDetail), so a known
// key must authorize nothing for User A. See ADR-0077.

const USER_A = "user-a";
const USER_B = "user-b";
const LISTING_A = "listing-a";
const LISTING_A2 = "listing-a2";
const LISTING_B = "listing-b";

class FakeListingRepository implements ListingRepository {
  listings: Listing[] = [];

  async save(listing: Listing): Promise<Listing> {
    this.listings.push(listing);
    return listing;
  }

  async findById(id: string): Promise<Listing | null> {
    return this.listings.find((l) => l.id === id) ?? null;
  }

  async findBySellerId(): Promise<{ items: Listing[] }> {
    return { items: this.listings };
  }

  async update(listing: Listing): Promise<Listing> {
    return listing;
  }

  async recomputePriceTmt(): Promise<number> {
    return 0;
  }

  async softDelete(): Promise<void> {}
}

const acceptingClassifier: MediaContentClassifierPort = {
  classify: async () => ({ isAcceptable: true, confidence: 1 }),
};

const fakeVariants: ImageVariantGenerator = {
  generate: async (originalKey: string) => ({
    variants: {
      thumbnail: `${originalKey}/thumbnail.jpg`,
      list: `${originalKey}/list.jpg`,
      detail: `${originalKey}/detail.jpg`,
      fullscreen: `${originalKey}/fullscreen.jpg`,
    },
  }),
};

function activeListing(id: string, sellerId: string, publicNumber: number) {
  return Listing.create({
    id,
    publicNumber,
    sellerId,
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
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected the call to be rejected");
    },
    (err: unknown) => err,
  );
}

function codeOf(err: unknown): unknown {
  return (err as { getResponse(): { code?: string } }).getResponse().code;
}

describe("Listing media upload ownership (#536)", () => {
  let world: InMemoryMediaWorld;
  let listings: FakeListingRepository;
  let presign: PresignUpload;
  let attach: AttachMedia;
  let remove: RemoveMedia;

  /** The legitimate flow: presign, direct PUT, then attach. */
  async function uploadAndAttach(userId: string, listingId: string, sortOrder = 0) {
    const presigned = await presign.execute({
      userId,
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    });
    world.completeUpload(presigned.key);
    const { media } = await attach.execute({
      listingId,
      userId,
      key: presigned.key,
      kind: "image",
      sortOrder,
    });
    return { key: presigned.key, media };
  }

  function objectsUnder(prefix: string): string[] {
    return [...world.objects.keys()].filter((key) => key.startsWith(prefix));
  }

  beforeEach(() => {
    world = new InMemoryMediaWorld();
    listings = new FakeListingRepository();
    listings.listings.push(
      activeListing(LISTING_A, USER_A, 1),
      activeListing(LISTING_A2, USER_A, 3),
      activeListing(LISTING_B, USER_B, 2),
    );
    presign = new PresignUpload(world.storage, world.uploadRepo);
    const guard = new UploadAdoptionGuard(world.uploadRepo, world.inspector);
    attach = new AttachMedia(
      listings,
      world.mediaRepo,
      acceptingClassifier,
      fakeVariants,
      guard,
    );
    remove = new RemoveMedia(listings, world.mediaRepo, world.storage);
  });

  describe("legitimate flow", () => {
    it("presigns, uploads, attaches and removes the owner's own media", async () => {
      const { key, media } = await uploadAndAttach(USER_A, LISTING_A);

      expect(media.listingId).toBe(LISTING_A);
      expect(media.uploadId).toBeDefined();

      await remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: media.id });

      expect(world.media).toHaveLength(0);
      const prefix = key.replace(/original\.jpg$/, "");
      expect(world.deletedKeys.length).toBeGreaterThan(0);
      expect(world.deletedKeys.every((k) => k.startsWith(prefix))).toBe(true);
    });

    it("records the upload for the calling User only", async () => {
      const presigned = await presign.execute({
        userId: USER_A,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });

      expect(world.uploads).toHaveLength(1);
      expect(world.uploads[0]).toMatchObject({
        userId: USER_A,
        key: presigned.key,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });
    });
  });

  describe("cross-User rejection", () => {
    let victimKey: string;
    let victimMediaId: string;

    beforeEach(async () => {
      const victim = await uploadAndAttach(USER_B, LISTING_B);
      victimKey = victim.key;
      victimMediaId = victim.media.id;
    });

    it("rejects attaching a key already used by another User's Listing", async () => {
      const err = await rejection(
        attach.execute({
          listingId: LISTING_A,
          userId: USER_A,
          key: victimKey,
          kind: "image",
          sortOrder: 0,
        }),
      );

      expect(err).toBeInstanceOf(BadRequestException);
      expect(codeOf(err)).toBe("UPLOAD_NOT_AVAILABLE");
      expect(world.media.filter((m) => m.listingId === LISTING_A)).toHaveLength(0);
    });

    it("rejects a key that was never presigned", async () => {
      world.putObject("pending/forged-by-user-a/original.jpg", {
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });

      const err = await rejection(
        attach.execute({
          listingId: LISTING_A,
          userId: USER_A,
          key: "pending/forged-by-user-a/original.jpg",
          kind: "image",
          sortOrder: 0,
        }),
      );

      expect(codeOf(err)).toBe("UPLOAD_NOT_AVAILABLE");
      expect(world.media.filter((m) => m.listingId === LISTING_A)).toHaveLength(0);
    });

    it("answers unknown, foreign and wrong-kind keys identically", async () => {
      const own = await presign.execute({
        userId: USER_A,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });
      world.completeUpload(own.key);
      const attempt = (key: string, kind: "image" | "video") =>
        rejection(
          attach.execute({ listingId: LISTING_A, userId: USER_A, key, kind, sortOrder: 0 }),
        ).then((err) => (err as BadRequestException).getResponse());

      const wrongKind = await attempt(own.key, "video");
      const foreign = await attempt(victimKey, "image");
      const unknown = await attempt("pending/never-presigned/original.jpg", "image");

      expect(foreign).toEqual(wrongKind);
      expect(foreign).toEqual(unknown);
    });

    it("rejects a poster key the caller did not upload", async () => {
      const presigned = await presign.execute({
        userId: USER_A,
        kind: "video",
        contentType: "video/mp4",
        sizeBytes: 2048,
      });
      world.completeUpload(presigned.key);

      const err = await rejection(
        attach.execute({
          listingId: LISTING_A,
          userId: USER_A,
          key: presigned.key,
          kind: "video",
          sortOrder: 0,
          posterKey: victimKey,
        }),
      );

      expect(codeOf(err)).toBe("UPLOAD_NOT_AVAILABLE");
    });

    it("never deletes the other User's original or derivatives when User A removes their own media", async () => {
      await rejection(
        attach.execute({
          listingId: LISTING_A,
          userId: USER_A,
          key: victimKey,
          kind: "image",
          sortOrder: 0,
        }),
      );
      const own = await uploadAndAttach(USER_A, LISTING_A, 1);

      await remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: own.media.id });

      const victimPrefix = victimKey.replace(/original\.jpg$/, "");
      expect(world.deletedKeys.some((k) => k.startsWith(victimPrefix))).toBe(false);
      expect(objectsUnder(victimPrefix)).toContain(victimKey);
    });

    it("cannot remove the other User's media through the caller's own Listing", async () => {
      const err = await rejection(
        remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: victimMediaId }),
      );

      expect(err).toBeInstanceOf(NotFoundException);
      expect(world.media.map((m) => m.id)).toContain(victimMediaId);
      expect(world.deletedKeys).toEqual([]);
    });

    it("does not let a pre-fix duplicate row delete the original owner's objects", async () => {
      // Created before ADR-0077: A's Listing already holds B's key with no provenance.
      world.media.push(
        ListingMedia.create({
          id: "legacy-duplicate",
          listingId: LISTING_A,
          kind: "image",
          key: victimKey,
          sortOrder: 0,
        }),
      );

      await remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: "legacy-duplicate" });

      expect(world.media.map((m) => m.id)).not.toContain("legacy-duplicate");
      expect(world.deletedKeys).toEqual([]);
      expect(world.objects.has(victimKey)).toBe(true);
    });

    it("keeps shared objects when the owning row is removed while a legacy duplicate still references them", async () => {
      world.media.push(
        ListingMedia.create({
          id: "legacy-duplicate",
          listingId: LISTING_A,
          kind: "image",
          key: victimKey,
          sortOrder: 0,
        }),
      );

      await remove.execute({ listingId: LISTING_B, userId: USER_B, mediaId: victimMediaId });

      expect(world.deletedKeys).toEqual([]);
      expect(world.objects.has(victimKey)).toBe(true);
    });
  });

  describe("uploaded object validation", () => {
    async function presigned() {
      return presign.execute({
        userId: USER_A,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });
    }

    it.each([
      ["never uploaded", undefined],
      ["empty", { contentType: "image/jpeg", sizeBytes: 0 }],
      ["wrong content type", { contentType: "text/html", sizeBytes: 2048 }],
      ["over the image cap", { contentType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 + 1 }],
    ])("rejects an object that is %s", async (_name, object) => {
      const { key } = await presigned();
      if (object) world.putObject(key, object);

      const err = await rejection(
        attach.execute({ listingId: LISTING_A, userId: USER_A, key, kind: "image", sortOrder: 0 }),
      );

      expect(err).toBeInstanceOf(BadRequestException);
      expect(codeOf(err)).toBe("UPLOAD_OBJECT_INVALID");
      expect(world.media).toHaveLength(0);
    });
  });

  describe("reuse, retry and races", () => {
    it("returns the same media when the same attach is retried", async () => {
      const first = await uploadAndAttach(USER_A, LISTING_A);

      const retry = await attach.execute({
        listingId: LISTING_A,
        userId: USER_A,
        key: first.key,
        kind: "image",
        sortOrder: 0,
      });

      expect(retry.media.id).toBe(first.media.id);
      expect(world.media).toHaveLength(1);
    });

    it("collapses two concurrent attaches of one upload to a single row", async () => {
      const { key } = await presign.execute({
        userId: USER_A,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });
      world.completeUpload(key);
      const input = { listingId: LISTING_A, userId: USER_A, key, kind: "image" as const, sortOrder: 0 };

      const [one, two] = await Promise.all([attach.execute(input), attach.execute(input)]);

      expect(one.media.id).toBe(two.media.id);
      expect(world.media).toHaveLength(1);
    });

    it("refuses to attach one upload to a second Listing", async () => {
      const first = await uploadAndAttach(USER_A, LISTING_A);

      const err = await rejection(
        attach.execute({
          listingId: LISTING_A2,
          userId: USER_A,
          key: first.key,
          kind: "image",
          sortOrder: 0,
        }),
      );

      expect(err).toBeInstanceOf(ConflictException);
      expect(codeOf(err)).toBe("UPLOAD_ALREADY_ATTACHED");
      expect(world.media).toHaveLength(1);
    });

    it("lets exactly one of two concurrent attaches to different Listings win", async () => {
      const { key } = await presign.execute({
        userId: USER_A,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 2048,
      });
      world.completeUpload(key);

      const results = await Promise.allSettled([
        attach.execute({ listingId: LISTING_A, userId: USER_A, key, kind: "image", sortOrder: 0 }),
        attach.execute({ listingId: LISTING_A2, userId: USER_A, key, kind: "image", sortOrder: 0 }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(codeOf(failed.reason)).toBe("UPLOAD_ALREADY_ATTACHED");
      expect(world.media).toHaveLength(1);
    });

    it("cannot re-attach an upload after its media was removed", async () => {
      const first = await uploadAndAttach(USER_A, LISTING_A);
      await remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: first.media.id });

      const err = await rejection(
        attach.execute({
          listingId: LISTING_A2,
          userId: USER_A,
          key: first.key,
          kind: "image",
          sortOrder: 0,
        }),
      );

      expect(codeOf(err)).toBe("UPLOAD_NOT_AVAILABLE");
      expect(world.media).toHaveLength(0);
    });

    it("deletes storage objects once when the same media is removed concurrently", async () => {
      const first = await uploadAndAttach(USER_A, LISTING_A);
      const input = { listingId: LISTING_A, userId: USER_A, mediaId: first.media.id };

      const results = await Promise.allSettled([remove.execute(input), remove.execute(input)]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(failed.reason).toBeInstanceOf(NotFoundException);
      expect(new Set(world.deletedKeys).size).toBe(world.deletedKeys.length);
    });

    it("keeps every other User's objects intact through a mixed concurrent run", async () => {
      const victim = await uploadAndAttach(USER_B, LISTING_B);
      const mine = await uploadAndAttach(USER_A, LISTING_A);
      const victimPrefix = victim.key.replace(/original\.jpg$/, "");

      await Promise.allSettled([
        remove.execute({ listingId: LISTING_A, userId: USER_A, mediaId: mine.media.id }),
        attach.execute({
          listingId: LISTING_A,
          userId: USER_A,
          key: mine.key,
          kind: "image",
          sortOrder: 0,
        }),
        attach.execute({
          listingId: LISTING_A,
          userId: USER_A,
          key: victim.key,
          kind: "image",
          sortOrder: 1,
        }),
      ]);

      expect(world.deletedKeys.some((k) => k.startsWith(victimPrefix))).toBe(false);
      expect(world.media.map((m) => m.id)).toContain(victim.media.id);
    });
  });
});
