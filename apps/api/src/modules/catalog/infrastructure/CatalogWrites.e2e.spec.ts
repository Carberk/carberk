import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "@auto-tm/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CatalogSearchIndex } from "../application/CatalogSearchIndex";
import { CreateBrand } from "../application/CreateBrand";
import { CreateModel } from "../application/CreateModel";
import { DeleteBrand } from "../application/DeleteBrand";
import { DeleteModel } from "../application/DeleteModel";
import { RemoveBrandLogo } from "../application/RemoveBrandLogo";
import { SetBrandLogo } from "../application/SetBrandLogo";
import { UpdateBrand } from "../application/UpdateBrand";
import { UpdateModel } from "../application/UpdateModel";
import { FakeBrandLogoStorage } from "../application/testing/FakeBrandLogoStorage";
import type { Brand } from "../domain/Brand";
import type { Model } from "../domain/Model";
import { PrismaBrandRepository } from "./PrismaBrandRepository";
import { PrismaCatalogAuditLog } from "./PrismaCatalogAuditLog";
import { PrismaModelRepository } from "./PrismaModelRepository";
import { SharpLogoImageProcessor } from "./SharpLogoImageProcessor";

const names = { nameRu: "Тойота", nameTk: "Toýota", nameEn: "Toyota" };
const modelNames = { nameRu: "Камри", nameTk: "Kamri", nameEn: "Camry" };
const actorId = "catalog-audit-admin";
const previousKey = "brands/toyota/v1/logo.png";
const pendingKey = "pending/brands/toyota/0f8fad5b-d9cb-469f-a165-70867728950e";
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M0 0h24v24H0z"/></svg>');
const operations = ["create brand", "update brand", "delete brand", "create model", "update model", "delete model", "set logo", "remove logo"] as const;
type Operation = typeof operations[number];

