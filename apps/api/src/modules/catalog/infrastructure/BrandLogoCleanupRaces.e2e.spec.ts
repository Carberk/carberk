import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { PrismaService } from "@auto-tm/db";

import type { Env } from "../../../env.schema";
import { DeleteBrand } from "../application/DeleteBrand";
import { RemoveBrandLogo } from "../application/RemoveBrandLogo";
import { SetBrandLogo } from "../application/SetBrandLogo";
import { MinioBrandLogoStorage } from "./MinioBrandLogoStorage";
import { PrismaBrandRepository } from "./PrismaBrandRepository";
import { SharpLogoImageProcessor } from "./SharpLogoImageProcessor";

/**
 * ADR-0072 runtime verification against real PostgreSQL and real MinIO, with
 * two independent PostgreSQL clients and deliberately delayed storage cleanup.
 * The suite clears the catalog brands of its worker's own database
 * (test/globalSetup.ts). MinIO is shared by spec files running in parallel, so
 * every brand here has a `races-` slug, and the suite clears only the objects
 * under `brands/races-` and `pending/brands/races-` in `catalog-assets`.
 */
const BUCKET = "catalog-assets";
const SLUG_PREFIX = "races-";
const TOYOTA = `${SLUG_PREFIX}toyota`;
const BMW = `${SLUG_PREFIX}bmw`;
const KIA = `${SLUG_PREFIX}kia`;
const AUDI = `${SLUG_PREFIX}audi`;
const SEAT = `${SLUG_PREFIX}seat`;
const FILES = ["logo.png", "mono@1x.png", "mono@2x.png", "mono@3x.png"];

const endpoint = process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000";
const credentials = {
  accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
  secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
};
const config = new ConfigService<Env, true>({
  MINIO_ENDPOINT: endpoint,
  MINIO_PUBLIC_URL: endpoint,
  MINIO_REGION: process.env["MINIO_REGION"] ?? "us-east-1",
  MINIO_ACCESS_KEY: credentials.accessKeyId,
  MINIO_SECRET_KEY: credentials.secretAccessKey,
});

type Stack = {
  prisma: PrismaService;
  storage: MinioBrandLogoStorage;
  setLogo: SetBrandLogo;
  removeLogo: RemoveBrandLogo;
  deleteBrand: DeleteBrand;
};

function buildStack(): Stack {
  const prisma = new PrismaService();
  const repo = new PrismaBrandRepository(prisma);
  const storage = new MinioBrandLogoStorage(config);
  return {
    prisma,
    storage,
    setLogo: new SetBrandLogo(repo, storage, new SharpLogoImageProcessor(), prisma),
    removeLogo: new RemoveBrandLogo(repo, storage, prisma),
    deleteBrand: new DeleteBrand(
      repo,
      prisma,
      { invalidate: () => undefined } as never,
      storage,
    ),
  };
}

type SdkCommand = { constructor: { name: string }; input: Record<string, unknown> };

/** True for the storage calls a logo cleanup makes under `brands/`, never for pending uploads. */
function isBrandCleanup(command: SdkCommand): boolean {
  const input = command.input;
  switch (command.constructor.name) {
    case "ListObjectsV2Command":
      return String(input["Prefix"]).startsWith("brands/");
    case "DeleteObjectCommand":
      return String(input["Key"]).startsWith("brands/");
    case "DeleteObjectsCommand":
      return ((input["Delete"] as { Objects: { Key: string }[] }).Objects[0]?.Key ?? "").startsWith("brands/");
    default:
      return false;
  }
}

/** Stalls the first cleanup storage call of one API instance until released. */
function delayCleanup(stack: Stack) {
  const client = (stack.storage as unknown as { s3: S3Client }).s3;
  const original = client.send.bind(client) as (command: unknown) => Promise<unknown>;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const reachedGate = new Promise<void>((resolve) => { reached = resolve; });
  let stalled = false;
  vi.spyOn(client, "send").mockImplementation((async (command: SdkCommand) => {
    if (!stalled && isBrandCleanup(command)) {
      stalled = true;
      reached();
      await released;
    }
    return original(command);
  }) as never);
  return { release, reached: reachedGate };
}

