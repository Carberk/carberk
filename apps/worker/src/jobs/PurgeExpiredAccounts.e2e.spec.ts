import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";

/**
 * Runs only against the CI disposable Postgres, which the workflow migrates
 * before `pnpm test`. The purge's every-run delete drops ALL code requests
 * older than 30 days in whatever database DATABASE_URL names, and vitest sets
 * NODE_ENV=test on its own, so an environment variable the runner controls
 * (CI=true, which GitHub Actions always sets) gates the suite instead: a dev
 * database pointed at by hand is never touched.
 */
const runWithDatabase = process.env["CI"] === "true" && Boolean(process.env["DATABASE_URL"]);
const describeWithDatabase = runWithDatabase ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

function suitePhone(alias: string): string {
  const hex = createHash("sha256").update(`purge-e2e:${alias}`).digest("hex");
  let digits = "";
  for (let i = 0; digits.length < 7 && i + 2 <= hex.length; i += 2) {
    digits += String(parseInt(hex.slice(i, i + 2), 16) % 100).padStart(2, "0");
  }
  return `+9936${digits.slice(0, 7)}`;
}

describeWithDatabase("PurgeExpiredAccounts — Postgres", () => {
  const now = new Date();
  const expiredUserId = randomUUID();
  const otherUserId = randomUUID();
  const expiredPhone = suitePhone("expired");
  const otherPhone = suitePhone("other");
  const strangerPhone = suitePhone("stranger");

  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.otpRequest.deleteMany({
      where: {
        OR: [
          { userId: { in: [expiredUserId, otherUserId] } },
          { destination: { in: [expiredPhone, otherPhone, strangerPhone] } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: [expiredUserId, otherUserId] } } });
    await prisma.onModuleDestroy();
  });

  it("deletes code requests past retention and the purged User's own, and keeps the rest", async () => {
    await prisma.user.create({
      data: {
        id: expiredUserId,
        phone: expiredPhone,
        phoneVerifiedAt: now,
        deletionScheduledAt: new Date(now.getTime() - 1_000),
      },
    });
    await prisma.user.create({
      data: { id: otherUserId, phone: otherPhone, phoneVerifiedAt: now },
    });

    const old = new Date(now.getTime() - 31 * DAY_MS);
    const seed = (data: {
      destination: string;
      userId?: string;
      createdAt: Date;
    }) =>
      prisma.otpRequest.create({
        data: {
          purpose: "sign_in",
          channel: "phone",
          codeHash: "e2e-code-hash",
          expiresAt: new Date(now.getTime() + DAY_MS),
          ip: "10.0.0.1",
          ...data,
          userId: data.userId ?? null,
        },
      });

    // Past retention: gone on every run, whoever they belong to.
    const oldStranger = await seed({ destination: strangerPhone, createdAt: old });
    const oldExpiredPhone = await seed({ destination: expiredPhone, createdAt: old });
    // Recent, but the purged User's: by User id, or by the purged phone from
    // a signed-out request.
    const recentOwn = await seed({ destination: strangerPhone, userId: expiredUserId, createdAt: now });
    const recentSignedOut = await seed({ destination: expiredPhone, createdAt: now });
    // Recent and not the purged User's: stay until they are 30 days old.
    const recentStranger = await seed({ destination: strangerPhone, createdAt: now });
    const recentOtherUser = await seed({ destination: otherPhone, userId: otherUserId, createdAt: now });

    const result = await new PurgeExpiredAccounts(prisma).execute({ now });

    // The CI database is shared with other suites, which may leave their own
    // due Users behind: this suite answers only for the rows it created.
    expect(result.purgedCount).toBeGreaterThanOrEqual(1);
    const remaining = await prisma.otpRequest.findMany({
      where: {
        id: {
          in: [
            oldStranger.id,
            oldExpiredPhone.id,
            recentOwn.id,
            recentSignedOut.id,
            recentStranger.id,
            recentOtherUser.id,
          ],
        },
      },
      select: { id: true },
    });
    expect(remaining.map((row) => row.id).sort()).toEqual(
      [recentStranger.id, recentOtherUser.id].sort(),
    );

    const purged = await prisma.user.findUnique({
      where: { id: expiredUserId },
      select: { phone: true, deletionScheduledAt: true },
    });
    expect(purged).toEqual({ phone: null, deletionScheduledAt: null });
  });
  it("removes only the purged sender's issuance while preserving both participants' history and stored bytes", async () => {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "http://127.0.0.1:9000";
    if (!["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname)) throw new Error("Purge storage proof requires loopback S3");
    const s3 = new S3Client({ endpoint, forcePathStyle: true, region: "us-east-1", requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    const expired = randomUUID(), peer = randomUUID(), brand = randomUUID(), model = randomUUID(), region = randomUUID(), city = randomUUID(), listing = randomUUID(), conversation = randomUUID();
    const names = { nameRu: "Synthetic", nameEn: "Synthetic", nameTk: "Synthetic" };
    const ownKey = `chat-attachments/${conversation}/${randomUUID()}/original.webp`, peerKey = `chat-attachments/${conversation}/${randomUUID()}/original.webp`;
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).webp().toBuffer();
    try {
      await prisma.user.createMany({ data: [{ id: expired, deletionScheduledAt: now }, { id: peer }] });
      await prisma.brand.create({ data: { id: brand, slug: brand, ...names } });
      await prisma.model.create({ data: { id: model, brandId: brand, slug: model, ...names } });
      await prisma.region.create({ data: { id: region, slug: region, ...names } });
      await prisma.city.create({ data: { id: city, regionId: region, slug: city, ...names } });
      await prisma.listing.create({ data: { id: listing, sellerId: peer, brandId: brand, modelId: model, cityId: city, priceAmount: 100000 } });
      await prisma.conversation.create({ data: { id: conversation, listingId: listing, buyerId: expired, sellerId: peer } });
      for (const metadata of [{ contentType: "image/jpeg", sizeBytes: bytes.length }, { contentType: "image/webp", sizeBytes: 0 }, { contentType: "image/webp", sizeBytes: 5242881 }]) {
        await expect(prisma.chatAttachmentUpload.create({ data: { key: `chat-attachments/${conversation}/${randomUUID()}/original.webp`,
          senderId: expired, conversationId: conversation, ...metadata } })).rejects.toThrow("chat_attachment_uploads_metadata_check");
      }
      for (const [key, senderId] of [[ownKey, expired], [peerKey, peer]] as const) {
        await prisma.chatAttachmentUpload.create({ data: { key, senderId, conversationId: conversation, contentType: "image/webp", sizeBytes: bytes.length } });
        await prisma.message.create({ data: { conversationId: conversation, senderId, kind: "image", metadata: { key } } });
        await s3.send(new PutObjectCommand({ Bucket: "chat-attachments", Key: key, Body: bytes, ContentType: "image/webp" }));
      }
      await new PurgeExpiredAccounts(prisma).execute({ now });
      expect(await prisma.chatAttachmentUpload.findUnique({ where: { key: ownKey } })).toBeNull();
      expect((await prisma.chatAttachmentUpload.findUnique({ where: { key: peerKey } }))?.senderId).toBe(peer);
      expect(await prisma.message.count({ where: { conversationId: conversation } })).toBe(2);
      for (const key of [ownKey, peerKey]) {
        const object = await s3.send(new GetObjectCommand({ Bucket: "chat-attachments", Key: key }));
        if (!object.Body) throw new Error("Missing owned chat fixture bytes");
        expect(Buffer.from(await object.Body.transformToByteArray())).toEqual(bytes);
      }
    } finally {
      for (const Key of [ownKey, peerKey]) await s3.send(new DeleteObjectCommand({ Bucket: "chat-attachments", Key }));
      s3.destroy();
      await prisma.user.deleteMany({ where: { id: { in: [expired, peer] } } });
      await prisma.model.deleteMany({ where: { id: model } }); await prisma.brand.deleteMany({ where: { id: brand } });
      await prisma.city.deleteMany({ where: { id: city } }); await prisma.region.deleteMany({ where: { id: region } });
    }
  });

});
