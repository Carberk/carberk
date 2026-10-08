import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { UpdateDraft } from "./UpdateDraft";
import { ListingDraft } from "../domain/ListingDraft";
import type { ListingDraftRepository } from "../domain/ports/ListingDraftRepository";

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
  return new UpdateDraft(repo ?? new FakeListingDraftRepository());
}

describe("UpdateDraft", () => {
  let repo: FakeListingDraftRepository;

  beforeEach(() => {
    repo = new FakeListingDraftRepository();
  });

  it("patches the draft payload", async () => {
    const draft = ListingDraft.create({ id: "draft-1", userId: "user-1", payload: { vin: "old" } });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: { vin: "new", brandId: "b1" },
    });

    expect(result.draft.payload).toMatchObject({ vin: "new", brandId: "b1" });
  });

  it("clears the stored VIN when the update sets it to null", async () => {
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA1234567890ABCD" },
    });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: { vin: null },
    });

    expect(result.draft.payload).not.toHaveProperty("vin");
  });

  it("keeps the stored VIN when the update omits it", async () => {
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA1234567890ABCD" },
    });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: { brandId: "b1" },
    });

    expect(result.draft.payload).toMatchObject({ vin: "WBA1234567890ABCD", brandId: "b1" });
  });

  it("throws NotFoundException for non-existent draft", async () => {
    const uc = makeUseCase(repo);
    await expect(
      uc.execute({ draftId: "missing", userId: "user-1", payload: {} }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException for draft owned by another user", async () => {
    const draft = ListingDraft.create({ id: "draft-1", userId: "user-1" });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    await expect(
      uc.execute({ draftId: "draft-1", userId: "user-2", payload: {} }),
    ).rejects.toThrow(NotFoundException);
  });

  it("preserves validatedSteps when no fields change", async () => {
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA123", validatedSteps: ["vehicle"] },
    });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA123" },
    });

    expect((result.draft.payload as any).validatedSteps).toEqual(["vehicle"]);
  });

  it("invalidates downstream steps when a field changes", async () => {
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: {
        brandId: "old-brand",
        modelId: "old-model",
        year: 2020,
        validatedSteps: ["vehicle", "specs", "photos", "price"],
      },
    });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: {
        brandId: "new-brand",
        modelId: "old-model",
        year: 2020,
      },
    });

    // Car is first, so a new brand invalidates every step.
    expect((result.draft.payload as any).validatedSteps).toEqual([]);
  });

  it("accepts client-provided validatedSteps and applies invalidation", async () => {
    const draft = ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: {
        priceAmount: 100000,
        priceCurrency: "TMT",
        validatedSteps: ["vehicle", "specs", "photos", "price"],
      },
    });
    repo.drafts.push(draft);

    const uc = makeUseCase(repo);
    const result = await uc.execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: {
        priceAmount: 200000,
        validatedSteps: ["vehicle", "specs", "photos", "price", "location", "contact"],
      },
    });

    // price changed -> invalidate price, location, contact
    expect((result.draft.payload as any).validatedSteps).toEqual([
      "vehicle",
      "specs",
      "photos",
    ]);
  });

  it("invalidates Description and place when the description changes", async () => {
    repo.drafts.push(ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: {
        description: "Old text",
        validatedSteps: ["vehicle", "specs", "photos", "price", "location", "contact"],
      },
    }));

    const result = await makeUseCase(repo).execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: { description: "New text" },
    });

    expect((result.draft.payload as any).validatedSteps).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
    ]);
  });

  it("drops step names the seven-step wizard no longer has and keeps the VIN", async () => {
    // Saved by the eight-step wizard, which had a VIN step.
    repo.drafts.push(ListingDraft.create({
      id: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA1234567890ABCD", allowChat: true, validatedSteps: ["vin", "photos"] },
    }));

    const result = await makeUseCase(repo).execute({
      draftId: "draft-1",
      userId: "user-1",
      payload: { vin: "WBA1234567890ABCD", allowChat: false },
    });

    expect(result.draft.payload).toMatchObject({ vin: "WBA1234567890ABCD" });
    expect((result.draft.payload as any).validatedSteps).toEqual(["photos"]);
  });
});