/**
 * Freezes the clock at "now", so two uploads share one millisecond without
 * putting SigV4 signing dates outside MinIO's allowed clock skew.
 */
function freezeClock(): number {
  const frozen = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(frozen);
  return frozen;
}

describe("brand logo cleanup races (ADR-0072) - real PostgreSQL and MinIO", () => {
  let stack: Stack;
  let other: Stack;
  let s3: S3Client;
  let adminId: string;

  beforeAll(async () => {
    stack = buildStack();
    other = buildStack();
    s3 = new S3Client({
      endpoint,
      region: process.env["MINIO_REGION"] ?? "us-east-1",
      credentials,
      forcePathStyle: true,
    });
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw error;
    }
    const admin = await stack.prisma.user.create({
      data: { id: `race-admin-${randomUUID()}`, phone: "+99361000454", phoneVerifiedAt: new Date(), role: "admin" },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await stack.prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await stack.prisma.user.delete({ where: { id: adminId } });
    await stack.prisma.onModuleDestroy();
    await other.prisma.onModuleDestroy();
    s3.destroy();
  });

  async function listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }),
      );
      keys.push(...(page.Contents ?? []).map((o) => o.Key as string));
      token = page.NextContinuationToken;
    } while (token);
    return keys.sort();
  }

  async function exists(key: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  beforeEach(async () => {
    await stack.prisma.listing.deleteMany();
    await stack.prisma.model.deleteMany();
    await stack.prisma.brand.deleteMany();
    for (const prefix of [`brands/${SLUG_PREFIX}`, `pending/brands/${SLUG_PREFIX}`]) {
      const keys = await listKeys(prefix);
      for (let i = 0; i < keys.length; i += 1000) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const logoPng = (size = 90, shade = 0) =>
    sharp({ create: { width: size, height: size, channels: 4, background: { r: shade, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toBuffer();

  async function createBrand(slug: string, id: string = randomUUID(), logoKey: string | null = null) {
    return stack.prisma.brand.create({
      data: { id, slug, nameRu: slug, nameTk: slug, nameEn: slug, logoKey },
    });
  }

  async function confirmLogo(via: Stack, brandId: string, slug: string, bytes: Buffer) {
    const pending = `pending/brands/${slug}/${randomUUID()}`;
    await s3.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: pending, Body: bytes, ContentType: "image/png" }),
    );
    await via.setLogo.execute({ brandId, key: pending }, adminId);
    return (await stack.prisma.brand.findUniqueOrThrow({ where: { id: brandId } })).logoKey as string;
  }

  async function putImported(slug: string, version: string): Promise<string> {
    const body = await logoPng(30);
    for (const file of FILES) {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `brands/${slug}/${version}/${file}`,
          Body: body,
          ContentType: "image/png",
        }),
      );
    }
    return `brands/${slug}/${version}/logo.png`;
  }

  async function untilKey(brandId: string, predicate: (key: string | null) => boolean) {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const row = await stack.prisma.brand.findUnique({ where: { id: brandId } });
      if (predicate(row?.logoKey ?? null)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("the database never reached the expected logo key");
  }

  const directoryOf = (key: string) => key.slice(0, key.lastIndexOf("/") + 1);

  it("removes every file of an imported version, leaving other versions untouched", async () => {
    const brand = await createBrand(TOYOTA);
    const active = `imp-0123456789ab-${randomUUID()}`;
    const key = await putImported(TOYOTA, active);
    const sibling = await putImported(TOYOTA, `imp-ffffffffffff-${randomUUID()}`);
    const adminVersion = `brands/${TOYOTA}/v1790000000000-${randomUUID()}/logo.png`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: adminVersion, Body: await logoPng() }));
    await stack.prisma.brand.update({ where: { id: brand.id }, data: { logoKey: key } });

    await stack.removeLogo.execute({ brandId: brand.id }, adminId);

    expect(await listKeys(`brands/${TOYOTA}/${active}/`)).toEqual([]);
    expect(await listKeys(directoryOf(sibling))).toHaveLength(4);
    expect(await exists(adminVersion)).toBe(true);
  });

  it("survives a delayed deletion when identical content is activated again in the same millisecond", async () => {
    const brand = await createBrand(TOYOTA);
    freezeClock();
    const bytes = await logoPng(90, 7);
    const first = await confirmLogo(stack, brand.id, TOYOTA, bytes);

    const gate = delayCleanup(stack);
    const removing = stack.removeLogo.execute({ brandId: brand.id }, adminId);
    await gate.reached;
    await untilKey(brand.id, (key) => key === null);
    const second = await confirmLogo(other, brand.id, TOYOTA, bytes);
    gate.release();
    await removing;

    expect(second).not.toBe(first);
    expect(directoryOf(second)).not.toBe(directoryOf(first));
    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
    expect((await stack.prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey).toBe(second);
  });

  it("survives a delayed replacement cleanup when the brand is replaced again", async () => {
    const brand = await createBrand(BMW);
    const bytes = await logoPng(90, 11);
    const first = await confirmLogo(stack, brand.id, BMW, bytes);

    const gate = delayCleanup(stack);
    const pending = `pending/brands/${BMW}/${randomUUID()}`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: pending, Body: bytes, ContentType: "image/png" }));
    const replacing = stack.setLogo.execute({ brandId: brand.id, key: pending }, adminId);
    await gate.reached;
    await untilKey(brand.id, (key) => key !== null && key !== first);
    const second = (await stack.prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey as string;
    const third = await confirmLogo(other, brand.id, BMW, bytes);
    gate.release();
    await replacing;

    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(false);
    expect(await exists(third)).toBe(true);
    expect((await stack.prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey).toBe(third);
  });

  it("keeps a recreated brand's logo when the old brand's cleanup finishes late", async () => {
    freezeClock();
    const brand = await createBrand(KIA);
    const first = await confirmLogo(stack, brand.id, KIA, await logoPng(90, 3));

    const gate = delayCleanup(stack);
    const deleting = stack.deleteBrand.execute({ id: brand.id }, adminId);
    await gate.reached;
    expect(await stack.prisma.brand.findUnique({ where: { id: brand.id } })).toBeNull();
    const recreated = await createBrand(KIA);
    const second = await confirmLogo(other, recreated.id, KIA, await logoPng(90, 3));
    gate.release();
    await deleting;

    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
    expect(recreated.id).not.toBe(brand.id);
  }, 30_000);

  it("never leaves the active logo without its object across overlapping set and remove calls", async () => {
    const brand = await createBrand(AUDI);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, async (_, index) => {
        const via = index % 2 === 0 ? stack : other;
        if (index % 3 === 2) return via.removeLogo.execute({ brandId: brand.id }, adminId);
        return confirmLogo(via, brand.id, AUDI, await logoPng(90, index + 1));
      }),
    );

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const final = (await stack.prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey;
    if (final !== null) expect(await exists(final)).toBe(true);
    // Every activated directory was returned by the next swap and deleted once,
    // so no losing object is left behind: only the active logo remains.
    expect(await listKeys(`brands/${AUDI}/`)).toEqual(final === null ? [] : [final]);
  });

  it("does not delete the active logo when a cleanup request fails after the swap", async () => {
    const brand = await createBrand(SEAT);
    const first = await confirmLogo(stack, brand.id, SEAT, await logoPng(90, 5));
    const client = (stack.storage as unknown as { s3: S3Client }).s3;
    const original = client.send.bind(client) as (command: unknown) => Promise<unknown>;
    vi.spyOn(client, "send").mockImplementation((async (command: SdkCommand) => {
      const result = await original(command);
      if (isBrandCleanup(command)) throw new Error("response lost");
      return result;
    }) as never);

    const second = await confirmLogo(stack, brand.id, SEAT, await logoPng(90, 6));

    expect(second).not.toBe(first);
    expect(await exists(second)).toBe(true);
    expect((await stack.prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).logoKey).toBe(second);
  });
});
