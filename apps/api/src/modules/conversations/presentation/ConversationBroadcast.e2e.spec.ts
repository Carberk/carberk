import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { EventEmitter2, EventEmitterModule } from "@nestjs/event-emitter";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { io, type Socket as ClientSocket } from "socket.io-client";
import sharp from "sharp";
import { PrismaService } from "@auto-tm/db";
import type { Prisma } from "@auto-tm/db";

import { ConversationsModule } from "../conversations.module";
import { ListingsModule } from "../../listings/listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { IMAGE_VARIANT_GENERATOR } from "../../listings/domain/ports/ImageVariantGenerator";
import { LISTING_EVENT_PUBLISHER } from "../../listings/domain/ports/ListingEventPublisher";
import { RealtimeIoAdapter } from "../../realtime/infrastructure/RealtimeIoAdapter";
import { REALTIME_NAMESPACE } from "../../realtime/infrastructure/realtime.config";
import type { MessageSentEvent } from "../domain/ports/MessageEventPublisher";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { EnvSchema } from "../../../env.schema";
import { mintUserJwt } from "../../../../test/helpers/mintUserJwt";
import {
  cleanSuiteFixtures,
  defineE2eSuite,
  fakeMediaObjectInspector,
  seedPresignedPhotos,
  seedSuiteCatalog,
} from "../../../../test/helpers/e2eSuite";
import { MEDIA_OBJECT_INSPECTOR } from "../../listings/domain/ports/MediaObjectInspector";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const suite = defineE2eSuite("conversation-broadcast");
type SuiteUser = "seller-1" | "buyer-1" | "buyer-2";
const SUITE_USERS: readonly SuiteUser[] = ["seller-1", "buyer-1", "buyer-2"];

// Long enough for a second, unwanted message:new to arrive on a local socket.
const SETTLE_MS = 300;

type MessageNew = { message: Record<string, unknown> & { id: string } };

