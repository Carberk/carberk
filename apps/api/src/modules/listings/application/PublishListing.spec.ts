import { FakeMeasurementCommit } from "../../measurement/application/testing/FakeMeasurementCommit";
import { describe, it, expect, beforeEach } from "vitest";
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";

import { ListingDraft } from "../domain/ListingDraft";
import { ListingMedia } from "../domain/ListingMedia";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import type { ListingDraftRepository } from "../domain/ports/ListingDraftRepository";
import type { ExchangeRatePort } from "../domain/ports/ExchangeRatePort";
import type { ListingEventPublisher } from "../domain/ports/ListingEventPublisher";
import type { ImageVariantGenerator } from "../domain/ports/ImageVariantGenerator";

import { PublishListing } from "./PublishListing";
import { UploadAdoptionGuard } from "./UploadAdoptionGuard";
import { InMemoryContactPhones } from "./testing/InMemoryContactPhones";
import { InMemoryMediaWorld } from "./testing/InMemoryMediaWorld";

/** The media world the next `makeUseCase()` reads uploads and storage from. */
let world = new InMemoryMediaWorld();
/** Sign-in and confirmed phones the next `makeUseCase()` checks the contact phone against. */
let contactPhones = new InMemoryContactPhones();
/** The use-case clock; real time unless a test fixes it. */
let clock = { now: () => new Date() };

/** A presigned upload by `userId` whose file has reached storage. */
function presignedUpload(key: string, userId = "user-1"): void {
  world.uploads.push({
    id: `upload-${key}`,
    userId,
    key,
    kind: "image",
    contentType: "image/webp",
    sizeBytes: 1024,
    createdAt: new Date("2026-05-01T00:00:00Z"),
  });
  world.completeUpload(key);
}

class FakeListingDraftRepository implements ListingDraftRepository {
  drafts: ListingDraft[] = [];

  async save(draft: ListingDraft): Promise<ListingDraft> {
    this.drafts.push(draft);
    return draft;
  }

  async saveWithinLimit(draft: ListingDraft): Promise<ListingDraft | null> {
    return this.save(draft);
  }

  async findById(id: string): Promise<ListingDraft | null> {
    return this.drafts.find((d) => d.id === id) ?? null;
  }

  async findByUserId(
    _userId: string,
    _opts?: { cursor?: { timestamp: string; id: string } | undefined; limit?: number | undefined },
  ): Promise<{ items: ListingDraft[]; nextCursor?: { timestamp: string; id: string } | undefined }> {
    return { items: this.drafts };
  }

  async update(draft: ListingDraft): Promise<ListingDraft> {
    const idx = this.drafts.findIndex((d) => d.id === draft.id);
    if (idx >= 0) this.drafts[idx] = draft;
    return draft;
  }

  async delete(_id: string): Promise<void> {
    this.drafts = this.drafts.filter((d) => d.id !== _id);
  }
}

class FakeExchangeRatePort implements ExchangeRatePort {
  rates: Record<string, number> = {};

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    return this.rates[`${from}_${to}`] ?? 0;
  }

  async listAll() {
    return Object.entries(this.rates).map(([key, rate]) => {
      const [fromCurrency, toCurrency] = key.split("_") as ["TMT" | "USD" | "AED", "TMT" | "USD" | "AED"];
      return { fromCurrency, toCurrency, rate, updatedAt: new Date() };
    });
  }
}

class FakeEventPublisher implements ListingEventPublisher {
  events: Array<{ event: string; listingId: string; sellerId?: string }> = [];

  async emit(payload: { event: string; listingId: string; sellerId?: string }): Promise<void> {
    this.events.push(payload);
  }
}

class FakeImageVariantGenerator implements ImageVariantGenerator {
  generated: string[] = [];
  hashes: Record<string, string> = {};
  /** Runs while the generator holds an upload, before it returns. */
  during: ((originalKey: string) => Promise<void> | void) | undefined;

  async generate(originalKey: string) {
    this.generated.push(originalKey);
    await this.during?.(originalKey);
    return {
      variants: {
        thumbnail: originalKey.replace("original.webp", "thumbnail.webp"),
        list: originalKey.replace("original.webp", "list.webp"),
        detail: originalKey.replace("original.webp", "detail.webp"),
        fullscreen: originalKey.replace("original.webp", "fullscreen.webp"),
      },
      // A distinct hash per photo, so a test can tell which row got which.
      thumbHash: this.hashes[originalKey] ?? "1fsDBYCIiIiHiIdweIeHh4d4cIgH",
    };
  }
}

class FakePrisma {
  auditLogs: Array<{
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    details: unknown;
  }> = [];

  createdListings: Array<Record<string, unknown>> = [];
  createdMedia: Array<Record<string, unknown>> = [];
  deletedDrafts: string[] = [];

  /** When set, the next transaction fails with this error and persists nothing. */
  failTransaction: (() => Error) | undefined;

  private rollBack(): void {
    // The real transaction rolls back every statement, so nothing is recorded.
    this.createdListings = [];
    this.createdMedia = [];
    this.deletedDrafts = [];
    this.auditLogs = [];
  }

