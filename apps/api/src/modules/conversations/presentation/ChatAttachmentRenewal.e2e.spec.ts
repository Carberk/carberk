import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { createServer, request as forward } from "node:http";
import { once } from "node:events";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { EventEmitter2, EventEmitterModule } from "@nestjs/event-emitter";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";
import { ConversationsSchemas } from "@auto-tm/contracts";
import sharp from "sharp";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { EnvSchema } from "../../../env.schema";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { cleanSuiteFixtures, defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import { ConversationsModule } from "../conversations.module";

const suite = defineE2eSuite("chat-grant-renewal"), owner = suite.id("owner"), peer = suite.id("peer"), outsider = suite.id("outsider");
const bucket = "chat-attachments";

describe("sender-bound chat renewal through authenticated HTTP and S3", () => {
  let app: NestFastifyApplication, api: ReturnType<typeof supertest>, db: PrismaService, s3: S3Client;
  let conversationId: string, otherConversationId: string, bytes: Buffer, apiOrigin: string;
  const keys = new Set<string>(), events: string[] = [];
  let afterHead: { key: string; wait: () => Promise<void> } | undefined;
  let dropUpload: string | undefined, failCleaning: string | undefined, dropMessage = false;
  let storageBearerSeen = false;
  // Only network boundaries delay/drop replies; all application/database/storage implementations are real.
  const storageProxy = createServer((req, res) => {
    if (req.headers.authorization?.startsWith("Bearer ")) storageBearerSeen = true;
    const upstream = forward(new URL(req.url ?? "/", process.env["MINIO_ENDPOINT"]), { method: req.method, headers: req.headers }, response => {
      void (async () => {
        const key = req.url?.split("?")[0]?.slice(`/${bucket}/`.length);
        if (req.method === "HEAD" && afterHead && afterHead.key === key) { const held = afterHead; afterHead = undefined; await held.wait(); }
        if (req.method === "PUT" && ((dropUpload === key && req.url?.includes("X-Amz-")) || failCleaning === key)) {
          if (dropUpload === key) dropUpload = undefined;
          response.resume(); res.destroy(); return;
        }
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
      })().catch(() => res.destroy());
    });
    upstream.on("error", () => res.destroy()); req.pipe(upstream);
  });
  const apiProxy = createServer((req, res) => {
    const upstream = forward(new URL(req.url ?? "/", apiOrigin), { method: req.method, headers: req.headers }, response => {
      if (dropMessage && req.url?.endsWith("/messages/rich") && response.statusCode === 201) {
        dropMessage = false; response.resume(); res.destroy(); return;
      }
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on("error", () => res.destroy()); req.pipe(upstream);
  });
  async function listen(server: typeof storageProxy) {
    server.listen({ port: 0, host: "127.0.0.1" }); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
    return `http://127.0.0.1:${address.port}`;
  }
  beforeAll(async () => {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
    if (!inject("apiTestDatabases") || !["127.0.0.1", "localhost"].includes(new URL(endpoint).hostname)) throw new Error("Requires isolated DB and loopback S3");
    s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    const storageOrigin = await listen(storageProxy);
    const module = await Test.createTestingModule({ imports: [EventEmitterModule.forRoot(), bullTestRoot(),
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ MINIO_ENDPOINT: storageOrigin, MINIO_PUBLIC_URL: storageOrigin })], validate: cfg => EnvSchema.parse(cfg) }),
      ConversationsModule, JwtModule.register({ global: true, secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me" }),
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)), new AccountDeletionPendingGuard(app.get(Reflector), app.get(IDENTITY_CHECK_PORT)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); apiOrigin = await app.getUrl(); api = supertest(await listen(apiProxy)); db = app.get(PrismaService);
    app.get(EventEmitter2).on("MessageSent", (event: { messageId: string }) => { events.push(event.messageId); });
    for (const alias of ["owner", "peer", "outsider"]) await db.user.create({ data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date() } });
    await seedSuiteCatalog(db, suite);
    const listing = await db.listing.create({ data: { id: suite.id("listing"), sellerId: peer, brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, priceAmount: 100000, priceTmt: 100000, status: "active", allowChat: true } });
    conversationId = (await api.post("/api/v1/conversations").set("Authorization", auth()).send({ listingId: listing.id }).expect(201)).body.id;
    otherConversationId = (await api.post("/api/v1/conversations").set("Authorization", auth(outsider)).send({ listingId: listing.id }).expect(201)).body.id;
    bytes = await sharp({ create: { width: 32, height: 48, channels: 3, background: "red" } }).webp()
      .withExif({ IFD0: { Make: "SyntheticCamera" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 0/1 0/1" } }).withMetadata({ orientation: 6 }).toBuffer();
  });
  afterAll(async () => {
    afterHead = undefined; failCleaning = undefined;
    if (db) await cleanSuiteFixtures(db, suite, { userAliases: ["owner", "peer", "outsider"] });
    if (s3) { for (const Key of keys) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })); s3.destroy(); }
    await app?.close();
    for (const server of [storageProxy, apiProxy]) { server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  const auth = (user = owner) => `Bearer ${mintUserJwt(user)}`;
  const declaration = (key: string) => ({ key, contentType: "image/webp", sizeBytes: bytes.length });
  async function issue() {
    const response = await api.post(`/api/v1/conversations/${conversationId}/attachments/presign`).set("Authorization", auth())
      .send({ contentType: "image/webp", sizeBytes: bytes.length }).expect(201);
    const grant = ConversationsSchemas.PresignChatAttachmentResponseSchema.parse(response.body); keys.add(grant.key);
    expect(grant.expiresIn).toBe(600); return grant;
  }
  const renew = (key: string, user = owner, conversation = conversationId, extra = {}) => api.post(`/api/v1/conversations/${conversation}/attachments/renew`)
    .set("Authorization", auth(user)).send({ ...declaration(key), ...extra });
  const put = (grant: { uploadUrl: string; headers?: Record<string, string> }) => fetch(grant.uploadUrl, {
    method: "PUT", headers: grant.headers ?? { "content-type": "image/webp" }, body: new Uint8Array(bytes),
  });
  async function read(key: string) { const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return Buffer.from(await result.Body!.transformToByteArray()); }
  const send = (key: string, clientMessageId: string, user = owner) => api.post(`/api/v1/conversations/${conversationId}/messages/rich`).set("Authorization", auth(user))
    .send({ kind: "image", metadata: { key, width: 32, height: 48 }, clientMessageId });
  function holdHead(key: string) {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
    afterHead = { key, wait: async () => { entered(); await resume; } }; return { reached, release };
  }
  async function grantFor(key: string) {
    const grant = ConversationsSchemas.RenewChatAttachmentResponseSchema.parse((await renew(key).expect(201)).body);
    if (grant.state !== "upload_required") throw new Error("Expected absent-object grant"); return grant;
  }

  it("renews the same key with signed metadata, one successful PUT and no bearer to storage", async () => {
    const original = await issue(), grant = await grantFor(original.key);
    expect(grant.key).toBe(original.key);
    const signed = new URL(grant.uploadUrl).searchParams.get("X-Amz-SignedHeaders")?.split(";");
    expect(signed).toEqual(expect.arrayContaining(["host", "if-none-match", "content-type", "content-length"]));
    for (const headers of [{ "content-type": "image/webp" }, { ...grant.headers, "if-none-match": "changed" }, { ...grant.headers, "content-type": "image/jpeg" }]) {
      expect([400, 403, 412]).toContain((await fetch(grant.uploadUrl, { method: "PUT", headers, body: new Uint8Array(bytes) })).status);
    }
    expect([400, 403, 412]).toContain((await fetch(grant.uploadUrl, { method: "PUT", headers: grant.headers, body: new Uint8Array(bytes.subarray(1)) })).status);
    const results = await Promise.all([put(grant), put(grant)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 412]); expect(await read(grant.key)).toEqual(bytes);
    expect((await renew(grant.key).expect(201)).body).toEqual({ state: "present", key: grant.key });
    expect((await put(grant)).status).toBe(412); expect(storageBearerSeen).toBe(false);
    const page = await api.get(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", auth()).expect(200);
    expect(page.body.items).toEqual([]);
  });

  it("refuses foreign/public/unknown/mismatched keys, account and Conversation access loss", async () => {
    const { key } = await issue();
    await api.post(`/api/v1/conversations/${conversationId}/attachments/renew`).send(declaration(key)).expect(401);
    await api.post(`/api/v1/conversations/${conversationId}/attachments/renew`).set("Authorization", "Bearer invalid").send(declaration(key)).expect(401);
    const expired = app.get(JwtService).sign({ sub: owner }, { expiresIn: -1 });
    await api.post(`/api/v1/conversations/${conversationId}/attachments/renew`).set("Authorization", `Bearer ${expired}`).send(declaration(key)).expect(401);
    for (const response of [await renew(key, peer), await renew(`chat-attachments/${conversationId}/${randomUUID()}/original.webp`),
      await renew(key, peer, otherConversationId), await renew(key, owner, conversationId, { sizeBytes: bytes.length + 1 })]) {
      expect(response.status).toBe(400); expect(ConversationsSchemas.RenewChatAttachmentRefusalSchema.parse(response.body).code).toBe("UPLOAD_NOT_AVAILABLE");
      expect(response.body.uploadUrl).toBeUndefined();
    }
    for (const extra of [{ contentType: "image/jpeg" }, { etag: "caller" }]) {
      const response = await renew(key, owner, conversationId, extra).expect(400);
      expect(ConversationsSchemas.RenewChatAttachmentRefusalSchema.parse(response.body).code).toBe("VALIDATION_FAILED");
    }
    await renew(key, outsider).expect(403);
    for (const data of [{ suspendedAt: new Date() }, { suspendedAt: null, deletionScheduledAt: new Date() }]) {
      await db.user.update({ where: { id: owner }, data }); await renew(key).expect(403);
    }
    await db.user.update({ where: { id: owner }, data: { suspendedAt: null, deletionScheduledAt: null } });
    await db.blockedUser.create({ data: { blockerId: peer, blockedId: owner } }); await renew(key).expect(403);
    await db.blockedUser.deleteMany({ where: { blockerId: peer, blockedId: owner } });
  });

  it("never infers issuance from existing public bytes and refuses changed stored metadata", async () => {
    const unknown = `chat-attachments/${conversationId}/${randomUUID()}/original.webp`; keys.add(unknown);
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: unknown, Body: bytes, ContentType: "image/webp" }));
    await renew(unknown).expect(400); await renew(unknown, peer).expect(400); expect(await read(unknown)).toEqual(bytes);
    const original = await issue();
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: original.key, Body: bytes, ContentType: "image/jpeg" }));
    await renew(original.key).expect(400); expect(await read(original.key)).toEqual(bytes);
  });

  it("reconciles a lost PUT response without granting overwrite, then cleans and deduplicates a lost send response", async () => {
    const original = await issue(), grant = await grantFor(original.key); dropUpload = grant.key;
    await expect(put(grant)).rejects.toThrow(); expect(await read(grant.key)).toEqual(bytes);
    expect((await renew(grant.key).expect(201)).body).toEqual({ state: "present", key: grant.key });
    const clientId = randomUUID(); dropMessage = true;
    await expect(send(grant.key, clientId)).rejects.toThrow();
    const retry = await send(grant.key, clientId).expect(201), stored = await read(grant.key);
    expect((await sharp(stored).metadata()).exif).toBeUndefined(); expect(stored.equals(bytes)).toBe(false);
    const duplicate = await send(grant.key, clientId).expect(201);
    expect(duplicate.body.id).toBe(retry.body.id); expect(events.filter(id => id === retry.body.id)).toHaveLength(1);
    const page = await api.get(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", auth()).expect(200);
    expect(page.body.items.filter((message: { clientMessageId?: string }) => message.clientMessageId === clientId)).toHaveLength(1);
    await renew(grant.key).expect(400); expect((await put(grant)).status).toBe(412);
  });

  it("refuses renewal after a peer commits the key, including a soft-deleted Message", async () => {
    const original = await issue(); expect((await put(original)).status).toBe(200);
    const sent = await send(original.key, randomUUID(), peer).expect(201);
    await renew(original.key).expect(400);
    await api.delete(`/api/v1/conversations/${conversationId}/messages/${sent.body.id}`).set("Authorization", auth(peer)).expect(200);
    await renew(original.key).expect(400);
    // Original grants retain their existing unconditional overwrite exposure until expiry.
    expect((await put(original)).status).toBe(200); expect(await read(original.key)).toEqual(bytes);
  });

  it("rechecks committed use and account authority after a delayed storage HEAD", async () => {
    for (const operation of ["send", "suspend"] as const) {
      const original = await issue(); expect((await put(original)).status).toBe(200);
      const held = holdHead(original.key), pending = renew(original.key).then(response => response); await held.reached;
      try {
        if (operation === "send") await send(original.key, randomUUID()).expect(201);
        else await db.user.update({ where: { id: owner }, data: { suspendedAt: new Date() } });
      } finally { held.release(); }
      expect((await pending).status).toBe(operation === "send" ? 400 : 403);
      await db.user.update({ where: { id: owner }, data: { suspendedAt: null } });
    }
  });

  it("never replaces bytes that appear after its absent-object inspection", async () => {
    const original = await issue(), held = holdHead(original.key), pending = grantFor(original.key); await held.reached;
    try { expect((await put(original)).status).toBe(200); } finally { held.release(); }
    expect((await put(await pending)).status).toBe(412); expect(await read(original.key)).toEqual(bytes);
  });

  it("reconciles cleaned-but-uncommitted bytes through the unchanged send, and deduplicates concurrent sends", async () => {
    const original = await issue(); expect((await put(original)).status).toBe(200);
    const clientId = randomUUID(); failCleaning = original.key;
    try { await send(original.key, clientId).expect(500); } finally { failCleaning = undefined; }
    expect((await sharp(await read(original.key)).metadata()).exif).toBeUndefined();
    await renew(original.key).expect(400); // Strict original metadata equality, never replacement authority.
    const [left, right] = await Promise.all([send(original.key, clientId).expect(201), send(original.key, clientId).expect(201)]);
    expect(left.body.id).toBe(right.body.id); expect(events.filter(id => id === left.body.id)).toHaveLength(1);
  });

  it.runIf(process.env["CHAT_RENEWAL_REAL_EXPIRY"] === "true")("renews an actually expired unchanged600s grant for the same unsent key", async () => {
    const original = await issue(), signed = new URL(original.uploadUrl);
    const stamp = signed.searchParams.get("X-Amz-Date")!, issued = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(9, 11), +stamp.slice(11, 13), +stamp.slice(13, 15));
    expect(signed.searchParams.get("X-Amz-Expires")).toBe("600");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, issued + 602000 - Date.now()) + 25));
    const attempted = Date.now();
    expect(attempted - issued).toBeGreaterThanOrEqual(602000); expect((await put(original)).status).toBe(403);
    const grant = await grantFor(original.key); expect(grant.key).toBe(original.key); expect((await put(grant)).status).toBe(200);
    expect(await read(grant.key)).toEqual(bytes);
    const clientId = randomUUID(), sent = await send(grant.key, clientId).expect(201);
    expect((await send(grant.key, clientId).expect(201)).body.id).toBe(sent.body.id);
    expect(events.filter(id => id === sent.body.id)).toHaveLength(1); await renew(grant.key).expect(400);
    process.stdout.write(JSON.stringify({ proof: "1258-real-expiry", issuedUtc: new Date(issued).toISOString(), attemptedUtc: new Date(attempted).toISOString(), elapsedMs: attempted - issued, payloadBytes: bytes.length, oldPut: 403, renewedPut: 200, committedRenewal: 400 }) + "\n");
  }, 630000);
});