describe("Conversation message broadcast e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;
  let baseUrl: string;
  let messageSentEvents: MessageSentEvent[];
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        bullTestRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        EventEmitterModule.forRoot(),
        IdentityModule,
        ListingsModule,
        ConversationsModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    })
      .overrideProvider(MEDIA_OBJECT_INSPECTOR)
      .useValue(fakeMediaObjectInspector)
      .overrideProvider(IMAGE_VARIANT_GENERATOR)
      .useValue({
        generate: async (originalKey: string) => ({
          variants: {
            thumbnail: `${originalKey}/thumbnail.webp`,
            list: `${originalKey}/list.webp`,
            detail: `${originalKey}/detail.webp`,
            fullscreen: `${originalKey}/fullscreen.webp`,
          },
        }),
      })
      .overrideProvider(LISTING_EVENT_PUBLISHER)
      .useValue({ emit: async () => {} })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const adapter = new RealtimeIoAdapter(app, {
      corsOrigin: "*",
      redisAdapterEnabled: false,
      redisUrl: undefined,
    });
    await adapter.configure();
    app.useWebSocketAdapter(adapter);
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);

    // Counts the event that drives push, so the suite can prove each send
    // still publishes it exactly once.
    app.get(EventEmitter2).on("MessageSent", (event: MessageSentEvent) => {
      messageSentEvents.push(event);
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  }, 60_000);

  beforeEach(async () => {
    messageSentEvents = [];
    await cleanSuiteFixtures(prisma, suite, { userAliases: SUITE_USERS });
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect();
    }
  });

  async function createUser(alias: SuiteUser): Promise<string> {
    await prisma.user.create({
      data: { id: suite.id(alias), phone: suite.phone(alias), phoneVerifiedAt: new Date(), role: "buyer" },
    });
    return mintUserJwt(suite.id(alias));
  }

  async function publishListing(sellerToken: string): Promise<string> {
    await seedSuiteCatalog(prisma, suite);
    // TMT→TMT is a shared global singleton — upsert, never delete.
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: "TMT", toCurrency: "TMT" } },
      create: { fromCurrency: "TMT", toCurrency: "TMT", rate: 1 },
      update: { rate: 1 },
    });
    const draftPayload = {
          brandId: suite.catalog.brandId,
          modelId: suite.catalog.modelId,
          cityId: suite.catalog.cityId,
          regionId: suite.catalog.regionId,
          priceAmount: 100000,
          priceCurrency: "TMT",
          year: 2020,
          condition: "used",
          mileageKm: 50000,
          description: "Broadcast test car",
          contactPhone: suite.phone("seller-1"),
          allowCalls: true,
          allowChat: true,
          conditionDisclosure: { damaged: false },
          photos: [0, 1, 2].map((index) => ({ photoId: suite.id(`photo-${index + 1}`), key: `photo1.webp-${index}`, sortOrder: index })),
        } satisfies Record<string, unknown>;
    const seededPayload = await seedPresignedPhotos(prisma, suite.id("seller-1"), draftPayload);
    const draft = await prisma.listingDraft.create({
      data: {
        userId: suite.id("seller-1"),
        payload: seededPayload as Prisma.InputJsonValue,
      },
    });
    const res = await request
      .post(`/api/v1/listings/drafts/${draft.id}/publish`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({})
      .expect(201);
    return res.body.id as string;
  }

  async function seedConversation() {
    const sellerToken = await createUser("seller-1");
    const buyerToken = await createUser("buyer-1");
    const listingId = await publishListing(sellerToken);
    const res = await request
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ listingId })
      .expect(201);
    return {
      sellerToken,
      buyerToken,
      listingId,
      conversationId: res.body.id as string,
    };
  }

  /** A 300x200 camera photo with a GPS position, stored rotated (EXIF Orientation 6). */
  async function photoWithGps(): Promise<Buffer> {
    return sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } } })
      .jpeg()
      .withExif({
        IFD0: { Make: "TestCam" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "37/1 56/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "58/1 23/1 0/1",
        },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
  }

  /** Uploads an image the way the app does: presign, then PUT to storage. */
  async function uploadChatImage(token: string, conversationId: string): Promise<string> {
    const body = await photoWithGps();
    const presign = await request
      .post(`/api/v1/conversations/${conversationId}/attachments/presign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ contentType: "image/webp", sizeBytes: body.length })
      .expect(201);
    const put = await fetch(presign.body.uploadUrl as string, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: new Uint8Array(body),
    });
    expect(put.status).toBe(200);
    return presign.body.key as string;
  }

  /** The image as the other participant's app loads it. */
  async function servedChatImage(key: string): Promise<Buffer> {
    const publicUrl = (process.env["MINIO_PUBLIC_URL"] ?? "").replace(/\/$/, "");
    const res = await fetch(`${publicUrl}/chat-attachments/${key}`);
    expect(res.status).toBe(200);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Connects a socket, joins the conversation room, and records every message:new. */
  async function joinedSocket(token: string, conversationId: string) {
    const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
    sockets.push(socket);
    const received: MessageNew[] = [];
    socket.on("message:new", (event: MessageNew) => received.push(event));

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    const ack = (await socket.emitWithAck("conversation:join", {
      conversationId,
    })) as { ok: boolean };
    expect(ack.ok).toBe(true);
    return { socket, received };
  }

  async function waitFor(received: MessageNew[], count: number) {
    const deadline = Date.now() + 5_000;
    while (received.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  }

  it("delivers an image sent over HTTP to the peer and the sender's other device", async () => {
    const { buyerToken, sellerToken, conversationId } = await seedConversation();
    const peer = await joinedSocket(sellerToken, conversationId);
    const senderDevice = await joinedSocket(buyerToken, conversationId);

    const key = await uploadChatImage(buyerToken, conversationId);
    const uploaded = await sharp(await servedChatImage(key)).metadata();
    expect(uploaded.exif).toBeDefined();
    expect(uploaded.orientation).toBe(6);

    const res = await request
      .post(`/api/v1/conversations/${conversationId}/messages/rich`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        kind: "image",
        metadata: { key, width: 800, height: 600 },
        clientMessageId: "client-img-1",
      })
      .expect(201);

    // The peer loads the stored image as it is: no EXIF (so no GPS position),
    // and upright without the Orientation tag (a 90 degree turn → portrait).
    const served = await sharp(await servedChatImage(key)).metadata();
    expect(served.exif).toBeUndefined();
    expect(served.orientation).toBeUndefined();
    expect({ width: served.width, height: served.height }).toEqual({ width: 200, height: 300 });

    await waitFor(peer.received, 1);
    await waitFor(senderDevice.received, 1);

    const expected = {
      id: res.body.id,
      conversationId,
      senderId: suite.id("buyer-1"),
      kind: "image",
      metadata: { key, width: 800, height: 600 },
      clientMessageId: "client-img-1",
    };
    expect(peer.received).toHaveLength(1);
    expect(peer.received[0]?.message).toMatchObject(expected);
    expect(senderDevice.received).toHaveLength(1);
    expect(senderDevice.received[0]?.message).toMatchObject(expected);
    expect(messageSentEvents).toHaveLength(1);
  });

  it("refuses an image that was never uploaded, over HTTP and over the socket, and delivers nothing", async () => {
    const { buyerToken, sellerToken, conversationId } = await seedConversation();
    const peer = await joinedSocket(sellerToken, conversationId);
    const sender = await joinedSocket(buyerToken, conversationId);
    const key = `chat-attachments/${conversationId}/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp`;

    const res = await request
      .post(`/api/v1/conversations/${conversationId}/messages/rich`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ kind: "image", metadata: { key } })
      .expect(400);
    expect(res.body.details).toMatchObject({ reason: "IMAGE_ATTACHMENT_NOT_USABLE" });

    const ack = (await sender.socket.emitWithAck("message:send", {
      conversationId,
      kind: "image",
      metadata: { key },
      clientMessageId: "client-img-missing",
    })) as { ok: boolean };
    expect(ack.ok).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(peer.received).toHaveLength(0);
    expect(messageSentEvents).toHaveLength(0);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
  });

  it("delivers a post-reference card sent over HTTP to the peer", async () => {
    const { buyerToken, sellerToken, conversationId, listingId } =
      await seedConversation();
    const peer = await joinedSocket(sellerToken, conversationId);

    const res = await request
      .post(`/api/v1/conversations/${conversationId}/messages/post-ref`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ metadata: { listingId }, clientMessageId: "client-ref-1" })
      .expect(201);

    await waitFor(peer.received, 1);

    expect(peer.received).toHaveLength(1);
    expect(peer.received[0]?.message).toMatchObject({
      id: res.body.id,
      kind: "post_ref",
      clientMessageId: "client-ref-1",
      metadata: expect.objectContaining({ listingId, available: true }),
    });
    expect(messageSentEvents).toHaveLength(1);
  });

  it("delivers a legacy text message sent over HTTP to the peer", async () => {
    const { buyerToken, sellerToken, conversationId } = await seedConversation();
    const peer = await joinedSocket(sellerToken, conversationId);

    const res = await request
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ text: "Hello over HTTP" })
      .expect(201);

    await waitFor(peer.received, 1);

    expect(peer.received).toHaveLength(1);
    expect(peer.received[0]?.message).toMatchObject({
      id: res.body.id,
      kind: "text",
      text: "Hello over HTTP",
    });
    expect(peer.received[0]?.message).not.toHaveProperty("clientMessageId");
    expect(messageSentEvents).toHaveLength(1);
  });

  it("delivers to a connected recipient that never joined the conversation room", async () => {
    const { buyerToken, sellerToken, conversationId } = await seedConversation();
    // Connected to the namespace — so it sits in its user room — but it never
    // opened the Conversation, like an app on another screen.
    const idleSocket = io(`${baseUrl}${REALTIME_NAMESPACE}`, {
      auth: { token: sellerToken },
      transports: ["websocket"],
      forceNew: true,
    });
    sockets.push(idleSocket);
    const received: MessageNew[] = [];
    idleSocket.on("message:new", (event: MessageNew) => received.push(event));
    await new Promise<void>((resolve, reject) => {
      idleSocket.once("connect", () => resolve());
      idleSocket.once("connect_error", reject);
    });

    const res = await request
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ text: "Hello to an idle app" })
      .expect(201);

    await waitFor(received, 1);

    expect(received).toHaveLength(1);
    expect(received[0]?.message).toMatchObject({
      id: res.body.id,
      kind: "text",
      text: "Hello to an idle app",
    });
  });

  it("broadcasts a socket send exactly once, including across a retry", async () => {
    const { buyerToken, sellerToken, conversationId } = await seedConversation();
    const peer = await joinedSocket(sellerToken, conversationId);
    const sender = await joinedSocket(buyerToken, conversationId);

    const payload = {
      conversationId,
      kind: "text",
      text: "Hello over socket",
      clientMessageId: "client-sock-1",
    };
    const first = (await sender.socket.emitWithAck("message:send", payload)) as {
      ok: boolean;
      message: { id: string };
    };
    const retry = (await sender.socket.emitWithAck("message:send", payload)) as {
      ok: boolean;
      message: { id: string };
    };

    await waitFor(peer.received, 1);

    expect(first.ok).toBe(true);
    expect(retry.message.id).toBe(first.message.id);
    expect(peer.received).toHaveLength(1);
    expect(peer.received[0]?.message).toMatchObject({
      id: first.message.id,
      clientMessageId: "client-sock-1",
    });
    expect(sender.received).toHaveLength(1);
    expect(messageSentEvents).toHaveLength(1);
  });

  describe("other participant and block state in summaries", () => {
    it("lists the seller as the buyer's peer with the viewer's block state, and no contact data", async () => {
      const { buyerToken, sellerToken } = await seedConversation();
      await prisma.user.update({
        where: { id: suite.id("seller-1") },
        data: { displayName: "Seller One", nameNumber: 2057, avatarIndex: 7 },
      });
      await prisma.user.update({
        where: { id: suite.id("buyer-1") },
        data: { nameNumber: 1111, avatarIndex: 1 },
      });

      const unblocked = await request
        .get("/api/v1/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);
      expect(unblocked.body.items[0].peer).toEqual({
        id: suite.id("seller-1"),
        displayName: "Seller One",
        nameNumber: 2057,
        avatarIndex: 7,
        avatarKey: null,
        deleted: false,
      });
      expect(unblocked.body.items[0].blockedByMe).toBe(false);
      expect(JSON.stringify(unblocked.body)).not.toContain(suite.phone("seller-1"));

      await prisma.blockedUser.create({
        data: { blockerId: suite.id("buyer-1"), blockedId: suite.id("seller-1") },
      });
      const blocked = await request
        .get("/api/v1/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);
      expect(blocked.body.items[0].blockedByMe).toBe(true);

      // The seller never learns that the buyer blocked them.
      const sellerView = await request
        .get("/api/v1/conversations")
        .set("Authorization", `Bearer ${sellerToken}`)
        .expect(200);
      expect(sellerView.body.items[0].peer).toEqual({
        id: suite.id("buyer-1"),
        displayName: null,
        nameNumber: 1111,
        avatarIndex: 1,
        avatarKey: null,
        deleted: false,
      });
      expect(sellerView.body.items[0].blockedByMe).toBe(false);
    });

    it("returns the peer and block state when a Conversation is opened again", async () => {
      const { buyerToken, listingId } = await seedConversation();
      await prisma.user.update({
        where: { id: suite.id("seller-1") },
        data: { nameNumber: 2057, avatarIndex: 7 },
      });
      await prisma.blockedUser.create({
        data: { blockerId: suite.id("buyer-1"), blockedId: suite.id("seller-1") },
      });

      const res = await request
        .post("/api/v1/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ listingId })
        .expect(201);

      expect(res.body.peer).toEqual({
        id: suite.id("seller-1"),
        displayName: null,
        nameNumber: 2057,
        avatarIndex: 7,
        avatarKey: null,
        deleted: false,
      });
      expect(res.body.blockedByMe).toBe(true);
    });
  });

  describe("after the Listing is sold or removed from sale", () => {
    it.each(["sold", "archived"] as const)(
      "keeps an existing Conversation open for HTTP and socket Messages when the Listing is %s",
      async (status) => {
        const { buyerToken, sellerToken, conversationId, listingId } =
          await seedConversation();
        const peer = await joinedSocket(sellerToken, conversationId);
        await prisma.listing.update({
          where: { id: listingId },
          data: { status },
        });

        const state = await request
          .get(`/api/v1/conversations/${conversationId}`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .expect(200);
        expect(state.body.sendRestriction).toBeNull();

        const text = await request
          .post(`/api/v1/conversations/${conversationId}/messages/rich`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({ kind: "text", text: "Still there?", clientMessageId: "sold-text" })
          .expect(201);
        const retry = await request
          .post(`/api/v1/conversations/${conversationId}/messages/rich`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({ kind: "text", text: "Still there?", clientMessageId: "sold-text" })
          .expect(201);
        expect(retry.body.id).toBe(text.body.id);
        await request
          .post(`/api/v1/conversations/${conversationId}/messages/rich`)
          .set("Authorization", `Bearer ${buyerToken}`)
          .send({
            kind: "image",
            metadata: {
              key: await uploadChatImage(buyerToken, conversationId),
              width: 800,
              height: 600,
            },
          })
          .expect(201);

        const sender = await joinedSocket(buyerToken, conversationId);
        const ack = (await sender.socket.emitWithAck("message:send", {
          conversationId,
          kind: "text",
          text: "Over the socket",
          clientMessageId: "sold-sock",
        })) as { ok: boolean };
        expect(ack.ok).toBe(true);

        await waitFor(peer.received, 3);
        expect(peer.received.map((e) => e.message["kind"])).toEqual([
          "text",
          "image",
          "text",
        ]);
        expect(messageSentEvents).toHaveLength(3);
        expect(
          await prisma.message.count({
            where: { conversationId, kind: "system" },
          }),
        ).toBe(0);
      },
    );

    it("still refuses a Message when chat is switched off, and starting a new Conversation", async () => {
      const { buyerToken, conversationId, listingId } = await seedConversation();
      const otherBuyerToken = await createUser("buyer-2");
      await prisma.listing.update({
        where: { id: listingId },
        data: { status: "sold" },
      });

      await request
        .post("/api/v1/conversations")
        .set("Authorization", `Bearer ${otherBuyerToken}`)
        .send({ listingId })
        .expect(403);
      const existing = await request
        .post("/api/v1/conversations")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ listingId })
        .expect(201);
      expect(existing.body.id).toBe(conversationId);

      await prisma.listing.update({
        where: { id: listingId },
        data: { allowChat: false },
      });
      await request
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ text: "Hello" })
        .expect(403);
      const state = await request
        .get(`/api/v1/conversations/${conversationId}`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .expect(200);
      expect(state.body.sendRestriction).toBe("chat_disabled");
    });
  });
});