  $transaction = async <T>(work: Promise<T>[] | ((tx: FakePrisma) => Promise<T>)): Promise<T | T[]> => {
    if (typeof work === "function") {
      try {
        // An interactive transaction is atomic, so a failure adopts nothing:
        // the in-memory claim is not reached rather than undone.
        if (this.failTransaction) throw this.failTransaction();
        return await work(this);
      } catch (err) {
        this.rollBack();
        throw err;
      }
    }
    if (this.failTransaction) {
      await Promise.allSettled(work);
      this.rollBack();
      throw this.failTransaction();
    }
    return Promise.all(work);
  };

  listing = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.createdListings.push(data);
      const d = data as Record<string, unknown>;
      return {
        id: d["id"] as string,
        sellerId: d["sellerId"] as string,
        status: d["status"] as string,
        brandId: d["brandId"] as string,
        modelId: d["modelId"] as string,
        generationId: d["generationId"] as string | null,
        year: d["year"] as number | null,
        vin: d["vin"] as string | null,
        cityId: d["cityId"] as string,
        regionId: d["regionId"] as string | null,
        priceAmount: d["priceAmount"] as number,
        priceCurrency: d["priceCurrency"] as string,
        contactPhone: d["contactPhone"] as string | null,
        allowCalls: d["allowCalls"] as boolean,
        allowChat: d["allowChat"] as boolean,
        publishedAt: d["publishedAt"] as Date,
        condition: d["condition"] as string | null,
        colorId: d["colorId"] as string | null,
        bodyTypeId: d["bodyTypeId"] as string | null,
        engineTypeId: d["engineTypeId"] as string | null,
        transmissionId: d["transmissionId"] as string | null,
        driveTypeId: d["driveTypeId"] as string | null,
        enginePower: d["enginePower"] as number | null,
        mileageKm: d["mileageKm"] as number | null,
        locationText: d["locationText"] as string | null,
        description: d["description"] as string | null,
        acceptsExchange: d["acceptsExchange"] as boolean,
        installmentAvailable: d["installmentAvailable"] as boolean,
        damaged: d["damaged"] as boolean | null,
        knownIssuesText: d["knownIssuesText"] as string | null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };

  listingMedia = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.createdMedia.push(data);
      return data;
    },
  };

  listingDraft = {
    delete: async ({ where }: { where: { id: string } }) => {
      this.deletedDrafts.push(where.id);
    },
  };

  auditLog = {
    create: async ({ data }: { data: unknown }) => {
      this.auditLogs.push(data as FakePrisma["auditLogs"][number]);
    },
  };
}

function makeUseCase(
  draftRepo?: FakeListingDraftRepository,
  prisma?: FakePrisma,
  exchangeRates?: FakeExchangeRatePort,
  events?: FakeEventPublisher,
  variantGenerator?: FakeImageVariantGenerator,
  measurement?: FakeMeasurementCommit,
) {
  return new PublishListing(
    draftRepo ?? new FakeListingDraftRepository(),
    (prisma ?? new FakePrisma()) as unknown as ConstructorParameters<typeof PublishListing>[1],
    exchangeRates ?? new FakeExchangeRatePort(),
    events ?? new FakeEventPublisher(),
    variantGenerator ?? new FakeImageVariantGenerator(),
    new UploadAdoptionGuard(world.uploadRepo, world.inspector),
    contactPhones.policy,
    clock,
    world.claims,
    undefined,
    measurement,
  );
}

function seedDraft(
  repo: FakeListingDraftRepository,
  payload: Record<string, unknown>,
  userId = "user-1",
) {
  const draft = ListingDraft.create({
    id: "draft-1",
    userId,
    payload,
  });
  repo.drafts.push(draft);
  return draft;
}

