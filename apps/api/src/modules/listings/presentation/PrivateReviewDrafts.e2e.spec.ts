import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PrismaService } from "@auto-tm/db";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule } from "@nestjs/jwt";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { CreateBucketCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, expect, it } from "vitest";

import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { IdentityModule } from "../../identity/identity.module";
import { ListingsModule } from "../listings.module";
import { PublishListing } from "../application/PublishListing";
import { UpdateDraft } from "../application/UpdateDraft";
import { DiscardDraft } from "../application/DiscardDraft";
import { DeleteListing } from "../application/DeleteListing";

let storage: StartedTestContainer;
let app: NestFastifyApplication;
let db: PrismaService;
let endpoint: string;
const ownerId = randomUUID();
const brandId = randomUUID();
const modelId = randomUUID();
const regionId = randomUUID();
const cityId = randomUUID();
const bodyId = randomUUID();
const ids = [1, 2, 3, 4].map((n) => `b1130000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const dbDir = resolve(__dirname, "../../../../../../packages/db");
function operator(mode: "plan" | "apply" | "check", planHash?: string) {
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "scripts/rich-scenarios.ts",
    "--target", "local", "--scenario-set", "private-drafts", "--mode", mode, "--owner-id", ownerId,
    ...(planHash ? ["--plan-hash", planHash] : [])], { cwd: dbDir, encoding: "utf8",
    env: { ...process.env, APP_ENV: "test", NODE_ENV: "test", MINIO_ENDPOINT: endpoint, MINIO_PUBLIC_URL: endpoint,
      MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin" }, stdio: ["ignore", "pipe", "pipe"] })) as { planHash: string; writes: number };
}
beforeAll(async () => {
  // Actual isolated storage and the configured per-worker disposable Postgres DB.
  storage = await new GenericContainer("cgr.dev/chainguard/minio@sha256:4692462f35d97d7e82c30371d82f057703c5d9489bcae726010594c812f2d285")
    .withUser("0:0").withEnvironment({ MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" })
    .withCommand(["server", "/data"]).withExposedPorts(9000).withWaitStrategy(Wait.forHttp("/minio/health/live", 9000)).start();
  endpoint = `http://${storage.getHost()}:${storage.getMappedPort(9000)}/`;
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  await s3.send(new CreateBucketCommand({ Bucket: "listing-photos" }));
  await s3.send(new PutBucketPolicyCommand({ Bucket: "listing-photos", Policy: JSON.stringify({ Version: "2012-10-17", Statement: [
    { Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::listing-photos/*" },
  ] }) }));
  s3.destroy();
  const module = await Test.createTestingModule({ imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: (cfg) => EnvSchema.parse({ ...cfg,
      MINIO_ENDPOINT: endpoint, MINIO_PUBLIC_URL: endpoint, MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin" }) }),
    EventEmitterModule.forRoot(), bullTestRoot(), JwtModule.register({ global: true, secret: "private-disposable-test-secret" }), IdentityModule, ListingsModule,
  ] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  db = app.get(PrismaService);
  await db.user.create({ data: { id: ownerId, role: "seller", phone: "+99361999876", phoneVerifiedAt: new Date() } });
  await db.brand.create({ data: { id: brandId, slug: "lexus", nameEn: "Lexus", nameRu: "Lexus", nameTk: "Lexus" } });
  await db.model.create({ data: { id: modelId, brandId, slug: "es", nameEn: "ES", nameRu: "ES", nameTk: "ES" } });
  await db.region.create({ data: { id: regionId, slug: "ashgabat", nameEn: "Ashgabat", nameRu: "Ashgabat", nameTk: "Ashgabat" } });
  await db.city.create({ data: { id: cityId, regionId, slug: "ashgabat-city", nameEn: "Ashgabat", nameRu: "Ashgabat", nameTk: "Ashgabat" } });
  await db.bodyType.create({ data: { id: bodyId, nameEn: "Sedan", nameRu: "Sedan", nameTk: "Sedan" } });
}, 60_000);
afterAll(async () => { await app?.close(); await storage?.stop(); });

it("real private uploads pass adoption and three-photo publication; zero/one fail and 21 fails without consuming reusable cases", async () => {
  const plan = operator("plan");
  operator("apply", plan.planHash);
  const original = await db.listingDraft.findMany({ where: { userId: ownerId }, orderBy: { id: "asc" } });
  const publish = app.get(PublishListing);
  const update = app.get(UpdateDraft);
  const savedThree = original[2]?.payload as ListingsSchemas.ListingDraftPayload;
  const originalUploads = await db.mediaUpload.findMany({ where: { userId: ownerId }, orderBy: { id: "asc" } });
  const autosaved = await update.execute({ userId: ownerId, draftId: ids[2]!, payload: { ...savedThree,
    photos: savedThree.photos!.map((photo) => ({ photoId: photo.photoId, key: photo.key, sortOrder: photo.sortOrder })) } });
  // #1140 tracks the incumbent JSONB/key-order validation invalidation. Only
  // this exact bookkeeping difference may coexist with an unchanged baseline.
  expect(autosaved.draft.payload).toEqual({ ...savedThree, validatedSteps: ["vehicle", "specs"] });
  expect(await db.listingDraft.findMany({ where: { userId: ownerId, id: { not: ids[2]! } }, orderBy: { id: "asc" } }))
    .toEqual(original.filter((draft) => draft.id !== ids[2]));
  expect(await db.mediaUpload.findMany({ where: { userId: ownerId }, orderBy: { id: "asc" } })).toEqual(originalUploads);
  expect(operator("check").writes).toBe(0);
  // This isolated test owns the whole installed set and its real AVAILABLE uploads.
  // Shared native proof uses a separately owned copy before stable installation.
  const fields = { priceAmount: 1, priceCurrency: "TMT" as const, cityId, regionId, contactPhone: "+99361999876", allowCalls: false, allowChat: true };
  for (const index of [0, 1]) {
    const draftId = ids[index] as string;
    await update.execute({ userId: ownerId, draftId, payload: fields });
    await expect(publish.execute({ userId: ownerId, draftId })).rejects.toMatchObject({ response: { code: "INVALID_DRAFT_PAYLOAD" } });
  }
  const boundary = original[3];
  if (!boundary || !ids[2]) throw new Error("Missing scenario");
  const photos = (boundary.payload as ListingsSchemas.ListingDraftPayload).photos!;
  await update.execute({ userId: ownerId, draftId: boundary.id, payload: { ...fields, photos: [...photos, { ...photos[0]!, photoId: randomUUID(), sortOrder: 20 }] } });
  await expect(publish.execute({ userId: ownerId, draftId: boundary.id })).rejects.toMatchObject({ response: { code: "INVALID_DRAFT_PAYLOAD" } });
  await update.execute({ userId: ownerId, draftId: boundary.id, payload: { photos } });
  // Only this isolated test consumes its 3-photo scenario to exercise the actual adopter.
  await update.execute({ userId: ownerId, draftId: ids[2], payload: fields });
  const result = await publish.execute({ userId: ownerId, draftId: ids[2] });
  const media = await db.listingMedia.findMany({ where: { listingId: result.listing.id }, orderBy: { sortOrder: "asc" } });
  expect(media).toHaveLength(3);
  expect(media.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  expect(await db.mediaUpload.count({ where: { userId: ownerId, state: "ADOPTED" } })).toBe(3);
  expect(await db.listingDraft.findUnique({ where: { id: ids[2] } })).toBeNull();
  expect(() => operator("check")).toThrow(/Partial\/consumed private drafts/);
  await app.get(DeleteListing).execute({ userId: ownerId, listingId: result.listing.id });
  for (const draft of await db.listingDraft.findMany({ where: { userId: ownerId } })) {
    await app.get(DiscardDraft).execute({ userId: ownerId, draftId: draft.id });
  }
}, 120_000);
