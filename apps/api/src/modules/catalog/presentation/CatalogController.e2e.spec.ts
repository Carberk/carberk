import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";
import { JwtModule } from "@nestjs/jwt";

import { CatalogModule } from "../catalog.module";
import { CatalogSearchIndex } from "../application/CatalogSearchIndex";
import { registerAcceptLanguageHook } from "../../../common/accept-language";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { BRAND_LOGO_STORAGE, type BrandLogoStorage } from "../domain/ports/BrandLogoStorage";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

describe("CatalogController e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        CatalogModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    registerAcceptLanguageHook(app.getHttpAdapter().getInstance());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.listingMedia.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.generation.deleteMany();
    await prisma.model.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.city.deleteMany();
    await prisma.region.deleteMany();
    await prisma.bodyType.deleteMany();
    await prisma.color.deleteMany();
    await prisma.engineType.deleteMany();
    await prisma.transmission.deleteMany();
    await prisma.driveType.deleteMany();
  });

  describe("GET /api/v1/catalog/brands", () => {
    it("returns logoUrl only for brands with a logo", async () => {
      await prisma.brand.createMany({
        data: [
          {
            id: "logo-b1",
            slug: "with-logo",
            nameRu: "Алфа",
            nameTk: "Alfa",
            nameEn: "Alfa",
            logoKey: "brands/with-logo/v1/logo.png",
          },
          {
            id: "logo-b2",
            slug: "without-logo",
            nameRu: "Бета",
            nameTk: "Beta",
            nameEn: "Beta",
          },
        ],
      });

      const res = await request.get("/api/v1/catalog/brands?locale=en").expect(200);

      const withLogo = res.body.items.find((b: { id: string }) => b.id === "logo-b1");
      const withoutLogo = res.body.items.find((b: { id: string }) => b.id === "logo-b2");
      const publicUrl = (process.env["MINIO_PUBLIC_URL"] ?? "http://localhost:9000").replace(
        /\/$/,
        "",
      );
      expect(withLogo.logoUrl).toBe(
        `${publicUrl}/catalog-assets/brands/with-logo/v1/logo.png`,
      );
      expect(withoutLogo).not.toHaveProperty("logoUrl");
    });

    it("returns an encoded non-ASCII catalog logo URL that can be fetched from MinIO", async () => {
      const catalog = JSON.parse(readFileSync(
        resolve(__dirname, "../../../../../../packages/db/prisma/seed/brands.json"),
        "utf-8",
      )) as { slug: string; nameRu: string; nameTk: string; nameEn: string }[];
      const brand = catalog.find((entry) => entry.slug === "москвич")!;
      expect(brand).toBeDefined();
      const key = `brands/${brand.slug}/imp-url-test/logo.png`;
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=",
        "base64",
      );
      const storage = app.get<BrandLogoStorage>(BRAND_LOGO_STORAGE);
      await storage.put(key, png, "image/png");
      try {
        await prisma.brand.create({ data: { ...brand, id: "non-ascii-logo", logoKey: key } });
        const res = await request.get("/api/v1/catalog/brands?locale=en").expect(200);
        const logoUrl = res.body.items[0].logoUrl as string;
        expect(logoUrl).toBe(
          `${process.env["MINIO_PUBLIC_URL"]}/catalog-assets/brands/%D0%BC%D0%BE%D1%81%D0%BA%D0%B2%D0%B8%D1%87/imp-url-test/logo.png`,
        );
        const image = await fetch(logoUrl);
        expect(image.status).toBe(200);
        expect(image.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
      } finally {
        await storage.delete(key);
      }
    });

    it("returns 200 with brand list sorted by locale", async () => {
      await prisma.brand.createMany({
        data: [
          {
            id: "b1",
            slug: "bmw",
            nameRu: "БМВ",
            nameTk: "BMW",
            nameEn: "BMW",
          },
          {
            id: "b2",
            slug: "audi",
            nameRu: "Ауди",
            nameTk: "Audi",
            nameEn: "Audi",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/brands?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Ауди");
      expect(res.body.items[1].name).toBe("БМВ");
      expect(res.body.items[0]).toHaveProperty("slug");
      expect(res.body.items[0]).toHaveProperty("id");
      expect(res.body.hasMore).toBe(false);
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.brand.create({
        data: {
          id: "b1",
          slug: "lada",
          nameRu: "Лада",
          nameTk: "",
          nameEn: "Lada",
        },
      });

      const res = await request
        .get("/api/v1/catalog/brands?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("Lada");
      expect(res.body.items[0].localeFallback).toBe("en");
    });

    it("uses the Accept-Language header when ?locale= is absent", async () => {
      await prisma.brand.create({
        data: { id: "b1", slug: "lada", nameRu: "Лада", nameTk: "Lada TK", nameEn: "Lada" },
      });

      const res = await request
        .get("/api/v1/catalog/brands")
        .set("Accept-Language", "tk-TM,ru;q=0.8")
        .expect(200);

      expect(res.body.items[0].name).toBe("Lada TK");
    });

    it("returns paginated results with cursor", async () => {
      await prisma.brand.createMany({
        data: [
          {
            id: "b1",
            slug: "audi",
            nameRu: "Ауди",
            nameTk: "Audi",
            nameEn: "Audi",
          },
          {
            id: "b2",
            slug: "bmw",
            nameRu: "БМВ",
            nameTk: "BMW",
            nameEn: "BMW",
          },
          {
            id: "b3",
            slug: "toyota",
            nameRu: "Тойота",
            nameTk: "Toýota",
            nameEn: "Toyota",
          },
        ],
      });

      const firstPage = await request
        .get("/api/v1/catalog/brands?locale=ru&limit=2")
        .expect(200);

      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.hasMore).toBe(true);
      expect(firstPage.body.nextCursor).toBeTruthy();

      const secondPage = await request
        .get(`/api/v1/catalog/brands?locale=ru&limit=2&cursor=${firstPage.body.nextCursor}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.hasMore).toBe(false);
    });
  });

  describe("GET /api/v1/catalog/brands/:id/models", () => {
    it("returns 200 with models for a brand", async () => {
      await prisma.brand.create({
        data: {
          id: "b1",
          slug: "toyota",
          nameRu: "Тойота",
          nameTk: "Toýota",
          nameEn: "Toyota",
        },
      });
      await prisma.model.createMany({
        data: [
          {
            id: "m1",
            brandId: "b1",
            slug: "camry",
            nameRu: "Камри",
            nameTk: "Kamri",
            nameEn: "Camry",
          },
          {
            id: "m2",
            brandId: "b1",
            slug: "corolla",
            nameRu: "Королла",
            nameTk: "Korolla",
            nameEn: "Corolla",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/brands/b1/models?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Камри");
      expect(res.body.items[1].name).toBe("Королла");
      expect(res.body.items[0]).toHaveProperty("brandId", "b1");
    });

    it("returns empty list for brand with no models", async () => {
      await prisma.brand.create({
        data: {
          id: "b1",
          slug: "toyota",
          nameRu: "Тойота",
          nameTk: "Toýota",
          nameEn: "Toyota",
        },
      });

      const res = await request
        .get("/api/v1/catalog/brands/b1/models?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });
  });

  describe("GET /api/v1/catalog/models/:id/generations", () => {
    it("returns 200 with generations for a model", async () => {
      await prisma.brand.create({
        data: {
          id: "b1",
          slug: "toyota",
          nameRu: "Тойота",
          nameTk: "Toýota",
          nameEn: "Toyota",
        },
      });
      await prisma.model.create({
        data: {
          id: "m1",
          brandId: "b1",
          slug: "camry",
          nameRu: "Камри",
          nameTk: "Kamri",
          nameEn: "Camry",
        },
      });
      await prisma.generation.createMany({
        data: [
          {
            id: "g1",
            modelId: "m1",
            nameRu: "XV70",
            nameTk: "XV70",
            nameEn: "XV70",
            yearStart: 2021,
            yearEnd: null,
          },
          {
            id: "g2",
            modelId: "m1",
            nameRu: "XV80",
            nameTk: "XV80",
            nameEn: "XV80",
            yearStart: 2025,
            yearEnd: null,
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/models/m1/generations?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("XV70");
      expect(res.body.items[0].yearStart).toBe(2021);
      expect(res.body.items[1].name).toBe("XV80");
    });

    it("returns empty list for model with no generations", async () => {
      await prisma.brand.create({
        data: {
          id: "b1",
          slug: "toyota",
          nameRu: "Тойота",
          nameTk: "Toýota",
          nameEn: "Toyota",
        },
      });
      await prisma.model.create({
        data: {
          id: "m1",
          brandId: "b1",
          slug: "camry",
          nameRu: "Камри",
          nameTk: "Kamri",
          nameEn: "Camry",
        },
      });

      const res = await request
        .get("/api/v1/catalog/models/m1/generations?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });
  });

  describe("GET /api/v1/catalog/search", () => {
    beforeEach(async () => {
      await prisma.brand.createMany({
        data: [
          {
            id: "b1",
            slug: "toyota",
            nameRu: "Тойота",
            nameTk: "Toýota",
            nameEn: "Toyota",
          },
          {
            id: "b2",
            slug: "lexus",
            nameRu: "Лексус",
            nameTk: "Lexus",
            nameEn: "Lexus",
          },
        ],
      });
      await prisma.model.createMany({
        data: [
          {
            id: "m1",
            brandId: "b1",
            slug: "camry",
            nameRu: "Камри",
            nameTk: "Kamri",
            nameEn: "Camry",
          },
          {
            id: "m2",
            brandId: "b1",
            slug: "corolla",
            nameRu: "Королла",
            nameTk: "Korolla",
            nameEn: "Corolla",
          },
        ],
      });
    });

    it.each(["тойота", "toyota", "Тойота", "toyta"])(
      "returns Toyota first for %j",
      async (q) => {
        const res = await request
          .get(`/api/v1/catalog/search?q=${encodeURIComponent(q)}&locale=ru`)
          .expect(200);

        expect(res.body.results[0]).toMatchObject({
          kind: "brand",
          brandId: "b1",
          label: "Тойота",
        });
      },
    );

    it.each(["камри", "camry"])(
      "returns Camry as a model result with its brand for %j",
      async (q) => {
        const res = await request
          .get(`/api/v1/catalog/search?q=${encodeURIComponent(q)}&locale=en`)
          .expect(200);

        const camry = res.body.results.find(
          (r: { modelId?: string }) => r.modelId === "m1",
        );
        expect(camry).toMatchObject({
          kind: "model",
          brandId: "b1",
          label: "Camry",
          brandLabel: "Toyota",
        });
      },
    );

    it("returns brand and model results together in one list", async () => {
      const res = await request
        .get("/api/v1/catalog/search?q=toyota&locale=en")
        .expect(200);

      const kinds = res.body.results.map((r: { kind: string }) => r.kind);
      expect(kinds).toContain("brand");
      expect(kinds).toContain("model");
      expect(res.body.results.length).toBeLessThanOrEqual(20);
    });

    it("understands a year after the model name", async () => {
      const res = await request
        .get(`/api/v1/catalog/search?q=${encodeURIComponent("camry 2018")}&locale=en`)
        .expect(200);

      expect(res.body.results[0]).toMatchObject({ kind: "model", modelId: "m1" });
      expect(res.body.yearFrom).toBe(2018);
      expect(res.body.yearTo).toBe(2018);
    });

    it("understands a year range after a Russian brand name", async () => {
      const res = await request
        .get(
          `/api/v1/catalog/search?q=${encodeURIComponent("лексус 2014-2019")}&locale=ru`,
        )
        .expect(200);

      expect(res.body.results[0]).toMatchObject({ kind: "brand", brandId: "b2" });
      expect(res.body.yearFrom).toBe(2014);
      expect(res.body.yearTo).toBe(2019);
    });

    it("returns only the year range for a bare year query", async () => {
      const res = await request
        .get("/api/v1/catalog/search?q=2018&locale=ru")
        .expect(200);

      expect(res.body.results).toEqual([]);
      expect(res.body.yearFrom).toBe(2018);
      expect(res.body.yearTo).toBe(2018);
    });

    it("ignores years outside the valid range", async () => {
      const res = await request
        .get(`/api/v1/catalog/search?q=${encodeURIComponent("camry 1800")}&locale=en`)
        .expect(200);

      expect(res.body.yearFrom).toBeUndefined();
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    it("returns an empty list for an empty or one-character query", async () => {
      for (const q of ["", "т"]) {
        const res = await request
          .get(`/api/v1/catalog/search?q=${encodeURIComponent(q)}`)
          .expect(200);

        expect(res.body.results).toEqual([]);
      }
    });

    it("reflects admin catalog edits after invalidation", async () => {
      await request
        .get("/api/v1/catalog/search?q=haval&locale=en")
        .expect(200)
        .expect((res) => {
          expect(res.body.results).toEqual([]);
        });

      await prisma.brand.create({
        data: {
          id: "b3",
          slug: "haval",
          nameRu: "Хавал",
          nameTk: "Haval",
          nameEn: "Haval",
        },
      });


      app.get(CatalogSearchIndex).invalidate();

      const res = await request
        .get("/api/v1/catalog/search?q=haval&locale=en")
        .expect(200);

      expect(res.body.results[0]).toMatchObject({ kind: "brand", brandId: "b3" });
    });
  });

  describe("GET /api/v1/catalog/regions", () => {
    it("returns 200 with region list sorted by locale", async () => {
      await prisma.region.createMany({
        data: [
          {
            id: "r1",
            slug: "balkan",
            nameRu: "Балкан",
            nameTk: "Balkan",
            nameEn: "Balkan",
          },
          {
            id: "r2",
            slug: "ashgabat",
            nameRu: "Ашхабад",
            nameTk: "Aşgabat",
            nameEn: "Ashgabat",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/regions?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Ашхабад");
      expect(res.body.items[1].name).toBe("Балкан");
      expect(res.body.items[0]).toHaveProperty("slug");
      expect(res.body.items[0]).toHaveProperty("id");
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.region.create({
        data: {
          id: "r1",
          slug: "ashgabat",
          nameRu: "Ашхабад",
          nameTk: "",
          nameEn: "Ashgabat",
        },
      });

      const res = await request
        .get("/api/v1/catalog/regions?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("Ashgabat");
      expect(res.body.items[0].localeFallback).toBe("en");
    });
  });

  describe("GET /api/v1/catalog/regions/:id/cities", () => {
    it("returns 200 with cities for a region", async () => {
      await prisma.region.create({
        data: {
          id: "r1",
          slug: "ashgabat",
          nameRu: "Ашхабад",
          nameTk: "Aşgabat",
          nameEn: "Ashgabat",
        },
      });
      await prisma.city.createMany({
        data: [
          {
            id: "c1",
            regionId: "r1",
            slug: "ashgabat-city",
            nameRu: "Ашхабад",
            nameTk: "Aşgabat",
            nameEn: "Ashgabat",
          },
          {
            id: "c2",
            regionId: "r1",
            slug: "turkmenabad",
            nameRu: "Туркменабад",
            nameTk: "Türkmenabat",
            nameEn: "Turkmenabad",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/regions/r1/cities?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Ашхабад");
      expect(res.body.items[1].name).toBe("Туркменабад");
      expect(res.body.items[0]).toHaveProperty("regionId", "r1");
    });

    it("returns empty list for region with no cities", async () => {
      await prisma.region.create({
        data: {
          id: "r1",
          slug: "ashgabat",
          nameRu: "Ашхабад",
          nameTk: "Aşgabat",
          nameEn: "Ashgabat",
        },
      });

      const res = await request
        .get("/api/v1/catalog/regions/r1/cities?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });

    it("returns paginated results with cursor", async () => {
      await prisma.region.create({
        data: {
          id: "r1",
          slug: "ashgabat",
          nameRu: "Ашхабад",
          nameTk: "Aşgabat",
          nameEn: "Ashgabat",
        },
      });
      await prisma.city.createMany({
        data: [
          {
            id: "c1",
            regionId: "r1",
            slug: "a-city",
            nameRu: "А",
            nameTk: "A",
            nameEn: "A",
          },
          {
            id: "c2",
            regionId: "r1",
            slug: "b-city",
            nameRu: "Б",
            nameTk: "B",
            nameEn: "B",
          },
          {
            id: "c3",
            regionId: "r1",
            slug: "c-city",
            nameRu: "В",
            nameTk: "C",
            nameEn: "C",
          },
        ],
      });

      const firstPage = await request
        .get("/api/v1/catalog/regions/r1/cities?locale=ru&limit=2")
        .expect(200);

      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.hasMore).toBe(true);
      expect(firstPage.body.nextCursor).toBeTruthy();

      const secondPage = await request
        .get(`/api/v1/catalog/regions/r1/cities?locale=ru&limit=2&cursor=${firstPage.body.nextCursor}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.hasMore).toBe(false);
    });
  });

  describe("GET /api/v1/catalog/body-types", () => {
    it("returns 200 with body type list sorted by locale", async () => {
      await prisma.bodyType.createMany({
        data: [
          {
            id: "bt1",
            nameRu: "Седан",
            nameTk: "Sedan",
            nameEn: "Sedan",
          },
          {
            id: "bt2",
            nameRu: "Внедорожник",
            nameTk: "Jeep",
            nameEn: "SUV",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/body-types?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Внедорожник");
      expect(res.body.items[1].name).toBe("Седан");
      expect(res.body.items[0]).toHaveProperty("id");
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.bodyType.create({
        data: {
          id: "bt1",
          nameRu: "Седан",
          nameTk: "",
          nameEn: "Sedan",
        },
      });

      const res = await request
        .get("/api/v1/catalog/body-types?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("Sedan");
      expect(res.body.items[0].localeFallback).toBe("en");
    });
  });

  describe("GET /api/v1/catalog/colors", () => {
    it("returns 200 with color list sorted by locale including hex", async () => {
      await prisma.color.createMany({
        data: [
          {
            id: "col1",
            nameRu: "Черный",
            nameTk: "Gara",
            nameEn: "Black",
            hex: "#000000",
          },
          {
            id: "col2",
            nameRu: "Белый",
            nameTk: "Ak",
            nameEn: "White",
            hex: "#FFFFFF",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/colors?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Белый");
      expect(res.body.items[1].name).toBe("Черный");
      expect(res.body.items[0].hex).toBe("#FFFFFF");
      expect(res.body.items[1].hex).toBe("#000000");
    });

    it("returns color without hex when hex is null", async () => {
      await prisma.color.create({
        data: {
          id: "col1",
          nameRu: "Металлик",
          nameTk: "Metal",
          nameEn: "Metallic",
          hex: null,
        },
      });

      const res = await request
        .get("/api/v1/catalog/colors?locale=ru")
        .expect(200);

      expect(res.body.items[0].name).toBe("Металлик");
      expect(res.body.items[0].hex).toBeUndefined();
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.color.create({
        data: {
          id: "col1",
          nameRu: "Черный",
          nameTk: "",
          nameEn: "Black",
          hex: "#000000",
        },
      });

      const res = await request
        .get("/api/v1/catalog/colors?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("Black");
      expect(res.body.items[0].localeFallback).toBe("en");
    });
  });

  describe("GET /api/v1/catalog/engine-types", () => {
    it("returns 200 with engine type list sorted by locale", async () => {
      await prisma.engineType.createMany({
        data: [
          {
            id: "et1",
            nameRu: "Дизель",
            nameTk: "Dizel",
            nameEn: "Diesel",
          },
          {
            id: "et2",
            nameRu: "Бензин",
            nameTk: "Benzin",
            nameEn: "Gasoline",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/engine-types?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Бензин");
      expect(res.body.items[1].name).toBe("Дизель");
      expect(res.body.items[0]).toHaveProperty("id");
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.engineType.create({
        data: {
          id: "et1",
          nameRu: "Бензин",
          nameTk: "",
          nameEn: "Gasoline",
        },
      });

      const res = await request
        .get("/api/v1/catalog/engine-types?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("Gasoline");
      expect(res.body.items[0].localeFallback).toBe("en");
    });
  });

  describe("GET /api/v1/catalog/transmissions", () => {
    it("returns 200 with transmission list sorted by locale", async () => {
      await prisma.transmission.createMany({
        data: [
          {
            id: "tr1",
            nameRu: "Робот",
            nameTk: "Robot",
            nameEn: "Robot/AMT-DCT",
          },
          {
            id: "tr2",
            nameRu: "Автомат",
            nameTk: "Awtomat",
            nameEn: "Automatic",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/transmissions?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Автомат");
      expect(res.body.items[1].name).toBe("Робот");
      expect(res.body.items[0]).toHaveProperty("id");
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.transmission.create({
        data: {
          id: "tr1",
          nameRu: "Механика",
          nameTk: "",
          nameEn: "Manual",
        },
      });

      const res = await request
        .get("/api/v1/catalog/transmissions?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("Manual");
      expect(res.body.items[0].localeFallback).toBe("en");
    });
  });

  describe("GET /api/v1/catalog/drive-types", () => {
    it("returns 200 with drive type list sorted by locale", async () => {
      await prisma.driveType.createMany({
        data: [
          {
            id: "dt1",
            nameRu: "Задний",
            nameTk: "Yzky",
            nameEn: "RWD",
          },
          {
            id: "dt2",
            nameRu: "Передний",
            nameTk: "Öňki",
            nameEn: "FWD",
          },
        ],
      });

      const res = await request
        .get("/api/v1/catalog/drive-types?locale=ru")
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].name).toBe("Задний");
      expect(res.body.items[1].name).toBe("Передний");
      expect(res.body.items[0]).toHaveProperty("id");
    });

    it("falls back to another locale when requested locale is empty", async () => {
      await prisma.driveType.create({
        data: {
          id: "dt1",
          nameRu: "Полный",
          nameTk: "",
          nameEn: "AWD",
        },
      });

      const res = await request
        .get("/api/v1/catalog/drive-types?locale=tk")
        .expect(200);

      expect(res.body.items[0].name).toBe("AWD");
      expect(res.body.items[0].localeFallback).toBe("en");
    });
  });
});