describe("PublishListing", () => {
  let draftRepo: FakeListingDraftRepository;
  let prisma: FakePrisma;
  let exchangeRates: FakeExchangeRatePort;
  let events: FakeEventPublisher;
  let variantGenerator: FakeImageVariantGenerator;

  beforeEach(() => {
    world = new InMemoryMediaWorld();
    contactPhones = new InMemoryContactPhones();
    clock = { now: () => new Date() };
    presignedUpload("photo1.webp");
    presignedUpload("photo2.webp");
    presignedUpload("photo3.webp");
    presignedUpload("p1.webp");
    presignedUpload("p2.webp");
    draftRepo = new FakeListingDraftRepository();
    prisma = new FakePrisma();
    exchangeRates = new FakeExchangeRatePort();
    events = new FakeEventPublisher();
    variantGenerator = new FakeImageVariantGenerator();
  });

  const validPayload = {
    brandId: "00000000-0000-0000-0000-000000000001",
    modelId: "00000000-0000-0000-0000-000000000002",
    cityId: "00000000-0000-0000-0000-000000000003",
    regionId: "00000000-0000-0000-0000-000000000004",
    priceAmount: 100000,
    priceCurrency: "TMT",
    year: 2020,
    condition: "used",
    mileageKm: 50000,
    description: "Great car",
    contactPhone: "+99361234567",
    allowCalls: true,
    allowChat: true,
    photos: [
      { photoId: "00000000-0000-0000-0000-000000000005", key: "photo1.webp", sortOrder: 0 },
      { photoId: "00000000-0000-0000-0000-000000000006", key: "photo2.webp", sortOrder: 1 },
      { photoId: "00000000-0000-0000-0000-000000000007", key: "photo3.webp", sortOrder: 2 },
    ],
    conditionDisclosure: {
      damaged: true,
      knownIssuesText: "Small scratch on rear bumper",
    },
  };


  it.each(["Corolla", "WBA1234567890ABCQ", "WBA1234567890ABC!", "WBA1234567890ABCDE1"])(
    "rejects invalid VIN %s at first publication before adopting photos", async (vin) => {
      seedDraft(draftRepo, { ...validPayload, vin });
      await expect(makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator)
        .execute({ draftId: "draft-1", userId: "user-1" }))
        .rejects.toMatchObject({ response: {
          code: "INVALID_DRAFT_PAYLOAD",
          details: { fieldErrors: { vin: expect.any(Array) } },
        } });
      expect(draftRepo.drafts).toHaveLength(1);
      expect(variantGenerator.generated).toHaveLength(0);
    },
  );
  it.each([undefined, "", "WBA1234567890ABCD", "wba1234567890abcd"])(
    "allows optional or valid VIN %s at first publication", async (vin) => {
      seedDraft(draftRepo, { ...validPayload, vin });
      const result = await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator)
        .execute({ draftId: "draft-1", userId: "user-1" });
      expect(result.listing).toBeTruthy();
    },
  );
  describe("contact phone (ADR-0081)", () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function publishError(payload: Record<string, unknown>): Promise<unknown> {
      seedDraft(draftRepo, payload);
      return makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator)
        .execute({ draftId: "draft-1", userId: "user-1" })
        .catch((err: unknown) => err);
    }

    function expectDraftKept(): void {
      expect(prisma.createdListings).toHaveLength(0);
      expect(prisma.deletedDrafts).toHaveLength(0);
      expect(draftRepo.drafts.map((d) => d.id)).toEqual(["draft-1"]);
      expect(variantGenerator.generated).toEqual([]);
    }

    it("publishes with the seller's sign-in phone and stores it", async () => {
      seedDraft(draftRepo, validPayload);

      await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator).execute({
        draftId: "draft-1",
        userId: "user-1",
      });

      expect(prisma.createdListings[0]).toMatchObject({ contactPhone: "+99361234567" });
    });

    it("publishes with a number the seller confirmed in the last 7 days", async () => {
      contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - 6 * DAY));
      seedDraft(draftRepo, { ...validPayload, contactPhone: "+99365123456" });

      await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator).execute({
        draftId: "draft-1",
        userId: "user-1",
      });

      expect(prisma.createdListings[0]).toMatchObject({ contactPhone: "+99365123456" });
    });

    it.each([
      ["calls on", true],
      ["calls off", false],
    ])("answers CONTACT_PHONE_REQUIRED without a contact phone (%s)", async (_name, allowCalls) => {
      const { contactPhone: _, ...rest } = validPayload;

      const error = await publishError({ ...rest, allowCalls, allowChat: true });

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_REQUIRED",
      });
      expectDraftKept();
    });

    it("answers INVALID_DRAFT_PAYLOAD with every missing field when the phone is not the only one", async () => {
      const { contactPhone: _, year: __, ...rest } = validPayload;

      const error = await publishError(rest);

      const response = (error as BadRequestException).getResponse() as {
        code: string;
        details: { fieldErrors: Record<string, unknown> };
      };
      expect(response.code).toBe("INVALID_DRAFT_PAYLOAD");
      expect(Object.keys(response.details.fieldErrors)).toEqual(
        expect.arrayContaining(["year", "contactPhone"]),
      );
      expectDraftKept();
    });

    it("answers CONTACT_PHONE_NOT_CONFIRMED / not_confirmed for a number nobody confirmed", async () => {
      const error = await publishError({ ...validPayload, contactPhone: "+99365123456" });

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason: "not_confirmed" },
      });
      expectDraftKept();
    });

    it("answers CONTACT_PHONE_NOT_CONFIRMED / not_confirmed for free text from an old draft", async () => {
      const error = await publishError({ ...validPayload, contactPhone: "8 800 555 35 35" });

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason: "not_confirmed" },
      });
      expectDraftKept();
    });

    it("judges the 7 days by the injected clock", async () => {
      const confirmedAt = new Date("2026-01-01T00:00:00Z");
      contactPhones.confirm("user-1", "+99365123456", confirmedAt);
      clock = { now: () => new Date(confirmedAt.getTime() + 7 * DAY - 1) };
      seedDraft(draftRepo, { ...validPayload, contactPhone: "+99365123456" });

      const { listing } = await makeUseCase(
        draftRepo, prisma, exchangeRates, events, variantGenerator,
      ).execute({ draftId: "draft-1", userId: "user-1" });

      expect(listing.contactPhone).toBe("+99365123456");
    });

    it("answers CONTACT_PHONE_NOT_CONFIRMED / expired once the 7 days have ended", async () => {
      contactPhones.confirm("user-1", "+99365123456", new Date(Date.now() - 7 * DAY - 1000));

      const error = await publishError({ ...validPayload, contactPhone: "+99365123456" });

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "CONTACT_PHONE_NOT_CONFIRMED",
        details: { reason: "expired" },
      });
      expectDraftKept();
    });
  });

  it("refuses two attached photos without publishing or discarding the draft", async () => {
    seedDraft(draftRepo, { ...validPayload, photos: validPayload.photos.slice(0, 2) });
    const error = await makeUseCase(draftRepo, prisma).execute({ draftId: "draft-1", userId: "user-1" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "INVALID_DRAFT_PAYLOAD",
      details: { formErrors: ["AT_LEAST_THREE_PHOTOS_REQUIRED"] },
    });
    expect(prisma.createdListings).toEqual([]);
    expect(prisma.deletedDrafts).toEqual([]);
  });

  it.each([1, 2])("refuses three draft slots containing only %i uploaded keys", async (keyedCount) => {
    const photos = validPayload.photos.map((photo, index) => index < keyedCount ? photo : { photoId: photo.photoId, sortOrder: photo.sortOrder });
    seedDraft(draftRepo, { ...validPayload, photos });
    const error = await makeUseCase(draftRepo, prisma).execute({ draftId: "draft-1", userId: "user-1" }).catch((err: unknown) => err);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "INVALID_DRAFT_PAYLOAD", details: { formErrors: ["AT_LEAST_THREE_PHOTOS_REQUIRED"] } });
    expect(prisma.createdMedia).toEqual([]);
    expect(prisma.deletedDrafts).toEqual([]);
  });

  it("refuses twenty-one attached photos without publication", async () => {
    const photos = Array.from({ length: 21 }, (_, index) => ({
      photoId: `00000000-0000-0000-0000-${String(100 + index).padStart(12, "0")}`,
      key: `cap-${index}.webp`, sortOrder: index,
    }));
    photos.forEach((photo) => presignedUpload(photo.key));
    seedDraft(draftRepo, { ...validPayload, photos });
    const error = await makeUseCase(draftRepo, prisma).execute({ draftId: "draft-1", userId: "user-1" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "INVALID_DRAFT_PAYLOAD", details: { formErrors: ["MEDIA_LIMIT_EXCEEDED"] } });
    expect(prisma.createdListings).toEqual([]);
  });

  it("stores each published photo's server-computed ThumbHash on its own media row", async () => {
    seedDraft(draftRepo, validPayload);
    variantGenerator.hashes = { "photo2.webp": "2yMBBYCIh4iHiHeAiId4dXh3f4f4" };

    await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator).execute({ draftId: "draft-1", userId: "user-1" });

    expect(prisma.createdMedia.map((row) => [row["key"], row["thumbHash"]])).toEqual([
      ["photo1.webp", "1fsDBYCIiIiHiIdweIeHh4d4cIgH"],
      ["photo2.webp", "2yMBBYCIh4iHiHeAiId4dXh3f4f4"],
      ["photo3.webp", "1fsDBYCIiIiHiIdweIeHh4d4cIgH"],
    ]);
  });

  it("commits a minimal authoritative publication fact and keeps publication usable during collection refusal", async () => {
    seedDraft(draftRepo, validPayload);
    const measurement = new FakeMeasurementCommit();
    const result = await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator, measurement).execute({ draftId: "draft-1", userId: "user-1" });
    expect(measurement.facts).toHaveLength(2);
    expect(measurement.facts[0]?.event).toMatchObject({ eventName: "listing_published", context: { platform: "server" }, payload: { listingId: result.listing.id, cityId: validPayload.cityId, draftId: "draft-1" } });
    expect(measurement.facts[1]?.event).toMatchObject({eventName:"listing_visibility_changed",payload:{listingId:result.listing.id,visibility:"public",reason:"published"}});
    expect(JSON.stringify(measurement.facts)).not.toContain(validPayload.description);
    expect(JSON.stringify(measurement.facts)).not.toContain(validPayload.contactPhone);
  });
  it("keeps publication usable when measurement capture is unavailable", async () => {
    seedDraft(draftRepo, validPayload);
    const measurement = new FakeMeasurementCommit(); measurement.unavailable = true;
    expect((await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator, measurement).execute({ draftId: "draft-1", userId: "user-1" })).listing.status).toBe("active");
  });
  it("publishes a valid draft", async () => {
    seedDraft(draftRepo, validPayload);

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
    const result = await uc.execute({ draftId: "draft-1", userId: "user-1" });

    expect(result.listing.status).toBe("active");
    expect(result.listing.brandId).toBe(validPayload.brandId);
    expect(result.listing.conditionDisclosure).toMatchObject(validPayload.conditionDisclosure);
    expect(prisma.createdListings).toHaveLength(1);
    expect(prisma.createdListings[0]).toMatchObject({
      damaged: true,
      knownIssuesText: validPayload.conditionDisclosure.knownIssuesText,
    });
    expect(prisma.createdMedia).toHaveLength(3);
    expect(variantGenerator.generated).toEqual(["photo1.webp", "photo2.webp", "photo3.webp"]);
    expect(prisma.deletedDrafts).toContain("draft-1");
    expect(prisma.auditLogs).toHaveLength(1);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "listing.published",
      actorId: "user-1",
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "ListingCreated",
      sellerId: "user-1",
    });
  });

  it("throws NotFoundException for non-existent draft", async () => {
    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
    await expect(
      uc.execute({ draftId: "missing", userId: "user-1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException for draft owned by another user", async () => {
    seedDraft(draftRepo, validPayload, "user-1");

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-2" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws BadRequestException when draft is missing required fields", async () => {
    seedDraft(draftRepo, { brandId: validPayload.brandId });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when year is missing", async () => {
    const { year: _, ...payloadWithoutYear } = validPayload;
    seedDraft(draftRepo, payloadWithoutYear);

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when mileageKm is missing for used condition", async () => {
    const { mileageKm: _, ...payloadWithoutMileage } = validPayload;
    seedDraft(draftRepo, payloadWithoutMileage);

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("accepts missing mileageKm when condition is new", async () => {
    const { mileageKm: _, ...payloadNew } = validPayload;
    seedDraft(draftRepo, { ...payloadNew, condition: "new", conditionDisclosure: { damaged: false } });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    const result = await uc.execute({ draftId: "draft-1", userId: "user-1" });
    expect(result.listing.status).toBe("active");
  });

  it("throws BadRequestException when description is empty/blank", async () => {
    seedDraft(draftRepo, { ...validPayload, description: "   " });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when no photos have a key (none attached)", async () => {
    seedDraft(draftRepo, {
      ...validPayload,
      photos: [{ photoId: "00000000-0000-0000-0000-000000000005", sortOrder: 0 }],
    });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException with CONTACT_METHOD_REQUIRED when both contact methods are false", async () => {
    seedDraft(draftRepo, { ...validPayload, allowCalls: false, allowChat: false });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException with EXCHANGE_RATE_MISSING for USD when rate is absent", async () => {
    seedDraft(draftRepo, { ...validPayload, priceCurrency: "USD" });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("publishes a USD-priced draft when exchange rate exists", async () => {
    seedDraft(draftRepo, { ...validPayload, priceCurrency: "USD" });
    exchangeRates.rates["USD_TMT"] = 3.5;

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    const result = await uc.execute({ draftId: "draft-1", userId: "user-1" });

    expect(result.listing.priceCurrency).toBe("USD");
    expect(prisma.createdListings).toHaveLength(1);
    expect(prisma.createdListings[0]?.["priceTmt"]).toBe(
      (validPayload.priceAmount as number) * 3.5,
    );
  });

  it("stores a TMT price as its own priceTmt", async () => {
    seedDraft(draftRepo, validPayload);

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await uc.execute({ draftId: "draft-1", userId: "user-1" });

    expect(prisma.createdListings[0]?.["priceTmt"]).toBe(validPayload.priceAmount);
  });

  it("publishes an AED-priced draft when exchange rate exists", async () => {
    seedDraft(draftRepo, { ...validPayload, priceCurrency: "AED" });
    exchangeRates.rates["AED_TMT"] = 0.95;

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    const result = await uc.execute({ draftId: "draft-1", userId: "user-1" });

    expect(result.listing.priceCurrency).toBe("AED");
  });

  it("creates multiple media rows for multiple photos", async () => {
    seedDraft(draftRepo, {
      ...validPayload,
      photos: [
        { photoId: "00000000-0000-0000-0000-000000000005", key: "p1.webp", sortOrder: 0 },
        { photoId: "00000000-0000-0000-0000-000000000006", key: "p2.webp", sortOrder: 1 },
        { photoId: "00000000-0000-0000-0000-000000000007", key: "photo3.webp", sortOrder: 2 },
      ],
    });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
    await uc.execute({ draftId: "draft-1", userId: "user-1" });

    expect(prisma.createdMedia).toHaveLength(3);
    expect(variantGenerator.generated).toEqual(["p1.webp", "p2.webp", "photo3.webp"]);
  });

  // #536: User B's Listing publicly exposes its media key, so a known key must
  // authorize nothing for User A's draft.
  describe("upload ownership (#536, ADR-0079)", () => {
    const photoDraft = (key: string) => ({
      ...validPayload,
      photos: [
        { photoId: "00000000-0000-0000-0000-000000000005", key, sortOrder: 0 },
        ...validPayload.photos.slice(1),
      ],
    });

    async function publishError() {
      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      return uc.execute({ draftId: "draft-1", userId: "user-1" }).then(
        () => {
          throw new Error("Expected publish to be rejected");
        },
        (err: unknown) => err,
      );
    }

    function expectNothingPublished() {
      expect(prisma.createdListings).toHaveLength(0);
      expect(prisma.createdMedia).toHaveLength(0);
      expect(prisma.deletedDrafts).toEqual([]);
      expect(variantGenerator.generated).toEqual([]);
    }

    it("does not publish a draft whose photo key was never presigned", async () => {
      world.putObject("pending/forged/original.webp", { contentType: "image/webp", sizeBytes: 1024 });
      seedDraft(draftRepo, photoDraft("pending/forged/original.webp"));

      const err = await publishError();

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: "UPLOAD_NOT_AVAILABLE",
      });
      expectNothingPublished();
    });

    it("does not publish a key another User presigned and attached to their own Listing", async () => {
      presignedUpload("pending/user-b-upload/original.webp", "user-b");
      world.media.push(
        ListingMedia.create({
          id: "victim-media",
          listingId: "listing-b",
          kind: "image",
          key: "pending/user-b-upload/original.webp",
          sortOrder: 0,
          uploadId: "upload-pending/user-b-upload/original.webp",
        }),
      );
      seedDraft(draftRepo, photoDraft("pending/user-b-upload/original.webp"));

      const err = await publishError();

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: "UPLOAD_NOT_AVAILABLE",
      });
      expectNothingPublished();
    });

    it("does not publish an upload its owner already attached to another Listing", async () => {
      world.media.push(
        ListingMedia.create({
          id: "earlier-media",
          listingId: "listing-earlier",
          kind: "image",
          key: "photo1.webp",
          sortOrder: 0,
          uploadId: "upload-photo1.webp",
        }),
      );
      seedDraft(draftRepo, photoDraft("photo1.webp"));

      const err = await publishError();

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: "UPLOAD_ALREADY_ATTACHED",
      });
      expectNothingPublished();
    });

    it("does not publish when the uploaded file never reached storage", async () => {
      world.objects.delete("photo1.webp");
      seedDraft(draftRepo, photoDraft("photo1.webp"));

      const err = await publishError();

      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: "UPLOAD_OBJECT_INVALID",
        details: { key: "photo1.webp", photoId: "00000000-0000-0000-0000-000000000005" },
      });
      expectNothingPublished();
      // A conditional PUT may still be in flight. Missing bytes authorize no retirement.
      expect(world.claimOf("upload-photo1.webp").state).toBe("AVAILABLE");
      expect(world.cleanups).toEqual([]);
      expect(world.claimOf("upload-photo2.webp").state).toBe("AVAILABLE");
      expect(world.claimOf("upload-photo3.webp").state).toBe("AVAILABLE");
    });

    it.each([0, null])("keeps an incomplete conditional PUT adoptable and accepts its completed retry (%s)", async (size) => {
      const upload = world.uploads.find((u) => u.key === "photo1.webp")!;
      upload.writeProtocol = "conditional-v1";
      if (size === null) world.objects.delete(upload.key);
      else world.putObject(upload.key, { contentType: "image/webp", sizeBytes: size });
      seedDraft(draftRepo, photoDraft(upload.key));
      await publishError();
      expect(world.claimOf(upload.id).state).toBe("AVAILABLE");
      expect(world.cleanups).toEqual([]);
      world.completeUpload(upload.key);
      const result = await makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator)
        .execute({ draftId: "draft-1", userId: "user-1" });
      expect(result.listing.status).toBe("active");
    });

    it("re-inspects a positive mismatch before retirement, leaving a corrected object adoptable", async () => {
      seedDraft(draftRepo, photoDraft("photo1.webp"));
      const inspect = world.inspector.inspect;
      let first = true;
      world.inspector.inspect = async (key) => {
        if (key === "photo1.webp" && first) {
          first = false;
          return { contentType: "image/png", sizeBytes: 100 };
        }
        return inspect(key);
      };
      await publishError();
      expect(world.claimOf("upload-photo1.webp").state).toBe("AVAILABLE");
      expect(world.cleanups).toEqual([]);
    });

    it.each([
      { contentType: "image/png", sizeBytes: 100 },
      { contentType: "image/webp", sizeBytes: 5 * 1024 * 1024 + 1 },
    ])("retires only the positively mismatched object and names the draft photo (%s)", async (object) => {
      seedDraft(draftRepo, photoDraft("photo1.webp"));
      world.putObject("photo1.webp", object);
      const err = await publishError();
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: "UPLOAD_OBJECT_INVALID",
        details: { key: "photo1.webp", photoId: "00000000-0000-0000-0000-000000000005" },
      });
      expect(world.claimOf("upload-photo1.webp").state).toBe("RETIRED");
      expect(world.cleanups).toEqual(["upload-photo1.webp"]);
      expectNothingPublished();
    });

    it("rejects the same photo key listed twice", async () => {
      seedDraft(draftRepo, {
        ...validPayload,
        photos: [
          { photoId: "00000000-0000-0000-0000-000000000005", key: "p1.webp", sortOrder: 0 },
          { photoId: "00000000-0000-0000-0000-000000000006", key: "p1.webp", sortOrder: 1 },
          { photoId: "00000000-0000-0000-0000-000000000007", key: "photo3.webp", sortOrder: 2 },
        ],
      });

      const err = await publishError();

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({ message: "A photo key can be used only once" });
      expectNothingPublished();
    });

    it("links each media row to the upload it adopts", async () => {
      seedDraft(draftRepo, photoDraft("photo1.webp"));

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      await uc.execute({ draftId: "draft-1", userId: "user-1" });

      expect(prisma.createdMedia[0]).toMatchObject({
        key: "photo1.webp",
        uploadId: "upload-photo1.webp",
      });
    });

    // #721, ADR-0088: the common claim, not the unique link, decides the adopter.
    const DRAFT_KEYS = ["p1.webp", "p2.webp", "photo3.webp"];
    const threePhotoDraft = () => ({
      ...validPayload,
      photos: DRAFT_KEYS.map((key, sortOrder) => ({
        photoId: `00000000-0000-0000-0000-00000000000${sortOrder + 5}`, key, sortOrder,
      })),
    });
    const draftStates = () => DRAFT_KEYS.map((key) => world.stateOfKey(key));

    it("reserves every photo for the new Listing before generating any variant", async () => {
      seedDraft(draftRepo, threePhotoDraft());
      const seen: string[] = [];
      variantGenerator.during = () => {
        seen.push(draftStates().join());
      };

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      const { listing } = await uc.execute({ draftId: "draft-1", userId: "user-1" });

      expect(seen).toEqual(Array(3).fill("PREPARING,PREPARING,PREPARING"));
      expect(world.claimOf("upload-p1.webp")).toMatchObject({
        state: "ADOPTED", target: { type: "listing", id: listing.id },
      });
      expect(draftStates()).toEqual(["ADOPTED", "ADOPTED", "ADOPTED"]);
    });

    it("publishes and generates nothing when a Profile Photo is preparing one of the photos", async () => {
      seedDraft(draftRepo, threePhotoDraft());
      await world.claims.reserve({
        userId: "user-1", uploadIds: ["upload-p2.webp"], target: { type: "profile", id: "user-1" },
      });

      const err = await publishError();

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: "UPLOAD_ALREADY_ATTACHED",
      });
      expectNothingPublished();
      // All or none: the photos nobody else holds are not left reserved.
      expect(draftStates()).toEqual(["AVAILABLE", "PREPARING", "AVAILABLE"]);
    });

    it("reports an unavailable upload, with nothing published, when its reservation was retired meanwhile", async () => {
      seedDraft(draftRepo, photoDraft("photo1.webp"));
      variantGenerator.during = async () => {
        // What the storage scanner does to a stranded preparation.
        await world.claims.retire(null, "upload-photo1.webp");
      };

      const err = await publishError();

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({ code: "UPLOAD_NOT_AVAILABLE" });
      expect(prisma.createdListings).toHaveLength(0);
      expect(prisma.createdMedia).toHaveLength(0);
      expect(prisma.deletedDrafts).toEqual([]);
    });

    it("rethrows a failed transaction, releases what it had reserved, and lets a retry publish the same photos", async () => {
      seedDraft(draftRepo, photoDraft("photo1.webp"));
      const failure = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      prisma.failTransaction = () => failure;

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      await expect(
        uc.execute({ draftId: "draft-1", userId: "user-1" }).then(
          () => {
            throw new Error("Expected publish to be rejected");
          },
          (err: unknown) => err,
        ),
      ).resolves.toBe(failure);
      expect(prisma.createdListings).toHaveLength(0);
      // #735 / ADR-0089: a transient failure releases the reservation instead of
      // retiring every photo; nothing is recorded for deletion.
      const draftUploads = ["upload-photo1.webp", "upload-photo2.webp", "upload-photo3.webp"];
      expect(draftUploads.map((id) => world.claimOf(id).state)).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE"]);
      expect(world.cleanups).toEqual([]);

      prisma.failTransaction = undefined;
      const { listing } = await uc.execute({ draftId: "draft-1", userId: "user-1" });
      expect(listing.status).toBe("active");
      expect(draftUploads.map((id) => world.claimOf(id).state)).toEqual(["ADOPTED", "ADOPTED", "ADOPTED"]);
    });

    it("releases every reserved photo when generation fails transiently, and a retry publishes with the same photos", async () => {
      seedDraft(draftRepo, threePhotoDraft());
      let failed = false;
      variantGenerator.during = (key) => {
        if (!failed && key === "p2.webp") {
          failed = true;
          throw new Error("Sharp failed");
        }
      };

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      await expect(
        uc.execute({ draftId: "draft-1", userId: "user-1" }).then(
          () => {
            throw new Error("Expected publish to be rejected");
          },
          (err: unknown) => err,
        ),
      ).resolves.toMatchObject({ message: "Sharp failed" });
      expect(prisma.createdListings).toHaveLength(0);
      expect(draftStates()).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE"]);
      expect(world.cleanups).toEqual([]);

      const { listing } = await uc.execute({ draftId: "draft-1", userId: "user-1" });
      expect(listing.status).toBe("active");
      expect(variantGenerator.generated).toEqual([
        "p1.webp", "p2.webp", "photo3.webp",
        "p1.webp", "p2.webp", "photo3.webp",
      ]);
    });

    it.each([false, true])("holds every claim until sibling generators stop after a failure (permanent=%s)", async (permanent) => {
      seedDraft(draftRepo, threePhotoDraft());
      let unblock!: () => void;
      let started!: () => void;
      const hold = new Promise<void>((resolve) => { unblock = resolve; });
      const running = new Promise<void>((resolve) => { started = resolve; });
      variantGenerator.during = async (key) => {
        if (key === "p1.webp") { started(); await hold; }
        if (key === "p2.webp") throw permanent
          ? new DomainError(LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID, "Corrupt image")
          : new Error("storage unavailable");
      };
      const pending = publishError();
      await running;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const whileRunning = draftStates();
      const cleanupWhileRunning = [...world.cleanups];
      const competing = await world.claims.reserve({ userId: "user-1", uploadIds: ["upload-p1.webp"],
        target: { type: "profile", id: "user-1" } }).catch((error: unknown) => error);
      unblock();
      await pending;
      expect(whileRunning).toEqual(["PREPARING", "PREPARING", "PREPARING"]);
      expect(cleanupWhileRunning).toEqual([]);
      expect(competing).toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
      expect(draftStates()).toEqual(permanent ? ["AVAILABLE", "RETIRED", "AVAILABLE"] : ["AVAILABLE", "AVAILABLE", "AVAILABLE"]);
    });

    it("names the photo and retires only that upload when generation proves it permanently unusable", async () => {
      seedDraft(draftRepo, threePhotoDraft());
      variantGenerator.during = (key) => {
        if (key === "p2.webp") {
          // The contract with ImageVariantGenerator: bytes that can never be an
          // image are reported as UPLOAD_OBJECT_INVALID, not a transient error.
          throw new DomainError(
            LISTING_ERROR_CODES.UPLOAD_OBJECT_INVALID,
            "Uploaded file is not a usable image",
          );
        }
      };

      const err = await publishError();

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: "UPLOAD_OBJECT_INVALID",
        details: { key: "p2.webp", photoId: "00000000-0000-0000-0000-000000000006" },
      });
      expect(prisma.createdListings).toHaveLength(0);
      // Only the unusable upload is retired; the others are released and stay adoptable.
      expect(draftStates()).toEqual(["AVAILABLE", "RETIRED", "AVAILABLE"]);
      expect(world.cleanups).toEqual(["upload-p2.webp"]);
    });

    it("keeps the released photos unadoptable by another target while a retry is in flight", async () => {
      seedDraft(draftRepo, threePhotoDraft());
      let failed = false;
      let signalInFlight!: () => void;
      let releaseGeneration!: () => void;
      const inFlight = new Promise<void>((resolve) => {
        signalInFlight = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });
      variantGenerator.during = async (key) => {
        if (!failed && key === "p2.webp") {
          failed = true;
          throw new Error("Sharp failed");
        }
        if (failed && key === "p1.webp") {
          signalInFlight();
          await hold;
        }
      };

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      await expect(
        uc.execute({ draftId: "draft-1", userId: "user-1" }).then(
          () => {
            throw new Error("Expected publish to be rejected");
          },
          (err: unknown) => err,
        ),
      ).resolves.toMatchObject({ message: "Sharp failed" });
      expect(draftStates()).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE"]);

      const retrying = uc.execute({ draftId: "draft-1", userId: "user-1" });
      await inFlight;
      try {
        // #721 / ADR-0088 still holds: while the retry holds the uploads
        // PREPARING, no other target can adopt them.
        await expect(
          world.claims.reserve({
            userId: "user-1",
            uploadIds: ["upload-p1.webp"],
            target: { type: "listing", id: "listing-other" },
          }),
        ).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
        expect(draftStates()).toEqual(["PREPARING", "PREPARING", "PREPARING"]);
      } finally {
        releaseGeneration();
      }
      const { listing } = await retrying;
      expect(listing.status).toBe("active");
    });
  });

  it("publishes damaged: false without Known issues", async () => {
    seedDraft(draftRepo, { ...validPayload, conditionDisclosure: { damaged: false } });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
    const result = await uc.execute({ draftId: "draft-1", userId: "user-1" });

    expect(result.listing.conditionDisclosure).toEqual({ damaged: false });
    expect(prisma.createdListings[0]).toMatchObject({ damaged: false, knownIssuesText: null });
  });

  it.each([
    ["no disclosure", undefined],
    ["Known issues without an answer", { knownIssuesText: "Rust" }],
  ])("rejects a draft with %s as a field error", async (_name, conditionDisclosure) => {
    const { conditionDisclosure: _, ...rest } = validPayload;
    seedDraft(draftRepo, conditionDisclosure ? { ...rest, conditionDisclosure } : rest);

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    const error = await uc
      .execute({ draftId: "draft-1", userId: "user-1" })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "INVALID_DRAFT_PAYLOAD",
      details: { fieldErrors: { conditionDisclosure: ["DAMAGED_REQUIRED"] } },
    });
    expect(prisma.createdListings).toHaveLength(0);
  });

  describe("a New car (ADR-0080)", () => {
    const { mileageKm: _mileage, conditionDisclosure: _disclosure, ...base } = validPayload;
    const newPayload = { ...base, condition: "new" };

    it.each([
      ["no disclosure", undefined, null],
      ["Known issues only", { knownIssuesText: "Paint chip" }, "Paint chip"],
    ])("publishes with %s as not damaged", async (_name, conditionDisclosure, knownIssuesText) => {
      seedDraft(draftRepo, conditionDisclosure ? { ...newPayload, conditionDisclosure } : newPayload);

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      const result = await uc.execute({ draftId: "draft-1", userId: "user-1" });

      expect(result.listing.conditionDisclosure?.damaged).toBe(false);
      expect(prisma.createdListings[0]).toMatchObject({ damaged: false, knownIssuesText });
    });

    it("refuses a damaged New car and tells the seller to choose Used", async () => {
      seedDraft(draftRepo, { ...newPayload, conditionDisclosure: { damaged: true } });

      const uc = makeUseCase(draftRepo, prisma, exchangeRates, events, variantGenerator);
      const error = await uc
        .execute({ draftId: "draft-1", userId: "user-1" })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "DAMAGED_NOT_ALLOWED_FOR_NEW",
        message: "A New car cannot be damaged. Choose Used for a damaged car.",
        details: { field: "conditionDisclosure.damaged" },
      });
      expect(prisma.createdListings).toHaveLength(0);
    });
  });

  it("throws BadRequestException when knownIssuesText exceeds 1000 characters", async () => {
    seedDraft(draftRepo, {
      ...validPayload,
      conditionDisclosure: { ...validPayload.conditionDisclosure, knownIssuesText: "x".repeat(1001) },
    });

    const uc = makeUseCase(draftRepo, prisma, exchangeRates, events);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-1" }),
    ).rejects.toThrow(BadRequestException);
  });
});
