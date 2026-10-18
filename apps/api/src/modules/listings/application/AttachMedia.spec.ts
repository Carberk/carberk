import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, BadRequestException } from "@nestjs/common";

import { Listing } from "../domain/Listing";
import { ListingMedia } from "../domain/ListingMedia";
import type { ListingRepository } from "../domain/ports/ListingRepository";
import type { MediaContentClassifierPort } from "../domain/ports/MediaContentClassifierPort";
import type { ImageVariantGenerator } from "../domain/ports/ImageVariantGenerator";

import { AttachMedia } from "./AttachMedia";
import { UploadAdoptionGuard } from "./UploadAdoptionGuard";
import { InMemoryMediaWorld } from "./testing/InMemoryMediaWorld";

class FakeListingRepository implements ListingRepository {
  listings: Listing[] = [];

  async save(listing: Listing): Promise<Listing> {
    this.listings.push(listing);
    return listing;
  }

  async findById(id: string): Promise<Listing | null> {
    return this.listings.find((l) => l.id === id) ?? null;
  }

  async findBySellerId(
    _sellerId: string,
    _opts?: { cursor?: { timestamp: string; id: string }; limit?: number },
  ): Promise<{ items: Listing[]; nextCursor?: { timestamp: string; id: string } }> {
    return { items: this.listings };
  }

  async update(listing: Listing): Promise<Listing> {
    const idx = this.listings.findIndex((l) => l.id === listing.id);
    if (idx >= 0) this.listings[idx] = listing;
    return listing;
  }

  async recomputePriceTmt(): Promise<number> {
    return 0;
  }

  async softDelete(_id: string, _at: Date): Promise<void> {
    const existing = this.listings.find((l) => l.id === _id);
    if (existing) {
      this.listings = this.listings.map((l) => (l.id === _id ? l.softDelete(_at) : l));
    }
  }
}

class FakeContentClassifier implements MediaContentClassifierPort {
  result: { isAcceptable: boolean; confidence: number; reason?: "nsfw" | "not-a-car" | "duplicate" | "unknown" } = {
    isAcceptable: true,
    confidence: 1.0,
  };

  async classify(_key: string) {
    return this.result;
  }
}

class FakeVariantGenerator implements ImageVariantGenerator {
  called = false;
  /** Runs while the generator holds the upload, before it returns. */
  during: (() => Promise<void> | void) | undefined;

  async generate(originalKey: string) {
    this.called = true;
    await this.during?.();
    return {
      variants: {
        thumbnail: `${originalKey}/thumbnail.webp`,
        list: `${originalKey}/list.webp`,
        detail: `${originalKey}/detail.webp`,
        fullscreen: `${originalKey}/fullscreen.webp`,
      },
      thumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH",
    };
  }
}

function seedActiveListing(repo: FakeListingRepository) {
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
  repo.listings.push(listing);
  return listing;
}

