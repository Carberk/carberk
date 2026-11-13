import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PrismaService } from "@auto-tm/db";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ListingDraft } from "../domain/ListingDraft";
import { PrismaListingDraftRepository } from "../infrastructure/PrismaListingDraftRepository";
import { PrismaMediaUploadRepository } from "../infrastructure/PrismaMediaUploadRepository";
import { UpdateDraft } from "./UpdateDraft";

describe("Draft photo autosave after a PostgreSQL JSONB round trip", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let drafts: PrismaListingDraftRepository;
  let update: UpdateDraft;

  beforeAll(async () => {
    // Own disposable Postgres only: no shared database, Redis or storage.
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("draft_jsonb_1140")
      .start();
    const databaseUrl = container.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: resolve(__dirname, "../../../../../../packages/db"),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    const previous = process.env["DATABASE_URL"];
    try {
      process.env["DATABASE_URL"] = databaseUrl;
      prisma = new PrismaService();
    } finally {
      if (previous === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = previous;
    }
    drafts = new PrismaListingDraftRepository(prisma);
    update = new UpdateDraft(drafts, new PrismaMediaUploadRepository(prisma));
    await prisma.user.create({ data: { id: "jsonb-owner-1140", role: "seller" } });
  }, 120_000);

  afterAll(async () => {
    try {
      await prisma?.onModuleDestroy();
    } finally {
      await container?.stop();
    }
  });

  it("retains validation for identical photos, then invalidates it for a reordered gallery", async () => {
    const payload: ListingsSchemas.ListingDraftPayload = {
      photos: [
        { photoId: "86a0f049-7ede-43c3-8a0c-5893e2638811", sortOrder: 0, key: "pending/front/original.webp" },
        { photoId: "86a0f049-7ede-43c3-8a0c-5893e2638812", sortOrder: 1, key: "pending/rear/original.webp" },
        { photoId: "86a0f049-7ede-43c3-8a0c-5893e2638813", sortOrder: 2 },
      ],
      vin: "WBA1234567890ABCD",
      description: "Keep this description",
      priceAmount: 125000,
      priceCurrency: "TMT",
      currentStep: 3,
      validatedSteps: ["vehicle", "specs", "photos", "price", "location", "contact", "review"],
    };
    const draft = await drafts.save(ListingDraft.create({ id: randomUUID(), userId: "jsonb-owner-1140", payload }));
    const unrelated = await drafts.save(ListingDraft.create({
      id: randomUUID(), userId: "jsonb-owner-1140", payload: { description: "Unrelated draft", validatedSteps: ["location"] },
    }));
    const persisted = await drafts.findById(draft.id);
    expect(persisted?.payload).toEqual(payload);
    // Establish that the actual database changed property order, rather than
    // constructing a JSONB-shaped object in the test.
    expect(JSON.stringify(persisted?.payload["photos"])).not.toBe(JSON.stringify(payload.photos));

    const saved = await update.execute({ draftId: draft.id, userId: draft.userId, payload });

    expect(saved.draft.payload).toEqual(payload);
    expect((await drafts.findById(draft.id))?.payload).toEqual(payload);

    const reordered = { ...payload, photos: [payload.photos![1]!, payload.photos![0]!, payload.photos![2]!] };
    const edited = await update.execute({ draftId: draft.id, userId: draft.userId, payload: reordered });

    expect(edited.draft.payload).toEqual({ ...reordered, validatedSteps: ["vehicle", "specs"] });
    expect((await drafts.findById(draft.id))?.payload).toEqual({ ...reordered, validatedSteps: ["vehicle", "specs"] });
    expect(await drafts.findById(unrelated.id)).toEqual(unrelated);
  });
});
