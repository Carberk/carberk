import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PrismaService } from "@auto-tm/db";

import { PrismaBrandRepository } from "./PrismaBrandRepository";

describe("PrismaBrandRepository — Testcontainers", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repo: PrismaBrandRepository;

  let otherPrisma: PrismaService;
  let otherRepo: PrismaBrandRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withUsername("auto_tm")
      .withPassword("auto_tm_pass")
      .withDatabase("auto_tm_test")
      .start();

    const dbUrl = container.getConnectionUri();
    const dbPackagePath = resolve(__dirname, "../../../../../../packages/db");

    execSync("pnpm prisma migrate deploy", {
      cwd: dbPackagePath,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });

    process.env["DATABASE_URL"] = dbUrl;
    prisma = new PrismaService();
    repo = new PrismaBrandRepository(prisma);
    otherPrisma = new PrismaService();
    otherRepo = new PrismaBrandRepository(otherPrisma);
  }, 120_000);

  afterAll(async () => {
    await otherPrisma.onModuleDestroy();
    await prisma.onModuleDestroy();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.model.deleteMany();
    await prisma.brand.deleteMany();
  });

  it("returns brands ordered alphabetically by locale-specific name", async () => {
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
        {
          id: "b3",
          slug: "toyota",
          nameRu: "Тойота",
          nameTk: "Toýota",
          nameEn: "Toyota",
        },
      ],
    });

    const result = await repo.listBrands({ locale: "ru" });

    expect(result.items.map((b) => b.nameRu)).toEqual([
      "Ауди",
      "БМВ",
      "Тойота",
    ]);
  });

  it("orders by English name when locale is en", async () => {
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

    const result = await repo.listBrands({ locale: "en" });

    expect(result.items.map((b) => b.nameEn)).toEqual(["Audi", "BMW"]);
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

    const firstPage = await repo.listBrands({ locale: "ru", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await repo.listBrands({
      locale: "ru",
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("returns a brand by id", async () => {
    await prisma.brand.create({
      data: {
        id: "b1",
        slug: "toyota",
        nameRu: "Тойота",
        nameTk: "Toýota",
        nameEn: "Toyota",
      },
    });

    const brand = await repo.getBrandById("b1");
    expect(brand).not.toBeNull();
    expect(brand!.slug).toBe("toyota");
  });

  it("returns null for non-existent brand id", async () => {
    const brand = await repo.getBrandById("non-existent");
    expect(brand).toBeNull();
  });

  describe("atomic logo mutations (ADR-0072)", () => {
    const brandData = (logoKey: string | null = null) => ({
      id: "b1",
      slug: "toyota",
      nameRu: "Тойота",
      nameTk: "Toýota",
      nameEn: "Toyota",
      logoKey,
    });


    async function untilLockWaiter(): Promise<void> {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND datname = current_database()`;
        if (Number(rows[0]?.n ?? 0) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("no query ever waited for the row lock");
    }


    const holders: Array<{ release: () => void; done: Promise<unknown> }> = [];
    afterEach(async () => {
      for (const holder of holders.splice(0)) {
        holder.release();
        await holder.done.catch(() => undefined);
      }
    });


    function holdRowLock(
      mutate: (tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]) => Promise<void>,
    ) {
      let release!: () => void;
      const released = new Promise<void>((resolve) => { release = resolve; });
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => { locked = resolve; });
      const done = otherPrisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "logoKey" FROM "brands" WHERE "id" = 'b1' FOR UPDATE`;
          locked();
          await released;
          await mutate(tx);
        },
        { timeout: 60_000, maxWait: 5_000 },
      );
      holders.push({ release, done });
      return { lockTaken, release, done };
    }

    it("replaces the key and returns the key it actually replaced", async () => {
      await prisma.brand.create({ data: brandData("brands/toyota/v1/logo.png") });

      const replaced = await repo.replaceLogoKey("b1", "brands/toyota/v2-x/logo.png");
      const cleared = await repo.replaceLogoKey("b1", null);

      expect(replaced).toEqual({ replaced: true, previousKey: "brands/toyota/v1/logo.png" });
      expect(cleared).toEqual({ replaced: true, previousKey: "brands/toyota/v2-x/logo.png" });
      expect((await prisma.brand.findUniqueOrThrow({ where: { id: "b1" } })).logoKey).toBeNull();
    });

    it("positively reports a brand that does not exist", async () => {
      expect(await repo.replaceLogoKey("missing", "brands/x/v1/logo.png")).toEqual({
        replaced: false,
        reason: "not-found",
      });
      expect(await repo.delete("missing")).toBeNull();
    });

    it("returns the key committed by another client while it waited for the row lock", async () => {
      await prisma.brand.create({ data: brandData("brands/toyota/v1/logo.png") });
      const other = holdRowLock(async (tx) => {
        await tx.brand.update({ where: { id: "b1" }, data: { logoKey: "brands/toyota/imp-0123456789ab-uuid/logo.png" } });
      });
      await other.lockTaken;

      const waiting = repo.replaceLogoKey("b1", "brands/toyota/v3-y/logo.png");
      await untilLockWaiter();
      other.release();
      await other.done;


      expect(await waiting).toEqual({
        replaced: true,
        previousKey: "brands/toyota/imp-0123456789ab-uuid/logo.png",
      });
      expect((await prisma.brand.findUniqueOrThrow({ where: { id: "b1" } })).logoKey).toBe(
        "brands/toyota/v3-y/logo.png",
      );
    });

    it("chains the previous keys of two simultaneous swaps from two clients", async () => {
      await prisma.brand.create({ data: brandData("brands/toyota/v0/logo.png") });

      const [first, second] = await Promise.all([
        repo.replaceLogoKey("b1", "brands/toyota/vA-a/logo.png"),
        otherRepo.replaceLogoKey("b1", "brands/toyota/vB-b/logo.png"),
      ]);

      const previous = [first, second].map((r) => (r.replaced ? r.previousKey : "none"));
      expect(previous.filter((key) => key === "brands/toyota/v0/logo.png")).toHaveLength(1);
      const finalKey = (await prisma.brand.findUniqueOrThrow({ where: { id: "b1" } })).logoKey;
      const keyOf = (r: typeof first, name: string) => (r.replaced ? name : "");

      const names = [keyOf(first, "brands/toyota/vA-a/logo.png"), keyOf(second, "brands/toyota/vB-b/logo.png")];
      const winnerIndex = previous.indexOf("brands/toyota/v0/logo.png");
      expect(previous[1 - winnerIndex]).toBe(names[winnerIndex]);
      expect(finalKey).toBe(names[1 - winnerIndex]);
    });

    it("returns the logo key of the row it deleted, even after another client replaced it", async () => {
      await prisma.brand.create({ data: brandData("brands/toyota/v1/logo.png") });
      const other = holdRowLock(async (tx) => {
        await tx.brand.update({ where: { id: "b1" }, data: { logoKey: "brands/toyota/vNew-uuid/logo.png" } });
      });
      await other.lockTaken;

      const deleting = repo.delete("b1");
      await untilLockWaiter();
      other.release();
      await other.done;

      expect(await deleting).toEqual({ logoKey: "brands/toyota/vNew-uuid/logo.png" });
      expect(await prisma.brand.findUnique({ where: { id: "b1" } })).toBeNull();
    });

    it("lets a swap that waited behind a delete report the brand as gone", async () => {
      await prisma.brand.create({ data: brandData("brands/toyota/v1/logo.png") });
      const other = holdRowLock(async (tx) => {
        await tx.brand.delete({ where: { id: "b1" } });
      });
      await other.lockTaken;

      const waiting = repo.replaceLogoKey("b1", "brands/toyota/v2-z/logo.png");
      await untilLockWaiter();
      other.release();
      await other.done;

      expect(await waiting).toEqual({ replaced: false, reason: "not-found" });
    });

    it("rolls back and returns no cleanup work when a foreign key blocks the delete", async () => {
      await prisma.brand.create({ data: brandData("brands/toyota/v1/logo.png") });
      await prisma.model.create({
        data: { id: "m1", brandId: "b1", slug: "camry", nameRu: "Камри", nameTk: "Camry", nameEn: "Camry" },
      });

      await expect(repo.delete("b1")).rejects.toThrow(/foreign key/i);

      const row = await prisma.brand.findUniqueOrThrow({ where: { id: "b1" } });
      expect(row.logoKey).toBe("brands/toyota/v1/logo.png");
    });

    it.each(["replace", "delete"] as const)("rejects %s without committing when the row lock stays held", async (operation) => {
      await prisma.brand.create({ data: brandData("brands/toyota/v1/logo.png") });
      const other = holdRowLock(async () => {});
      await other.lockTaken;

      const startedAt = Date.now();
      let outcome: unknown;
      try {
        outcome = await (operation === "replace"
          ? repo.replaceLogoKey("b1", "brands/toyota/v2-late/logo.png")
          : repo.delete("b1"))
          .then((value) => ({ value }), (error: unknown) => ({ error }));
        expect(Date.now() - startedAt).toBeLessThan(10_000);
      } finally {
        other.release();
        await other.done;
      }

      expect(outcome).toHaveProperty("error");
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect((await prisma.brand.findUniqueOrThrow({ where: { id: "b1" } })).logoKey).toBe(
        "brands/toyota/v1/logo.png",
      );
    }, 15_000);
  });
});