describe("AttachMedia", () => {
  let repo: FakeListingRepository;
  let world: InMemoryMediaWorld;
  let classifier: FakeContentClassifier;
  let variantGen: FakeVariantGenerator;
  let uc: AttachMedia;

  /** A presigned upload by `user-1` whose file has reached storage. */
  function presignedUpload(
    key: string,
    kind: "image" | "video" = "image",
    userId = "user-1",
  ): void {
    world.uploads.push({
      id: `upload-${key}`,
      userId,
      key,
      kind,
      contentType: kind === "image" ? "image/webp" : "video/mp4",
      sizeBytes: 1024,
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    world.completeUpload(key);
  }

  beforeEach(() => {
    repo = new FakeListingRepository();
    world = new InMemoryMediaWorld();
    classifier = new FakeContentClassifier();
    variantGen = new FakeVariantGenerator();
    uc = new AttachMedia(
      repo,
      world.mediaRepo,
      classifier,
      variantGen,
      new UploadAdoptionGuard(world.uploadRepo, world.inspector),
      world.claims,
    );
  });

  describe("common upload claim (#721, ADR-0088)", () => {
    const key = "pending/abc/original.webp";
    const input = { listingId: "listing-1", userId: "user-1", key, kind: "image" as const, sortOrder: 0 };

    beforeEach(() => {
      seedActiveListing(repo);
      presignedUpload(key);
    });

    it("reserves the upload for its Listing before any variant is generated", async () => {
      let duringGeneration: unknown;
      variantGen.during = () => {
        duringGeneration = world.claimOf(`upload-${key}`);
      };

      await uc.execute(input);

      expect(duringGeneration).toMatchObject({
        state: "PREPARING", target: { type: "listing", id: "listing-1" },
      });
      expect(world.stateOfKey(key)).toBe("ADOPTED");
    });

    it("answers a double-tapped attach with the same media when the twin commits between its reads", async () => {
      const first = await uc.execute(input);
      const read = world.mediaRepo.findByListingId.bind(world.mediaRepo);
      let staleReads = 1;
      world.mediaRepo.findByListingId = async (listingId: string) =>
        staleReads-- > 0 ? [] : read(listingId);

      const second = await uc.execute(input);

      expect(second.media.id).toBe(first.media.id);
      expect(await world.mediaRepo.findByListingId("listing-1")).toHaveLength(1);
    });

    it("keeps the photo's server-computed ThumbHash on the attached media", async () => {
      const result = await uc.execute(input);

      expect(result.media.thumbHash).toBe("1fsDBYCIiIiHiIdweIeHh4d4cIgH");
      expect((await world.mediaRepo.findByListingId("listing-1"))[0]?.thumbHash).toBe("1fsDBYCIiIiHiIdweIeHh4d4cIgH");
    });

    it("generates nothing for an upload a Profile Photo is already preparing", async () => {
      await world.claims.reserve({
        userId: "user-1", uploadIds: [`upload-${key}`], target: { type: "profile", id: "user-1" },
      });

      await expect(uc.execute(input)).rejects.toMatchObject({
        response: { code: "UPLOAD_ALREADY_ATTACHED" },
      });
      expect(variantGen.called).toBe(false);
      expect(world.media).toHaveLength(0);
    });

    it("retires the upload when generation fails, and refuses the retry", async () => {
      variantGen.during = () => {
        throw new Error("Sharp failed");
      };
      await expect(uc.execute(input)).rejects.toThrow("Sharp failed");

      expect(world.stateOfKey(key)).toBe("RETIRED");
      expect(world.cleanups).toEqual([`upload-${key}`]);
      variantGen.during = undefined;
      await expect(uc.execute(input)).rejects.toMatchObject({
        response: { code: "UPLOAD_NOT_AVAILABLE" },
      });
      expect(world.media).toHaveLength(0);
    });

    it("a joined retry that fails generation does not abandon the creator's in-flight claim", async () => {
      let calls = 0;
      let releaseCreator!: () => void;
      let creatorInside!: () => void;
      let joinerInside!: () => void;
      const gate = new Promise<void>((done) => { releaseCreator = done; });
      const creatorSignal = new Promise<void>((done) => { creatorInside = done; });
      const joinerSignal = new Promise<void>((done) => { joinerInside = done; });
      variantGen.generate = async (originalKey: string) => {
        calls += 1;
        if (calls === 1) {
          creatorInside();
          await gate;
          return {
            variants: {
              thumbnail: `${originalKey}/thumbnail.webp`,
              list: `${originalKey}/list.webp`,
              detail: `${originalKey}/detail.webp`,
              fullscreen: `${originalKey}/fullscreen.webp`,
            },
            thumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH",
          };
        }
        joinerInside();
        throw new Error("Sharp failed");
      };

      const creator = uc.execute(input);
      await creatorSignal;
      const joiner = uc.execute(input);
      await joinerSignal;

      await expect(joiner).rejects.toThrow("Sharp failed");
      // Only the attempt that created the token may abandon it: the creator is
      // still preparing, so the shared claim stays in flight and no retirement
      // work is recorded for it.
      expect(world.stateOfKey(key)).toBe("PREPARING");
      expect(world.cleanups).toEqual([]);

      releaseCreator();
      await expect(creator).resolves.toMatchObject({ media: { uploadId: `upload-${key}` } });
      expect(world.stateOfKey(key)).toBe("ADOPTED");
      expect(world.media).toHaveLength(1);
      expect(world.cleanups).toEqual([]);
    });

    it("the creator's own failure still abandons the shared claim", async () => {
      let calls = 0;
      let release!: () => void;
      let creatorInside!: () => void;
      let joinerInside!: () => void;
      const gate = new Promise<void>((done) => { release = done; });
      const creatorSignal = new Promise<void>((done) => { creatorInside = done; });
      const joinerSignal = new Promise<void>((done) => { joinerInside = done; });
      variantGen.generate = async () => {
        calls += 1;
        if (calls === 1) creatorInside();
        else joinerInside();
        await gate;
        throw new Error("Sharp failed");
      };

      const creator = uc.execute(input);
      await creatorSignal;
      const joiner = uc.execute(input);
      await joinerSignal;
      release();

      await expect(creator).rejects.toThrow("Sharp failed");
      await expect(joiner).rejects.toThrow("Sharp failed");
      expect(world.stateOfKey(key)).toBe("RETIRED");
      expect(world.cleanups).toEqual([`upload-${key}`]);
    });

    it("writes no media row when the reservation was retired during generation", async () => {
      variantGen.during = async () => {
        // What the storage scanner does to a stranded preparation.
        await world.claims.retire(null, `upload-${key}`);
      };

      await expect(uc.execute(input)).rejects.toMatchObject({
        response: { code: "UPLOAD_NOT_AVAILABLE" },
      });
      expect(world.media).toHaveLength(0);
      expect(world.stateOfKey(key)).toBe("RETIRED");
    });

    it("refuses a retired upload before asking storage about it", async () => {
      await world.claims.retire(null, `upload-${key}`);
      let inspected = false;
      const guard = new UploadAdoptionGuard(world.uploadRepo, {
        inspect: async (objectKey) => {
          inspected = true;
          return world.inspector.inspect(objectKey);
        },
      });

      await expect(guard.authorize("user-1", [{ key, kind: "image" }])).rejects.toMatchObject({
        response: { code: "UPLOAD_NOT_AVAILABLE" },
      });
      expect(inspected).toBe(false);
    });
  });

  it("attaches an image and calls variant generator", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.webp");

    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      key: "pending/abc/original.webp",
      kind: "image",
      sortOrder: 0,
      width: 1200,
      height: 800,
    });

    expect(result.media.listingId).toBe("listing-1");
    expect(result.media.kind).toBe("image");
    expect(result.media.uploadId).toBe("upload-pending/abc/original.webp");
    expect(variantGen.called).toBe(true);
    expect(world.media).toHaveLength(1);
  });

  it("refuses direct video adoption without server processing and its readiness fence", async () => {
    seedActiveListing(repo); presignedUpload("pending/abc/original.mp4", "video");
    await expect(uc.execute({ listingId: "listing-1", userId: "user-1", key: "pending/abc/original.mp4", kind: "video", sortOrder: 0, durationMs: 30000 })).rejects.toMatchObject({ response: { code: "VIDEO_PREPARED_PROTOCOL_REQUIRED" } });
    expect(world.media).toEqual([]);
  });

  it("rejects when photo limit (20) is exceeded", async () => {
    seedActiveListing(repo);
    for (let i = 0; i < 20; i++) {
      world.media.push(
        ListingMedia.create({
          id: `media-${i}`,
          listingId: "listing-1",
          kind: "image",
          key: `pending/${i}/original.webp`,
          sortOrder: i,
        }),
      );
    }
    presignedUpload("pending/extra/original.webp");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        key: "pending/extra/original.webp",
        kind: "image",
        sortOrder: 21,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when video limit (1) is exceeded", async () => {
    seedActiveListing(repo);
    world.media.push(
      ListingMedia.create({
        id: "media-video",
        listingId: "listing-1",
        kind: "video",
        key: "pending/vid/original.mp4",
        sortOrder: 0,
        durationMs: 30000,
      }),
    );
    presignedUpload("pending/extra/original.mp4", "video");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        key: "pending/extra/original.mp4",
        kind: "video",
        sortOrder: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns 404 for non-owner", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.webp", "image", "user-2");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-2",
        key: "pending/abc/original.webp",
        kind: "image",
        sortOrder: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for soft-deleted listing", async () => {
    const listing = seedActiveListing(repo);
    repo.listings[0] = listing.softDelete(new Date());
    presignedUpload("pending/abc/original.webp");

    await expect(
      uc.execute({
        listingId: "listing-1",
        userId: "user-1",
        key: "pending/abc/original.webp",
        kind: "image",
        sortOrder: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("calls classifier and still attaches when classifier returns unacceptable in S4", async () => {
    seedActiveListing(repo);
    presignedUpload("pending/abc/original.webp");
    classifier.result = { isAcceptable: false, confidence: 0.9, reason: "nsfw" };

    const result = await uc.execute({
      listingId: "listing-1",
      userId: "user-1",
      key: "pending/abc/original.webp",
      kind: "image",
      sortOrder: 0,
    });

    expect(result.media).toBeDefined();
    // In S4, NullContentClassifier always returns true; the branch for false exists but no-op
  });
});
