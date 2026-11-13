import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { AccountDeletionPendingGuard } from "../../../common/account-deletion-pending.guard";
import { IDENTITY_CHECK_PORT } from "../../identity/identity.public";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { VehicleHistoryModule } from "../vehicle-history.module";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const path = "/api/v1/vehicle-history/requests";
describe("Private Vehicle History requests over HTTP", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let config: ConfigService;
  let request: ReturnType<typeof supertest>;
  let barrier: { remaining: number; ready: Promise<void>; release: () => void } | undefined;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [
      bullTestRoot(), VehicleHistoryModule,
      JwtModule.register({ global: true, secret: "synthetic-history-request-test-secret" }),
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.getHttpAdapter().getInstance().addHook("preHandler", async (incoming) => {
      if (incoming.headers["x-history-concurrency"] && barrier) {
        if (--barrier.remaining === 0) barrier.release();
        await barrier.ready;
      }
    });
    app.useGlobalGuards(
      new JwtAuthGuard(app.get(Reflector), app.get(JwtService)),
      new AccountDeletionPendingGuard(app.get(Reflector), app.get(IDENTITY_CHECK_PORT)),
    );
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
    config = app.get(ConfigService);
    request = supertest(app.getHttpServer());
  });
  afterAll(async () => { await app?.close(); });

  async function fixture(role: "buyer" | "seller" | "admin" | "dealer" = "buyer") {
    const user = await prisma.user.create({ data: {
      role: role === "dealer" ? "seller" : role,
      ...(role === "dealer" ? { dealershipMemberships: { create: {
        role: "owner" as const, dealership: { create: { name: "Synthetic History Dealer", slug: randomUUID() } },
      } } } : {}),
      email: `history-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(),
    } });
    const session = await prisma.session.create({ data: {
      userId: user.id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 120_000),
    } });
    config.set("APP_ENV", "test");
    config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", user.id);
    const token = app.get(JwtService).sign({ sub: user.id, sid: session.id, role });
    const get = (suffix = "") => request.get(path + suffix).auth(token, { type: "bearer" });
    const create = (body: object) => request.post(path).auth(token, { type: "bearer" }).send(body);
    return { user, session, token, get, create };
  }

  it("creates an outside-vehicle enquiry without VIN, Listing, staff grant or TOTP and reopens it", async () => {
    const actor = await fixture();
    expect((await actor.get().expect(200)).body).toEqual({ items: [], nextCursor: null });
    const created = await actor.create({ attemptKey: randomUUID() }).expect(201);
    expect(created.headers["cache-control"]).toBe("private, no-store");
    expect(created.body).toEqual({
      id: expect.any(String), createdAt: expect.any(String), sourceListingId: null,
      status: "enquiry", assignedOperator: null,
    });
    expect((await actor.get(`/${created.body.id}`).expect(200)).body).toEqual(created.body);
    expect((await actor.get().expect(200)).body).toEqual({ items: [created.body], nextCursor: null });
    expect((await actor.get().expect(200)).body.items).toHaveLength(1);
  });

  it("arbitrates simultaneous retries atomically and scopes the attempt key to its requester", async () => {
    const actor = await fixture();
    const attemptKey = randomUUID();
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    barrier = { remaining: 8, ready, release };
    const responses = await Promise.all(Array.from({ length: 8 }, () =>
      actor.create({ attemptKey }).set("x-history-concurrency", "retry").expect(201)));
    barrier = undefined;
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    expect((await actor.get().expect(200)).body.items).toEqual([responses[0]!.body]);
    const other = await fixture();
    const independent = await other.create({ attemptKey }).expect(201);
    expect(independent.body.id).not.toBe(responses[0]!.body.id);
    expect((await other.get().expect(200)).body.items).toEqual([independent.body]);
  });

  it("recovers the original enquiry after its response body is lost; New request is explicit", async () => {
    const actor = await fixture();
    const attemptKey = randomUUID();
    const origin = await app.getUrl();
    await new Promise<void>((resolve, reject) => {
      const outgoing = httpRequest(`${origin}${path}`, {
        method: "POST", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
      }, (response) => {
        const status = response.statusCode;
        response.destroy(); // Drop the bytes at the HTTP boundary, after the server committed.
        if (status === 201) resolve(); else reject(new Error("Creation was not committed"));
      });
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify({ attemptKey }));
    });
    const retry = await actor.create({ attemptKey }).expect(201);
    const again = await actor.create({ attemptKey: attemptKey.toUpperCase(), sourceListingId: null }).expect(201);
    expect(again.body).toEqual(retry.body);
    const fresh = await actor.create({ attemptKey: randomUUID() }).expect(201);
    expect(fresh.body.id).not.toBe(retry.body.id);
    expect((await actor.get().expect(200)).body.items.map((item: { id: string }) => item.id))
      .toEqual([fresh.body.id, retry.body.id]);
    await actor.get(`/${retry.body.id}`).expect(200);
    expect((await actor.get().expect(200)).body.items).toHaveLength(2);
  });

  it("keeps the first context on conflicting concurrent attempts and on later retries", async () => {
    const actor = await fixture();
    const attemptKey = randomUUID();
    const listing = randomUUID();
    const responses = await Promise.all([
      actor.create({ attemptKey }), actor.create({ attemptKey, sourceListingId: listing }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const original = responses.find((response) => response.status === 201)!.body;
    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.code).toBe("HISTORY_REQUEST_CONFLICT");
    expect(conflict.headers["cache-control"]).toBe("private, no-store");
    expect(conflict.body.sourceListingId).toBeUndefined();
    expect((await actor.get(`/${original.id}`).expect(200)).body).toEqual(original);
    expect((await actor.get().expect(200)).body.items).toEqual([original]);
    await actor.create({ attemptKey, sourceListingId: original.sourceListingId }).expect(201);
    await actor.create({ attemptKey, sourceListingId: randomUUID() }).expect(409);
  });

  it.each(["buyer", "seller", "dealer", "admin"] as const)("gives an unrelated %s no private access through known IDs or cursors", async (role) => {
    const owner = await fixture();
    const original = (await owner.create({ attemptKey: randomUUID(), sourceListingId: randomUUID() }).expect(201)).body;
    const other = await fixture(role);
    const denied = await other.get(`/${original.id}`).expect(403);
    const absent = await other.get(`/${randomUUID()}`).expect(403);
    expect(denied.body).toEqual(absent.body);
    expect(denied.body).toEqual({ statusCode: 403, code: "HISTORY_REQUEST_DENIED",
      message: "This request is unavailable. Sign in again or return to your History requests." });
    expect(denied.headers["cache-control"]).toBe("private, no-store");
    expect((await other.get().expect(200)).body).toEqual({ items: [], nextCursor: null });
    await other.get(`?cursor=${original.id}`).expect(403);
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", owner.user.id);
    expect((await owner.get(`/${original.id}`).expect(200)).body).toEqual(original);
  });

  const actions = ["create", "list", "detail"] as const;
  async function protectedAction(actor: Awaited<ReturnType<typeof fixture>>, action: typeof actions[number], id: string, token = actor.token) {
    const outgoing = action === "create" ? request.post(path).send({ attemptKey: randomUUID() })
      : request.get(action === "detail" ? `${path}/${id}` : path);
    return outgoing.auth(token, { type: "bearer" });
  }

  it.each(["revoked", "expired", "suspended", "deleting", "purged", "borrowed", "missing-session", "stale-role"])("rechecks every action against current identity/session: %s", async (state) => {
    const actor = await fixture();
    const original = (await actor.create({ attemptKey: randomUUID() }).expect(201)).body;
    let token = actor.token;
    if (state === "revoked") await prisma.session.delete({ where: { id: actor.session.id } });
    if (state === "expired") await prisma.session.update({ where: { id: actor.session.id }, data: { expiresAt: new Date(0) } });
    if (state === "suspended" || state === "stale-role") {
      await prisma.user.update({ where: { id: actor.user.id }, data: { suspendedAt: new Date(), role: "seller" } });
      if (state === "stale-role") token = app.get(JwtService).sign({ sub: actor.user.id, sid: actor.session.id, role: "admin" });
    }
    if (state === "deleting") await prisma.user.update({ where: { id: actor.user.id }, data: { deletionScheduledAt: new Date() } });
    if (state === "purged") await prisma.user.update({ where: { id: actor.user.id }, data: { email: null, emailVerifiedAt: null } });
    if (state === "borrowed") {
      const other = await fixture();
      config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", actor.user.id);
      token = app.get(JwtService).sign({ sub: actor.user.id, sid: other.session.id, role: "admin" });
    }
    if (state === "missing-session") token = app.get(JwtService).sign({ sub: actor.user.id, role: "admin" });
    for (const action of actions) {
      const response = await protectedAction(actor, action, original.id, token);
      expect(response.status).toBe(403);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body.code).toBe("HISTORY_REQUEST_DENIED");
      expect(response.body.items).toBeUndefined();
      expect(response.body.id).toBeUndefined();
    }
  });

  it.each(["disabled", "unset", "not-a-tester", "staging", "production"])("refuses every protected interface when synthetic admission is %s", async (state) => {
    const actor = await fixture();
    const original = (await actor.create({ attemptKey: randomUUID() }).expect(201)).body;
    if (state === "disabled" || state === "unset") config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", state === "disabled" ? false : undefined);
    else if (state === "not-a-tester") config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", "");
    else config.set("APP_ENV", state);
    for (const action of actions) expect((await protectedAction(actor, action, original.id)).status).toBe(403);
  });

  it.each([
    ["tk-TM", "Bu ýüz tutma elýeterli däl. Gaýtadan giriň ýa-da taryh ýüz tutmalaryňyza dolanyň."],
    ["ru-RU", "Запрос недоступен. Войдите снова или вернитесь к своим запросам истории."],
    ["en-US", "This request is unavailable. Sign in again or return to your History requests."],
  ])("returns bounded actionable %s refusals including signed-out responses", async (locale, message) => {
    const actor = await fixture();
    const denied = await actor.get(`/${randomUUID()}`).set("Accept-Language", locale).expect(403);
    expect(denied.body.message).toBe(message);
    const signedOut = await request.get(path).set("Accept-Language", locale).expect(401);
    expect(signedOut.body.message).toBe(message);
    expect(signedOut.headers["cache-control"]).toBe("private, no-store");
  });

  it("rejects malformed and expired bearer tokens on every interface without private data", async () => {
    const actor = await fixture();
    for (const token of ["invalid", app.get(JwtService).sign({ sub: actor.user.id, sid: actor.session.id }, { expiresIn: -1 })]) {
      for (const action of actions) expect((await protectedAction(actor, action, randomUUID(), token)).status).toBe(401);
    }
  });

  it("rejects invalid or extra input instead of inventing VIN, assignment or purchase behavior", async () => {
    const actor = await fixture();
    for (const body of [{}, { attemptKey: "bad" }, { attemptKey: randomUUID(), sourceListingId: "bad" },
      { attemptKey: randomUUID(), vin: "1HGBH41JXMN109186" }, { attemptKey: randomUUID(), assignedOperator: actor.user.id }]) {
      const refused = await actor.create(body).expect(400);
      expect(refused.body.code).toBe("HISTORY_REQUEST_INVALID");
    }
    await actor.get("?cursor=bad").expect(400);
    expect((await actor.get().expect(200)).body).toEqual({ items: [], nextCursor: null });
  });


  it.each(["seller", "dealer"] as const)("retains immutable Listing context without giving its %s access, even after edits/deletion", async (role) => {
    const seller = await fixture(role);
    const key = randomUUID();
    const brand = await prisma.brand.create({ data: { slug: key, nameRu: "Synthetic History Brand", nameTk: "Synthetic History Brand", nameEn: "Synthetic History Brand" } });
    const model = await prisma.model.create({ data: { brandId: brand.id, slug: key, nameRu: "Synthetic Model", nameTk: "Synthetic Model", nameEn: "Synthetic Model" } });
    const region = await prisma.region.create({ data: { slug: key, nameRu: "Synthetic Region", nameTk: "Synthetic Region", nameEn: "Synthetic Region" } });
    const city = await prisma.city.create({ data: { regionId: region.id, slug: key, nameRu: "Synthetic City", nameTk: "Synthetic City", nameEn: "Synthetic City" } });
    const listing = await prisma.listing.create({ data: {
      sellerId: seller.user.id, brandId: brand.id, modelId: model.id, cityId: city.id, priceAmount: 100,
    } });
    const owner = await fixture();
    const attemptKey = randomUUID();
    const original = (await owner.create({ attemptKey, sourceListingId: listing.id }).expect(201)).body;
    expect(original.sourceListingId).toBe(listing.id);
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", `${owner.user.id},${seller.user.id}`);
    await seller.get(`/${original.id}`).expect(403);
    expect((await seller.get().expect(200)).body.items).toEqual([]);
    await prisma.listing.update({ where: { id: listing.id }, data: { year: 2020, vin: "1HGBH41JXMN109186" } });
    expect((await owner.get(`/${original.id}`).expect(200)).body).toEqual(original);
    await prisma.listing.delete({ where: { id: listing.id } });
    expect((await owner.create({ attemptKey, sourceListingId: listing.id.toUpperCase() }).expect(201)).body).toEqual(original);
    expect((await owner.get(`/${original.id}`).expect(200)).body).toEqual(original);
  });

  it("allows a new current session of the same owner to reopen/retry but never revives the revoked session", async () => {
    const actor = await fixture();
    const attemptKey = randomUUID();
    const original = (await actor.create({ attemptKey }).expect(201)).body;
    await prisma.session.delete({ where: { id: actor.session.id } });
    const session = await prisma.session.create({ data: {
      userId: actor.user.id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 120_000),
    } });
    const token = app.get(JwtService).sign({ sub: actor.user.id, sid: session.id, role: "buyer" });
    const reopened = await request.get(`${path}/${original.id}`).auth(token, { type: "bearer" }).expect(200);
    expect(reopened.body).toEqual(original);
    expect((await request.post(path).auth(token, { type: "bearer" }).send({ attemptKey }).expect(201)).body).toEqual(original);
    await actor.get(`/${original.id}`).expect(403);
  });

  it("pages all owned enquiries in stable newest-first order without duplicate or missing requests", async () => {
    const actor = await fixture();
    const created: string[] = [];
    for (let index = 0; index < 51; index++) {
      created.push((await actor.create({ attemptKey: randomUUID() }).expect(201)).body.id);
    }
    const first = (await actor.get().expect(200)).body;
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(created.slice(1).reverse());
    expect(first.nextCursor).toBe(created[1]);
    const last = (await actor.get(`?cursor=${first.nextCursor}`).expect(200)).body;
    expect(last.items.map((item: { id: string }) => item.id)).toEqual([created[0]]);
    expect(last.nextCursor).toBeNull();
    expect((await actor.get(`/${created[0]}`).expect(200)).body.id).toBe(created[0]);
  });

});