describe("Catalog writes and audit persistence", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService;
  let brands: PrismaBrandRepository;
  let models: PrismaModelRepository;
  let audit: PrismaCatalogAuditLog;
  let search: CatalogSearchIndex;
  let storage: FakeBrandLogoStorage;
  let brand: Brand;
  let otherBrand: Brand;
  let model: Model;
  const originalDatabaseUrl = process.env["DATABASE_URL"];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withLabels({ "carberk.owner": "a05-1348" })
      .withTmpFs({ "/var/lib/postgresql/data": "rw" })
      .start();
    process.env["DATABASE_URL"] = container.getConnectionUri();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: resolve(__dirname, "../../../../../../packages/db"),
      env: process.env,
      stdio: "pipe",
    });
    prisma = new PrismaService();
    brands = new PrismaBrandRepository(prisma);
    models = new PrismaModelRepository(prisma);
    audit = new PrismaCatalogAuditLog(prisma);
    await prisma.user.create({ data: { id: actorId, role: "admin" } });
  }, 120_000);

  afterAll(async () => {
    try {
      await prisma?.onModuleDestroy();
    } finally {
      await container?.stop();
      if (originalDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = originalDatabaseUrl;
    }
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.generation.deleteMany();
    await prisma.model.deleteMany();
    await prisma.brand.deleteMany();
    brand = await brands.create({ slug: "toyota", ...names });
    otherBrand = await brands.create({ slug: "lexus", ...names });
    model = await models.create({ brandId: otherBrand.id, slug: "rx", ...modelNames });
    await brands.replaceLogoKey(brand.id, previousKey);
    storage = new FakeBrandLogoStorage();
    await storage.put(previousKey, new Uint8Array([1]), "image/png");
    await storage.put(pendingKey, svg, "image/svg+xml");
    search = new CatalogSearchIndex(brands, models);
    await search.getSnapshot();
  });

  function scenario(operation: Operation) {
    switch (operation) {
      case "create brand":
        return {
          run: (actor: string) => new CreateBrand(brands, audit, search).execute({ slug: "honda", ...names }, actor),
          expected: { action: "CATALOG_BRAND_CREATE", targetType: "Brand", details: { slug: "honda", nameRu: "Тойота" } },
          verify: async () => {
            const created = await brands.getBySlug("honda");
            expect(created).toMatchObject({ slug: "honda", ...names });
            expect((await search.getSnapshot()).brands.find((row) => row.slug === "honda")).toEqual(created);
            return created!.id;
          },
        };
      case "update brand":
        return {
          run: (actor: string) => new UpdateBrand(brands, audit, search).execute({ id: brand.id, nameRu: "Новая Тойота", slug: "toyota-new" }, actor),
          expected: { action: "CATALOG_BRAND_UPDATE", targetType: "Brand", details: { slug: "toyota-new", nameRu: "Новая Тойота" } },
          verify: async () => {
            expect(await brands.getBrandById(brand.id)).toMatchObject({ slug: "toyota-new", nameRu: "Новая Тойота", nameTk: "Toýota", nameEn: "Toyota" });
            expect((await search.getSnapshot()).brands.find((row) => row.id === brand.id)?.slug).toBe("toyota-new");
            return brand.id;
          },
        };
      case "delete brand":
        return {
          run: (actor: string) => new DeleteBrand(brands, audit, search, storage).execute({ id: brand.id }, actor),
          expected: { action: "CATALOG_BRAND_DELETE", targetType: "Brand", details: { slug: "toyota", nameRu: "Тойота" } },
          verify: async () => {
            expect(await brands.getBrandById(brand.id)).toBeNull();
            expect((await search.getSnapshot()).brands.some((row) => row.id === brand.id)).toBe(false);
            expect(storage.objects.has(previousKey)).toBe(false);
            return brand.id;
          },
        };
      case "create model":
        return {
          run: (actor: string) => new CreateModel(models, brands, audit, search).execute({ brandId: brand.id, slug: "camry", ...modelNames }, actor),
          expected: { action: "CATALOG_MODEL_CREATE", targetType: "Model", details: { slug: "camry", nameRu: "Камри", brandId: brand.id } },
          verify: async () => {
            const created = await models.getByBrandIdAndSlug(brand.id, "camry");
            expect(created).toMatchObject({ brandId: brand.id, slug: "camry", ...modelNames });
            expect((await search.getSnapshot()).models.find((row) => row.slug === "camry")).toEqual(created);
            return created!.id;
          },
        };
      case "update model":
        return {
          run: (actor: string) => new UpdateModel(models, brands, audit, search).execute({ id: model.id, brandId: brand.id, slug: "camry-new", nameRu: "Новая Камри" }, actor),
          expected: { action: "CATALOG_MODEL_UPDATE", targetType: "Model", details: { slug: "camry-new", nameRu: "Новая Камри", brandId: brand.id } },
          verify: async () => {
            expect(await models.getModelById(model.id)).toMatchObject({ brandId: brand.id, slug: "camry-new", nameRu: "Новая Камри", nameTk: "Kamri", nameEn: "Camry" });
            expect((await search.getSnapshot()).models.find((row) => row.id === model.id)).toMatchObject({ slug: "camry-new", brandId: brand.id });
            return model.id;
          },
        };
      case "delete model":
        return {
          run: (actor: string) => new DeleteModel(models, audit, search).execute({ id: model.id }, actor),
          expected: { action: "CATALOG_MODEL_DELETE", targetType: "Model", details: { slug: "rx", nameRu: "Камри", brandId: otherBrand.id } },
          verify: async () => {
            expect(await models.getModelById(model.id)).toBeNull();
            expect((await search.getSnapshot()).models.some((row) => row.id === model.id)).toBe(false);
            return model.id;
          },
        };
      case "set logo":
        return {
          run: (actor: string) => new SetBrandLogo(brands, storage, new SharpLogoImageProcessor(), audit).execute({ brandId: brand.id, key: pendingKey }, actor),
          expected: { action: "CATALOG_BRAND_LOGO_SET", targetType: "Brand", details: { slug: "toyota", logoKey: expect.stringMatching(/^brands\/toyota\/v\d+-[0-9a-f-]{36}\/logo\.png$/), previousLogoKey: previousKey } },
          verify: async () => {
            const key = (await brands.getBrandById(brand.id))!.logoKey!;
            expect(key).toMatch(/^brands\/toyota\/v\d+-[0-9a-f-]{36}\/logo\.png$/);
            expect(storage.objects.get(key)?.contentType).toBe("image/png");
            expect(storage.objects.has(previousKey)).toBe(false);
            expect(storage.objects.has(pendingKey)).toBe(false);
            return brand.id;
          },
        };
      case "remove logo":
        return {
          run: (actor: string) => new RemoveBrandLogo(brands, storage, audit).execute({ brandId: brand.id }, actor),
          expected: { action: "CATALOG_BRAND_LOGO_REMOVE", targetType: "Brand", details: { slug: "toyota", previousLogoKey: previousKey } },
          verify: async () => {
            expect((await brands.getBrandById(brand.id))!.logoKey).toBeNull();
            expect(storage.objects.has(previousKey)).toBe(false);
            return brand.id;
          },
        };
    }
  }

  it.each(operations)("persists %s with its complete audit entry and visible outcome", async (operation) => {
    const write = scenario(operation);
    await write.run(actorId);
    const targetId = await write.verify();
    const entries = await prisma.auditLog.findMany({ where: { actorId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ ...write.expected, actorId, targetId });
    if (operation === "set logo") {
      expect(entries[0]!.details).toEqual({ slug: "toyota", logoKey: (await brands.getBrandById(brand.id))!.logoKey, previousLogoKey: previousKey });
    } else {
      expect(entries[0]!.details).toEqual(write.expected.details);
    }
  });

  it.each(operations)("keeps %s committed when its subsequent audit insert fails", async (operation) => {
    const write = scenario(operation);
    await expect(write.run("missing-audit-actor")).rejects.toThrow(/foreign key/i);
    await write.verify();
    expect(await prisma.auditLog.findMany()).toEqual([]);
  });

  it("refuses duplicate slugs and missing references without mutations, audits or invalidation", async () => {
    const before = await search.getSnapshot();
    const writes = [
      () => new CreateBrand(brands, audit, search).execute({ slug: "toyota", ...names }, actorId),
      () => new UpdateBrand(brands, audit, search).execute({ id: brand.id, slug: "lexus" }, actorId),
      () => new CreateModel(models, brands, audit, search).execute({ brandId: otherBrand.id, slug: "rx", ...modelNames }, actorId),
    ];
    for (const write of writes) await expect(write()).rejects.toBeInstanceOf(ConflictException);
    const missingWrites = [
      () => new UpdateBrand(brands, audit, search).execute({ id: "missing" }, actorId),
      () => new DeleteBrand(brands, audit, search, storage).execute({ id: "missing" }, actorId),
      () => new CreateModel(models, brands, audit, search).execute({ brandId: "missing", slug: "rx", ...modelNames }, actorId),
      () => new UpdateModel(models, brands, audit, search).execute({ id: model.id, brandId: "missing" }, actorId),
      () => new UpdateModel(models, brands, audit, search).execute({ id: "missing" }, actorId),
      () => new DeleteModel(models, audit, search).execute({ id: "missing" }, actorId),
      () => new RemoveBrandLogo(brands, storage, audit).execute({ brandId: "missing" }, actorId),
      () => new SetBrandLogo(brands, storage, new SharpLogoImageProcessor(), audit).execute({ brandId: "missing", key: pendingKey }, actorId),
    ];
    for (const write of missingWrites) await expect(write()).rejects.toBeInstanceOf(NotFoundException);
    expect(await search.getSnapshot()).toBe(before);
    expect(await brands.listAllBrands()).toEqual(before.brands);
    expect(await models.listAllModels()).toEqual(before.models);
    expect(await prisma.auditLog.findMany()).toEqual([]);
    expect(storage.objects.has(previousKey)).toBe(true);
  });

  it("keeps referenced rows and logos when foreign keys refuse deletion", async () => {
    await models.update(model.id, { brandId: brand.id });
    await prisma.generation.create({ data: { modelId: model.id, nameRu: "XV", nameTk: "XV", nameEn: "XV", yearStart: 2020 } });
    const before = await search.getSnapshot();
    await expect(new DeleteBrand(brands, audit, search, storage).execute({ id: brand.id }, actorId)).rejects.toThrow();
    await expect(new DeleteModel(models, audit, search).execute({ id: model.id }, actorId)).rejects.toThrow();
    expect((await brands.getBrandById(brand.id))!.logoKey).toBe(previousKey);
    expect(await models.getModelById(model.id)).not.toBeNull();
    expect(storage.objects.has(previousKey)).toBe(true);
    expect(await search.getSnapshot()).toBe(before);
    expect(await prisma.auditLog.findMany()).toEqual([]);
  });

  it("does not audit a missing logo or a rejected pending upload", async () => {
    await expect(new SetBrandLogo(brands, storage, new SharpLogoImageProcessor(), audit).execute({ brandId: brand.id, key: "pending/other-brand/upload" }, actorId)).rejects.toBeInstanceOf(BadRequestException);
    expect((await brands.getBrandById(brand.id))!.logoKey).toBe(previousKey);
    await new RemoveBrandLogo(brands, storage, audit).execute({ brandId: brand.id }, actorId);
    await prisma.auditLog.deleteMany();
    await new RemoveBrandLogo(brands, storage, audit).execute({ brandId: brand.id }, actorId);
    expect((await brands.getBrandById(brand.id))!.logoKey).toBeNull();
    expect(await prisma.auditLog.findMany()).toEqual([]);
  });
});
