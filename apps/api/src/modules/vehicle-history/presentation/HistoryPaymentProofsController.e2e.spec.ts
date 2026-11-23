import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";

const root = "/api/v1/vehicle-history";
const bucket = "vehicle-history-private";
const quoteWindow = { deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" };

describe("private payment proof over HTTP, Postgres and MinIO", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  let now: Date;
  let image: Buffer;
  beforeEach(async () => {
    f = await historyFixture();
    now = new Date("2026-11-21T05:00:00.000Z");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => now;
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-VH08-NO-TRANSFER");
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 10);
    image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer();
  });
  afterEach(async () => { await f?.close(); });
  async function accepted() {
    const customer = await f.actor(null), operator = await f.actor();
    const id = (await f.request.post(`${root}/requests`).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    await f.request.post(`${root}/operator/requests/${id}/claim`).auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(`${root}/operator/requests/${id}/offer`).auth(operator.token, { type: "bearer" })
      .send({ kind: "check", vin: "DEMA0000000000001", expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const offer = (await f.request.post(`${root}/operator/requests/${id}/offer`).auth(operator.token, { type: "bearer" })
      .send({ kind: "propose", format: "pdf", expectedVersion: 1, expectedAssignmentVersion: 1, ...quoteWindow }).expect(201)).body;
    const order = (await f.request.post(`${root}/requests/${id}/order`).auth(customer.token, { type: "bearer" }).send({ offer }).expect(201)).body;
    const path = `${root}/requests/${id}/payment-proofs`;
    const input = { orderId: order.order.id, attemptKey: randomUUID(), contentType: "image/png", sizeBytes: image.length };
    const stage = (body: object = input) => f.request.post(path).auth(customer.token, { type: "bearer" }).send(body);
    const upload = (fileId: string, bytes = image, contentType = "image/png") => f.request.put(`${path}/${fileId}/content`)
      .auth(customer.token, { type: "bearer" }).set("Content-Type", contentType).send(bytes);
    const submit = (fileId: string) => f.request.post(`${path}/${fileId}/submit`).auth(customer.token, { type: "bearer" }).send({ orderId: order.order.id });
    return { id, customer, operator, order, path, input, stage, upload, submit };
  }
  it("stages, validates private bytes and retries one atomic submission without confirming payment or renewing the hold", async () => {
    const e = await accepted();
    const staged = (await e.stage().expect(201)).body;
    expect(staged).toMatchObject({ status: "pending", orderId: e.order.order.id, purpose: "payment_evidence" });
    expect((await e.stage().expect(201)).body).toEqual(staged);
    await e.submit(staged.id).expect(409);
    await e.upload(staged.id, Buffer.from("not an image")).expect(400);
    await e.upload(staged.id).expect(200);
    now = new Date("2026-11-21T07:00:00.000Z");
    f.concurrent(2);
    const submitted = await Promise.all([e.submit(staged.id).set("x-history-concurrency", "yes"), e.submit(staged.id).set("x-history-concurrency", "yes")]);
    expect(submitted.map((r) => r.status)).toEqual([201, 201]);
    expect(submitted[0]?.body).toEqual(submitted[1]?.body);
    expect(submitted[0]?.body).toMatchObject({ status: "submitted", submittedAt: "2026-11-21T07:00:00.000Z" });
    const read = await f.request.get(`${e.path}/${staged.id}/content`).auth(e.customer.token, { type: "bearer" }).expect(200);
    expect(read.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.from(read.body.dataBase64, "base64")).toEqual(image);
    const state = (await f.request.get(`${root}/requests/${e.id}/order`).auth(e.customer.token, { type: "bearer" }).expect(200)).body;
    expect(state).toEqual({ ...e.order, status: "hold_expired", wallet: null, serverNow: now.toISOString(),
      payment: { outcome: "receipt_submitted", amountMinor: 0, receivedAt: null, confirmedAt: null, bookingCommitted: false } });
    const anonymous = await fetch(`${process.env["MINIO_ENDPOINT"]}/${bucket}/payment-evidence/${e.id}/${staged.id}`);
    expect(anonymous.status).toBe(403);
    await f.request.get(`${e.path}/${staged.id}/content`).expect(401);
    const list = (await f.request.get(e.path).auth(e.customer.token, { type: "bearer" }).expect(200)).body;
    expect(list.items).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/bucket|key|https?:/);
  });
  it("refuses wrong order, owner, type, size and changed idempotency facts", async () => {
    const e = await accepted();
    for (const change of [{ orderId: randomUUID() }, { contentType: "application/pdf" }, { sizeBytes: 8 * 1024 * 1024 + 1 }, { sizeBytes: 0 }]) {
      await e.stage({ ...e.input, ...change }).expect(change.orderId ? 409 : 400);
    }
    const staged = (await e.stage().expect(201)).body;
    await e.stage({ ...e.input, sizeBytes: image.length + 1 }).expect(409);
    const other = await f.actor(null, "admin");
    await f.request.get(e.path).auth(other.token, { type: "bearer" }).expect(403);
    await f.request.put(`${e.path}/${staged.id}/content`).auth(other.token, { type: "bearer" }).set("Content-Type", "image/png").send(image).expect(403);
    await e.upload(staged.id, image, "image/jpeg").expect(400);
    await e.upload(staged.id).expect(200);
    const changed = Buffer.from(image);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    await e.upload(staged.id, changed).expect(409);
    await f.request.post(`${e.path}/${staged.id}/submit`).auth(e.customer.token, { type: "bearer" }).send({ orderId: randomUUID() }).expect(409);
  });
  it("rechecks active assignment and separately audits a reasoned exact-object historical read", async () => {
    const e = await accepted();
    const file = (await e.stage().expect(201)).body;
    await e.upload(file.id).expect(200); await e.submit(file.id).expect(201);
    const operatorPath = `${root}/operator/requests/${e.id}/payment-proofs`;
    const staffRead = () => f.request.get(`${operatorPath}/${file.id}/content?expectedAssignmentVersion=1`).auth(e.operator.token, { type: "bearer" });
    expect((await staffRead().expect(200)).body.file.id).toBe(file.id);
    const next = await f.actor();
    await f.request.post(`${root}/operator/requests/${e.id}/handover`).auth(e.operator.token, { type: "bearer" })
      .send({ expectedAssignmentVersion: 1, targetOperatorId: next.user.id }).expect(201);
    await staffRead().expect(403);
    const reader = await f.actor("vehicle_history_payment_evidence");
    const historical = (body: object, token = reader.token) => f.request.post(`${root}/payment-evidence/read`).auth(token, { type: "bearer" }).send(body);
    const input = { requestId: e.id, fileId: file.id, purpose: "payment_evidence", reason: "Synthetic disputed transfer review" };
    await historical({ ...input, reason: "" }).expect(400);
    await historical({ ...input, fileId: randomUUID() }).expect(403);
    await historical(input, next.token).expect(403);
    expect((await historical(input).expect(201)).body.file.id).toBe(file.id);
    const audit = await f.prisma.auditLog.findFirst({ where: { actorId: reader.user.id, action: "history.payment_evidence.read", targetId: file.id } });
    expect(audit?.details).toMatchObject({ requestId: e.id, reason: input.reason, purpose: "payment_evidence" });
    await f.prisma.staffGrant.updateMany({ where: { userId: reader.user.id }, data: { revokedAt: new Date() } });
    await historical(input).expect(403);
    await f.prisma.session.delete({ where: { id: e.customer.session.id } });
    await f.request.get(`${e.path}/${file.id}/content`).auth(e.customer.token, { type: "bearer" }).expect(403);
  });
  it("cleans abandoned and expired exact objects, preserves submitted evidence and refuses resurrection", async () => {
    const e = await accepted();
    const abandoned = (await e.stage().expect(201)).body;
    await e.upload(abandoned.id).expect(200);
    await f.request.delete(`${e.path}/${abandoned.id}`).auth(e.customer.token, { type: "bearer" }).expect(200);
    await e.upload(abandoned.id).expect(409);
    await e.submit(abandoned.id).expect(409);
    const expired = (await e.stage({ ...e.input, attemptKey: randomUUID() }).expect(201)).body;
    await e.upload(expired.id).expect(200);
    const kept = (await e.stage({ ...e.input, attemptKey: randomUUID() }).expect(201)).body;
    await e.upload(kept.id).expect(200); await e.submit(kept.id).expect(201);
    now = new Date("2026-11-22T05:00:01.000Z");
    const { CleanupHistoryPrivateFiles } = await import("../application/CleanupHistoryPrivateFiles");
    await f.app.get(CleanupHistoryPrivateFiles).execute();
    await e.submit(expired.id).expect(409);
    const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "" } });
    try {
      for (const file of [abandoned, expired]) await expect(s3.send(new GetObjectCommand({ Bucket: bucket, Key: `payment-evidence/${e.id}/${file.id}` }))).rejects.toMatchObject({ name: "NoSuchKey" });
      expect((await f.request.get(`${e.path}/${kept.id}/content`).auth(e.customer.token, { type: "bearer" }).expect(200)).body.file.status).toBe("submitted");
    } finally { s3.destroy(); }
  });
  it("recovers an object written before a failed database commit without replacing its bytes", async () => {
    const e = await accepted();
    const file = (await e.stage().expect(201)).body;
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION refuse_history_file_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic commit interruption'; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER synthetic_history_file_failure BEFORE UPDATE ON history_private_files FOR EACH ROW EXECUTE FUNCTION refuse_history_file_commit()`);
    try { await e.upload(file.id).expect(503); }
    finally {
      await f.prisma.$executeRawUnsafe(`DROP TRIGGER synthetic_history_file_failure ON history_private_files`);
      await f.prisma.$executeRawUnsafe(`DROP FUNCTION refuse_history_file_commit()`);
    }
    expect((await f.request.get(e.path).auth(e.customer.token, { type: "bearer" }).expect(200)).body.items[0].status).toBe("pending");
    await e.upload(file.id).expect(200);
    await e.upload(file.id).expect(200);
    await e.submit(file.id).expect(201);
    expect(Buffer.from((await f.request.get(`${e.path}/${file.id}/content`).auth(e.customer.token, { type: "bearer" }).expect(200)).body.dataBase64, "base64")).toEqual(image);
  });
  it("refuses expired TOTP, future grants, owner lifecycle and disabled/live environments", async () => {
    const e = await accepted();
    const file = (await e.stage().expect(201)).body;
    await e.upload(file.id).expect(200); await e.submit(file.id).expect(201);
    const reader = await f.actor("vehicle_history_payment_evidence");
    const read = () => f.request.post(`${root}/payment-evidence/read`).auth(reader.token, { type: "bearer" })
      .send({ requestId: e.id, fileId: file.id, purpose: "payment_evidence", reason: "Synthetic exact receipt review" });
    await f.prisma.session.update({ where: { id: reader.session.id }, data: { adminTotpExpiresAt: new Date(0) } });
    await read().expect(403);
    await f.prisma.session.update({ where: { id: reader.session.id }, data: { adminTotpExpiresAt: new Date(Date.now() + 600000) } });
    await f.prisma.staffGrant.updateMany({ where: { userId: reader.user.id }, data: { grantedAt: new Date(Date.now() + 86400000) } });
    await read().expect(403);
    await f.prisma.staffGrant.updateMany({ where: { userId: reader.user.id }, data: { grantedAt: new Date(0) } });
    await read().expect(201);
    await f.prisma.user.update({ where: { id: e.customer.user.id }, data: { deletionScheduledAt: new Date() } });
    await read().expect(403);
    await f.prisma.user.update({ where: { id: e.customer.user.id }, data: { deletionScheduledAt: null } });
    for (const environment of ["staging", "production"]) {
      f.config.set("APP_ENV", environment);
      await read().expect(403);
      await e.stage().expect(403);
    }
  });
  it("refuses malformed and oversized HTTP bodies with private actionable errors", async () => {
    const e = await accepted();
    const file = (await e.stage().expect(201)).body;
    const port = (f.app.getHttpServer().address() as { port: number }).port;
    const response = await new Promise<{ status: number; cache: string | undefined; code: string }>((resolve, reject) => {
      const incoming = httpRequest(`http://127.0.0.1:${port}${e.path}/${file.id}/content`, {
        method: "PUT", headers: { Authorization: `Bearer ${e.customer.token}`, "Content-Type": "image/png", "Content-Length": 8 * 1024 * 1024 + 1 },
      }, (result) => {
        let text = "";
        result.on("data", (chunk) => { text += String(chunk); });
        result.on("end", () => resolve({ status: result.statusCode ?? 0, cache: result.headers["cache-control"], code: JSON.parse(text).code as string }));
      });
      incoming.on("error", reject); incoming.end();
    });
    expect(response).toEqual({ status: 400, cache: "private, no-store", code: "HISTORY_PROOF_INVALID" });
    const malformed = await f.request.post(e.path).auth(e.customer.token, { type: "bearer" }).set("Content-Type", "application/json").send("{").expect(400);
    expect(malformed.headers["cache-control"]).toBe("private, no-store");
    await e.upload(file.id).expect(200);
  });

});
