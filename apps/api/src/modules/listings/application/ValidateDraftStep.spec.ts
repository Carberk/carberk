import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { ValidateDraftStep } from "./ValidateDraftStep";
import { ListingDraft } from "../domain/ListingDraft";
import type { ListingDraftRepository } from "../domain/ports/ListingDraftRepository";

class FakeListingDraftRepository implements ListingDraftRepository {
  drafts: ListingDraft[] = [];

  async save(draft: ListingDraft): Promise<ListingDraft> {
    this.drafts.push(draft);
    return draft;
  }

  async findById(id: string): Promise<ListingDraft | null> {
    return this.drafts.find((d) => d.id === id) ?? null;
  }

  async findByUserId(): Promise<{ items: ListingDraft[]; nextCursor?: { timestamp: string; id: string } }> {
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

function makeUseCase(repo?: FakeListingDraftRepository) {
  return new ValidateDraftStep(repo ?? new FakeListingDraftRepository());
}

describe("ValidateDraftStep", () => {
  let repo: FakeListingDraftRepository;

  beforeEach(() => {
    repo = new FakeListingDraftRepository();
  });

  it("returns valid for complete vehicle step", async () => {
    const draft = ListingDraft.create({ id: "draft-1", userId: "user-1" });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      step: "vehicle",
      payload: {
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelId: "550e8400-e29b-41d4-a716-446655440001",
        year: 2020,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // All vehicle fields are new, so downstream steps would be invalidated on save
    expect(result.invalidatedSteps).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
      "location",
      "contact",
      "review",
    ]);
  });

  it("returns errors for incomplete vehicle step", async () => {
    const draft = ListingDraft.create({ id: "draft-1", userId: "user-1" });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      step: "vehicle",
      payload: { brandId: "550e8400-e29b-41d4-a716-446655440000" },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns invalidated steps when brand changes", async () => {
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: {
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelId: "550e8400-e29b-41d4-a716-446655440001",
        year: 2020,
      },
    });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      step: "vehicle",
      payload: {
        brandId: "550e8400-e29b-41d4-a716-446655440002",
        modelId: "550e8400-e29b-41d4-a716-446655440001",
        year: 2020,
      },
    });

    expect(result.invalidatedSteps).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
      "location",
      "contact",
      "review",
    ]);
  });

  it("checks the optional VIN on the Car step", async () => {
    repo.drafts.push(ListingDraft.create({ id: "draft-1", userId: "user-1" }));

    const result = await makeUseCase(repo).execute({
      draftId: "draft-1",
      userId: "user-1",
      step: "vehicle",
      payload: {
        brandId: "550e8400-e29b-41d4-a716-446655440000",
        modelId: "550e8400-e29b-41d4-a716-446655440001",
        year: 2020,
        vin: "A".repeat(18),
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["wizardErrors.vinTooLong"]);
  });

  it("requires the description on the Description and place step", async () => {
    repo.drafts.push(ListingDraft.create({ id: "draft-1", userId: "user-1" }));

    const result = await makeUseCase(repo).execute({
      draftId: "draft-1",
      userId: "user-1",
      step: "location",
      payload: {
        regionId: "550e8400-e29b-41d4-a716-446655440000",
        cityId: "550e8400-e29b-41d4-a716-446655440001",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["wizardErrors.descriptionRequired"]);
  });

  it("accepts the Contact step without a description", async () => {
    repo.drafts.push(ListingDraft.create({ id: "draft-1", userId: "user-1" }));

    const result = await makeUseCase(repo).execute({
      draftId: "draft-1",
      userId: "user-1",
      step: "contact",
      payload: { contactPhone: "+99361234567", allowCalls: false, allowChat: true },
    });

    expect(result.valid).toBe(true);
  });

  it("throws NotFoundException for non-existent draft", async () => {
    const uc = makeUseCase(repo);
    await expect(
      uc.execute({
        draftId: "missing",
        userId: "user-1",
        step: "vehicle",
        payload: {},
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException for draft owned by another user", async () => {
    const draft = ListingDraft.create({ id: "draft-1", userId: "user-1" });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    await expect(
      uc.execute({
        draftId: "draft-1",
        userId: "user-2",
        step: "vehicle",
        payload: {},
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
