import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PDFDocument, PDFRawStream, PDFStream, rgb } from "pdf-lib";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { historyFixture } from "../../../../test/helpers/historyFixture";
import { HISTORY_CLOCK, type HistoryClock } from "../vehicle-history.public";
import { HistoryRecoveryWorker } from "../application/HistoryRecoveryWorker";

const root = "/api/v1/vehicle-history";
const now = "2026-11-21T05:00:00.000Z";
const facts = { reportId: "fixture-14", provider: "Carfax", vin: "DEMA0000000000001",
  originalReportDate: "2026-10-14", language: "ru", permittedUse: true };

async function document(overrides: Partial<typeof facts> = {}, options: {
  invisiblePage?: number;
  chart?: "readable" | "damaged" | "inline" | "inline-missing-width" | "inline-short" | "mask" | "mask-short" | "flate" | "flate-short";
} = {}) {
  const pdf = await PDFDocument.create();
  const report = { ...facts, ...overrides };
  pdf.setSubject("Carberk synthetic Vehicle History\n" + JSON.stringify(report));
  for (let page = 1; page < 3; page++) {
    pdf.addPage().drawText(`Synthetic report ${report.reportId} - ${report.vin} - ${page}`, {
      color: options.invisiblePage === page ? rgb(1, 1, 1) : rgb(0, 0, 0),
    });
  }
  const flate = options.chart === "flate" || options.chart === "flate-short";
  if (flate || options.chart === "inline" || options.chart === "inline-missing-width" || options.chart === "inline-short") {
    const raster = Buffer.alloc(48 * 32, 240);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 48; x++) {
        if (x % 12 < 8 && y >= 29 - Math.floor(x / 12) * 6) raster[y * 48 + x] = 20;
      }
    }
    const pixels = flate ? deflateSync(raster, { level: 0 }) : raster;
    const length = options.chart === "flate-short" ? 7 + 48 * 8 : options.chart === "inline-short" ? 48 * 8 : pixels.length;
    const width = options.chart === "inline-missing-width" ? "" : "/W 48 ";
    const filter = flate ? "[/AHx /Fl]" : "/AHx";
    const content = ["q", "220 0 0 180 45 220 cm", "BI", `${width}/H 32 /BPC 8 /CS /G /F ${filter}`,
      "ID", pixels.subarray(0, length).toString("hex") + ">", "EI", "Q"].join("\n");
    pdf.getPage(1).node.addContentStream(pdf.context.register(pdf.context.flateStream(content)));
  } else if (options.chart === "mask" || options.chart === "mask-short") {
    const raster = Buffer.alloc((48 / 8) * (options.chart === "mask" ? 32 : 8), 0b01010101);
    const content = ["q", "220 0 0 180 45 220 cm", "BI", "/W 48 /H 32 /IM true /BPC 1 /F /AHx",
      "ID", raster.toString("hex") + ">", "EI", "Q"].join("\n");
    pdf.getPage(1).node.addContentStream(pdf.context.register(pdf.context.flateStream(content)));
  } else if (options.chart) {
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#065f46" } }).jpeg().toBuffer();
    const chart = await pdf.embedJpg(jpeg);
    pdf.getPage(1).drawImage(chart, { x: 40, y: 180, width: 220, height: 180 });
    if (options.chart === "damaged") {
      await chart.embed();
      const stream = pdf.context.lookup(chart.ref, PDFStream);
      pdf.context.assign(chart.ref, PDFRawStream.of(stream.dict, stream.getContents().subarray(0, 20)));
    }
  }
  const bytes = Buffer.from(await pdf.save());
  return { bytes, pdf: { filename: "Original synthetic report.pdf", dataBase64: bytes.toString("base64") } };
}

describe("assigned original report validation over HTTP, Postgres, private MinIO and TLS", () => {
  let f: Awaited<ReturnType<typeof historyFixture>>;
  let server: ReturnType<typeof createServer>;
  let origin: string;
  let received: string[];
  let linkAvailable: boolean;
  let linkRequirement: "login" | "payment" | "operator" | undefined;
  let beforeServingReport: (() => Promise<void>) | undefined;
  let certificate: Buffer;
  beforeAll(async () => {
    const directory = mkdtempSync(join(tmpdir(), "carberk-report-test-"));
    try {
      const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
        "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
      certificate = readFileSync(cert);
      const report = await document();
      const chart = await document({}, { chart: "readable" });
      const damagedChart = await document({}, { chart: "damaged" });
      const inline = await document({}, { chart: "inline" });
      const missingWidth = await document({}, { chart: "inline-missing-width" });
      const shortInline = await document({}, { chart: "inline-short" });
      const mask = await document({}, { chart: "mask" });
      const shortMask = await document({}, { chart: "mask-short" });
      const reports = new Map([
        ["damaged", damagedChart], ["readable", chart], ["inline", inline],
        ["inline-missing-width", missingWidth], ["inline-short", shortInline], ["mask", mask], ["mask-short", shortMask],
        ["flate", await document({}, { chart: "flate" })], ["flate-short", await document({}, { chart: "flate-short" })],
      ]);
      server = createServer({ key: readFileSync(key), cert: certificate }, async (req, res) => {
        received.push(req.url ?? "");
        const scenario = linkRequirement ?? new URL(req.url ?? "/", "https://127.0.0.1").searchParams.get("scenario");
        if (req.headers.authorization || req.headers.cookie) { res.writeHead(500).end(); return; }
        if (scenario === "login") { res.writeHead(302, { location: "/login" }).end(); return; }
        if (scenario === "payment") { res.writeHead(402).end(); return; }
        if (scenario === "operator") { res.writeHead(401, { "WWW-Authenticate": "Basic" }).end(); return; }
        if (scenario === "missing" || !linkAvailable) { res.writeHead(404).end(); return; }
        if (scenario === "html") { res.writeHead(200, { "Content-Type": "text/html" }).end("Sign in to view this report"); return; }
        await beforeServingReport?.();
        const selected = reports.get(scenario ?? "") ?? report;
        res.writeHead(200, { "Content-Type": "application/pdf" }).end(selected.bytes);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  afterAll(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(async () => {
    received = [];
    linkAvailable = true;
    linkRequirement = undefined;
    beforeServingReport = undefined;
    f = await historyFixture((config) => {
      config.set("VEHICLE_HISTORY_SYNTHETIC_WALLET", "SYNTHETIC-VH14-NO-TRANSFER");
      config.set("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", 10);
      config.set("VEHICLE_HISTORY_SYNTHETIC_REPORT_ORIGIN", origin);
      config.set("VEHICLE_HISTORY_SYNTHETIC_REPORT_CA", certificate.toString("base64"));
    });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date(now);
  });
  afterEach(async () => {
    const rows = await f.prisma.historyReportArtifact.findMany();
    const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "" } });
    try {
      for (const row of rows) {
        if (row.sha256) await s3.send(new DeleteObjectCommand({
          Bucket: "vehicle-history-private", Key: `report-artifacts/${row.requestId}/${row.id}`,
        }));
      }
      await f.prisma.historyReportArtifact.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    } finally { s3.destroy(); await f.close(); }
  });

  async function obtained(format: "pdf" | "link" | "both", vin = facts.vin, options: {
    lateReceipt?: boolean; operator?: Awaited<ReturnType<typeof f.actor>>; laterWindow?: boolean; closeOfDay?: boolean;
    outcome?: object; source?: "archive" | "new_source"; archiveId?: string;
  } = {}) {
    const { lateReceipt, laterWindow } = options;
    const operator = options.operator ?? await f.actor(), customer = await f.actor(null);
    const customerHttp = (path: string) => f.request.post(path).auth(customer.token, { type: "bearer" });
    const id = (await customerHttp(`${root}/requests`).send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const work = `${root}/operator/requests/${id}`;
    const operatorHttp = (path: string) => f.request.post(work + path).auth(operator.token, { type: "bearer" });
    const expectedAssignmentVersion = 1;
    await operatorHttp("/claim").send({ expectedAssignmentVersion: 0 }).expect(201);
    const check = { kind: "check", vin, expectedAssignmentVersion };
    const available = (await operatorHttp("/offer").send({ ...check, expectedVersion: 0 }).expect(201)).body;
    const checked = options.archiveId ? (await operatorHttp("/offer").send({
      ...check, expectedVersion: 1, archiveId: options.archiveId,
    }).expect(201)).body : available;
    const offer = (await operatorHttp("/offer").send({ kind: "propose", format, expectedVersion: checked.version, expectedAssignmentVersion,
      deliveryFrom: options.closeOfDay ? "2026-11-21T13:30:00.000Z" : laterWindow ? "2026-11-21T07:00:00.000Z" : "2026-11-21T06:00:00.000Z",
      deliveryBy: options.closeOfDay ? "2026-11-21T14:30:00.000Z" : laterWindow ? "2026-11-21T08:00:00.000Z" : "2026-11-21T07:00:00.000Z" }).expect(201)).body;
    const orderId = (await customerHttp(`${root}/requests/${id}/order`).send({ offer }).expect(201)).body.order.id as string;
    if (lateReceipt) f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T07:05:00.000Z");
    await operatorHttp("/payment-verification").send({ orderId, expectedAssignmentVersion, attemptKey: randomUUID(),
      expectedPaymentVersion: 0, walletChecked: true, outcome: "matched", amountMinor: 10000,
      reference: laterWindow ? "SYNTHETIC-VH15-SECOND" : "SYNTHETIC-VH14-REFERENCE",
      evidence: "Synthetic independent ledger", evidenceFileId: null,
      receivedAt: laterWindow ? "2026-11-21T05:01:00.000Z" : now }).expect(201);
    if (lateReceipt) {
      await operatorHttp("/replacement-booking").send({ kind: "propose", orderId, expectedAssignmentVersion, expectedVersion: 0,
        attemptKey: randomUUID(), deliveryFrom: "2026-11-21T08:00:00.000Z", deliveryBy: "2026-11-21T09:00:00.000Z" }).expect(201);
      await customerHttp(`${root}/requests/${id}/replacement-booking`).send({
        kind: "accept", orderId, expectedVersion: 1, attemptKey: randomUUID(),
      }).expect(201);
    }
    const intentId = randomUUID(), acceptedRevision = 0;
    const provider = checked.preflight.providers[0].name;
    await operatorHttp("/fulfilment").send({ kind: "start", orderId, expectedAssignmentVersion, expectedVersion: 0, attemptKey: intentId,
      acceptedRevision, vin, format, provider, source: options.source ?? "new_source" }).expect(201);
    const record = (outcome: object, expectedVersion = 1) => operatorHttp("/fulfilment").send({ kind: "record", orderId,
      expectedAssignmentVersion, expectedVersion, attemptKey: randomUUID(), outcome });
    const target = { orderId, expectedAssignmentVersion, intentId, intentVersion: 2, acceptedRevision };
    const path = work + "/report-artifacts";
    const validate = (input: object, token = operator.token) => f.request.post(path).auth(token, { type: "bearer" }).send({ ...target, ...input });
    const read = (suffix = "", token = operator.token, query: object = target) => f.request.get(path + suffix).auth(token, { type: "bearer" }).query(query);
    const deliver = (artifactId: string, token = operator.token, intentVersion = target.intentVersion) => f.request.post(path + "/deliver")
      .auth(token, { type: "bearer" }).send({ ...target, artifactId, intentVersion });
    const originalReportDate = checked.preflight.providers[0].originalReportDate ?? facts.originalReportDate;
    await record(options.outcome ?? { kind: "obtained", format, originalReportDate, permittedUse: true }).expect(201);
    return { id, work, customer, operator, target, path, record, validate, read, deliver, offer };
  }

  it("shows only permitted exact-VIN archive metadata for a currently assigned request", async () => {
    const original = await obtained("pdf");
    const saved = (await original.validate({ pdf: (await document()).pdf }).expect(201)).body;
    await original.deliver(saved.artifact.id).expect(201);
    const operator = await f.actor(), customer = await f.actor(null);
    const { body: { id } } = await f.request.post(`${root}/requests`).auth(customer.token, { type: "bearer" })
      .send({ attemptKey: randomUUID() }).expect(201);
    const work = `${root}/operator/requests/${id}`;
    await f.request.post(work + "/claim").auth(operator.token, { type: "bearer" }).send({ expectedAssignmentVersion: 0 }).expect(201);
    await f.request.post(work + "/offer").auth(operator.token, { type: "bearer" })
      .send({ kind: "check", vin: facts.vin, expectedVersion: 0, expectedAssignmentVersion: 1 }).expect(201);
    const search = (token: string, query: object = {}) => f.request.get(`${work}/report-archive`)
      .auth(token, { type: "bearer" }).query({ vin: "dema 0000000000001", expectedAssignmentVersion: 1, ...query });
    await search(operator.token).expect(200).expect(({ headers, body }) => {
      expect(headers["cache-control"]).toBe("private, no-store");
      expect(body).toEqual({ items: [{ id: saved.artifact.id, vin: facts.vin, provider: "Carfax", format: "pdf",
        originalReportDate: "2026-10-14", language: "ru" }] });
    });
    await search(original.operator.token).expect(403);
    await search(operator.token, { expectedAssignmentVersion: 0 }).expect(409);
    await search(operator.token, { vin: "DEMA0000000000006" }).expect(200, { items: [] });
  });

  it.each(["pdf", "link", "both"] as const)("associates an original with a later accepted %s promise", async (format) => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", {
      Carfax: { allowance: 12, resetUtc: "00:00", externalUsage: {} },
      AutoCheck: { allowance: 8, resetUtc: "00:00", externalUsage: {} },
    });
    const original = await obtained("both");
    const { pdf, bytes } = await document();
    const link = origin + "/report/" + facts.reportId + "?share=Synthetic%2fFixture";
    const filename = "Previous Buyer Synthetic - private upload.pdf";
    const first = (await original.validate({ pdf: { ...pdf, filename }, link }).expect(201)).body.artifact.id;
    await original.deliver(first).expect(201);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    const later = await obtained(format, facts.vin, { laterWindow: true, source: "archive" });
    f.concurrent(2);
    const [firstUse, secondUse] = await Promise.all([
      later.validate({ archiveId: first }).set("x-history-concurrency", "1").expect(201),
      later.validate({ archiveId: first }).set("x-history-concurrency", "1").expect(201),
    ]);
    expect(secondUse.body).toEqual(firstUse.body);
    expect(firstUse.body).toMatchObject({ status: "validated", artifact: { format, source: "archive", report: facts } });
    expect(firstUse.body.artifact.id).not.toBe(first);
    await later.deliver(firstUse.body.artifact.id).expect(201);
    const get = (id: string, token: string, asset: string, artifactId = firstUse.body.artifact.id) => f.request
      .get(`${root}/requests/${id}/report/${artifactId}/${asset}`).auth(token, { type: "bearer" });
    await get(original.id, later.customer.token, "pdf", first).expect(403);
    await get(later.id, original.customer.token, "pdf").expect(403);
    if (format !== "link") {
      const purchaser = (id: string, token: string) => f.request.get(`${root}/requests/${id}/report`).auth(token, { type: "bearer" });
      expect(firstUse.body.artifact.pdf.filename).toBe("vehicle-history.pdf");
      await later.read().expect(200).expect(({ body }) => expect(body.artifact.pdf.filename).toBe("vehicle-history.pdf"));
      await purchaser(later.id, later.customer.token).expect(200)
        .expect(({ body }) => expect(body.artifact.pdf.filename).toBe("vehicle-history.pdf"));
      await purchaser(original.id, original.customer.token).expect(200)
        .expect(({ body }) => expect(body.artifact.pdf.filename).toBe(filename));
      expect(Buffer.from((await get(later.id, later.customer.token, "pdf").expect(200)).body.dataBase64, "base64")).toEqual(bytes);
    }
    if (format !== "pdf") await get(later.id, later.customer.token, "link").expect(200, { address: link });
  });

  it("discloses the selected original date before payment when new lookup had no report date", async () => {
    const vin = "DEMA0000000000006";
    const original = await obtained("pdf", vin);
    const saved = (await original.validate({ pdf: (await document({ vin, provider: "AutoCheck" })).pdf }).expect(201)).body;
    await original.deliver(saved.artifact.id).expect(201);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    const later = await obtained("pdf", vin, { laterWindow: true, source: "archive", archiveId: saved.artifact.id });
    expect(later.offer.preflight).toEqual({ status: "available", archiveFormat: "pdf",
      providers: [{ name: "AutoCheck", originalReportDate: "2026-10-14" }] });
    expect(JSON.stringify(later.offer)).not.toContain(saved.artifact.id);
    await later.validate({ archiveId: saved.artifact.id }).expect(201);
  });

  it.each(["login", "payment", "operator"] as const)("refuses an archived link that now requires %s", async (requirement) => {
    const original = await obtained("link");
    const { body: { artifact } } = await original.validate({ link: origin + "/report/" + facts.reportId }).expect(201);
    await original.deliver(artifact.id).expect(201);
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    clock.now = () => new Date("2026-11-21T05:01:00.000Z");
    const later = await obtained("link", facts.vin, { laterWindow: true, source: "archive", archiveId: artifact.id });
    const path = `${root}/requests/${later.id}`;
    linkRequirement = requirement;
    await later.validate({ archiveId: artifact.id }).expect(422)
      .expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_LINK"));
    await f.request.get(path + "/report").auth(later.customer.token, { type: "bearer" }).expect(200, { status: "empty" });
    clock.now = () => new Date("2026-11-21T08:00:00.000Z");
    await f.app.get(HistoryRecoveryWorker).execute();
    await f.request.get(path + "/order").auth(later.customer.token, { type: "bearer" }).expect(200)
      .expect(({ body }) => expect(body.recovery).toMatchObject({
        status: "offered", originalFormat: "link", originalPromiseBy: "2026-11-21T08:00:00.000Z", failure: "file_delivery",
      }));
  });

  it("rechecks archive rights and assignment before associating a previously found artifact", async () => {
    const original = await obtained("pdf");
    const { body: { artifact } } = await original.validate({ pdf: (await document()).pdf }).expect(201);
    await original.deliver(artifact.id).expect(201);
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    const later = await obtained("pdf", facts.vin, { laterWindow: true, source: "archive", archiveId: artifact.id });
    const lookup = () => f.request.get(later.work + "/report-archive").auth(later.operator.token, { type: "bearer" })
      .query({ vin: facts.vin, expectedAssignmentVersion: 1 });
    await lookup().expect(200).expect(({ body }) => expect(body.items[0].id).toBe(artifact.id));
    await later.validate({ archiveId: artifact.id, expectedAssignmentVersion: 0 }).expect(409);
    await later.validate({ archiveId: artifact.id }, original.operator.token).expect(403);
    await f.prisma.historyReportArtifact.update({ where: { id: artifact.id },
      data: { artifact: { ...artifact, report: { ...artifact.report, permittedUse: false } } } });
    await lookup().expect(200, { items: [] });
    await later.validate({ archiveId: artifact.id }).expect(422)
      .expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_RIGHTS"));
    await later.read().expect(200, { status: "empty" });
  });

  it("requires a new agreement to use the PDF alone when an archived pair loses its link", async () => {
    const original = await obtained("both");
    const { pdf, bytes } = await document();
    const { body: { artifact } } = await original.validate({ pdf, link: origin + "/report/" + facts.reportId }).expect(201);
    await original.deliver(artifact.id).expect(201);
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    clock.now = () => new Date("2026-11-21T05:01:00.000Z");
    const later = await obtained("both", facts.vin, { laterWindow: true, source: "archive", archiveId: artifact.id });
    linkAvailable = false;
    await later.validate({ archiveId: artifact.id }).expect(422);
    const path = `${root}/requests/${later.id}`;
    const { orderId } = later.target;
    const customer = (route: string) => f.request.get(path + route).auth(later.customer.token, { type: "bearer" });
    await customer("/report").expect(200, { status: "empty" });
    clock.now = () => new Date("2026-11-21T08:00:00.000Z");
    await f.app.get(HistoryRecoveryWorker).execute();
    const { body: { recovery } } = await customer("/order").expect(200);
    const proposed = (await f.request.post(later.work + "/recovery").auth(later.operator.token, { type: "bearer" }).send({
      kind: "propose_format", orderId, expectedVersion: recovery.version, expectedAssignmentVersion: 1,
      attemptKey: randomUUID(), format: "pdf",
    }).expect(201)).body;
    await customer("/report").expect(200, { status: "empty" });
    await f.request.post(path + "/recovery").auth(later.customer.token, { type: "bearer" }).send({
      kind: "accept", orderId, expectedVersion: proposed.version, attemptKey: randomUUID(),
      format: "pdf", deadline: recovery.offeredDeadline,
    }).expect(201);
    await later.validate({ archiveId: artifact.id }).expect(409);
    const { body: { artifact: replacement } } = await later.validate({ archiveId: artifact.id, intentVersion: 3 }).expect(201);
    await later.deliver(replacement.id, later.operator.token, 3).expect(201);
    await customer("/report").expect(200).expect(({ body }) => expect(body.artifact.format).toBe("pdf"));
    const served = await customer(`/report/${replacement.id}/pdf`).expect(200);
    expect(Buffer.from(served.body.dataBase64, "base64")).toEqual(bytes);
    await customer(`/report/${replacement.id}/link`).expect(409);
  });

  it("finds a previous delivered purchase only for its requester and exact VIN", async () => {
    const original = await obtained("pdf");
    const saved = (await original.validate({ pdf: (await document()).pdf }).expect(201)).body;
    await original.deliver(saved.artifact.id).expect(201);
    const other = await f.actor(null);
    async function newRequest(token: string) {
      return (await f.request.post(`${root}/requests`).auth(token, { type: "bearer" })
        .send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    }
    const self = await newRequest(original.customer.token), unrelated = await newRequest(other.token);
    const previous = (id: string, token: string, vin = "dema0000000000001") => f.request.get(`${root}/requests/${id}/previous-purchase`)
      .auth(token, { type: "bearer" }).query({ vin });
    await previous(self, original.customer.token).expect(200, { previous: {
      requestId: original.id, vin: facts.vin, format: "pdf", provider: "Carfax", originalReportDate: "2026-10-14",
    } });
    await previous(self, original.customer.token, "DEMA0000000000006").expect(200, { previous: null });
    await previous(unrelated, other.token).expect(200, { previous: null });
    await previous(self, other.token).expect(403);
    await previous(original.id, original.customer.token).expect(200, { previous: null });
  });

  it.each(["pdf", "link", "both"] as const)("validates the accepted %s formats and preserves only the applicable originals", async (format) => {
    const e = await obtained(format);
    const { pdf, bytes } = await document();
    const originalQuery = "?share=Example%2fCode&z=%41+X&z=%2B";
    const link = origin + "/report/" + facts.reportId + originalQuery;
    const input = { ...(format !== "link" ? { pdf } : {}), ...(format !== "pdf" ? { link } : {}) };
    expect((await e.read().expect(200)).body).toEqual({ status: "empty" });
    const saved = (await e.validate(input).expect(201)).body;
    expect(saved).toMatchObject({ status: "validated", artifact: { format, source: "new_source", report: facts } });
    expect(JSON.stringify(saved)).not.toMatch(/127\.0\.0\.1|share=|storageKey|sha256|dataBase64|delivered/);
    expect((await e.validate(input).expect(201)).body).toEqual(saved);
    expect((await e.read().expect(200)).body).toEqual(saved);
    if (format !== "link") {
      expect(saved.artifact.pdf).toMatchObject({ filename: pdf.filename, pages: 2, sizeBytes: bytes.length });
      const content = await e.read("/content").expect(200);
      expect(content.headers["cache-control"]).toBe("private, no-store");
      expect(Buffer.from(content.body.dataBase64, "base64")).toEqual(bytes);
      const raw = await fetch(`${process.env["MINIO_ENDPOINT"]}/vehicle-history-private/report-artifacts/${e.id}/${saved.artifact.id}`);
      expect(raw.status).toBe(403);
    } else {
      expect(saved.artifact).not.toHaveProperty("pdf");
      await e.read("/content").expect(409);
    }
    const stored = await f.prisma.historyReportArtifact.findUniqueOrThrow({ where: { id: saved.artifact.id } });
    expect(stored.link).toBe(format === "pdf" ? null : link);
    expect(stored.sha256 === null).toBe(format === "link");
    expect(received).toEqual(format === "pdf" ? [] : ["/report/" + facts.reportId + originalQuery]);
    expect((await f.request.get(`${root}/requests/${e.id}/order`).auth(e.customer.token, { type: "bearer" }).expect(200)).body)
      .toMatchObject({ preparation: "preparing", collectionEnabled: false, wallet: null });
  });

  it("refuses missing, unusable, wrong or mismatched evidence before validation", async () => {
    const e = await obtained("both");
    const { pdf } = await document();
    const link = origin + "/report/" + facts.reportId;
    for (const input of [{}, { pdf }, { link }]) await e.validate(input).expect(422).expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_MISSING"));
    await e.validate({ pdf: { ...pdf, dataBase64: "JVBERi0xLjQK" }, link }).expect(422);
    for (const overrides of [{ vin: "DEMA0000000000006" }, { provider: "AutoCheck" }, { originalReportDate: "2026-10-15" },
      { reportId: "fixture-another" }, { language: "en" }, { permittedUse: false }]) {
      await e.validate({ pdf: (await document(overrides)).pdf, link }).expect(422);
    }
    for (const scenario of ["login", "payment", "operator", "missing", "html"]) {
      await e.validate({ pdf, link: link + "?scenario=" + scenario }).expect(422)
        .expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_LINK"));
    }
    const count = received.length;
    for (const unqualified of ["https://example.invalid/report/fixture-14", origin + "/other/fixture-14",
      origin.replace("https://", "https://name:password@") + "/report/fixture-14"]) {
      await e.validate({ pdf, link: unqualified }).expect(422);
    }
    expect(received).toHaveLength(count);
    expect((await e.read().expect(200)).body).toEqual({ status: "empty" });
  });

  it.each(["pdf", "link", "both"] as const)("delivers and reopens the accepted %s report through private HTTP", async (format) => {
    const e = await obtained(format);
    const path = `${root}/requests/${e.id}/report`;
    const purchaser = (suffix = "", token = e.customer.token) => f.request.get(path + suffix).auth(token, { type: "bearer" });
    const { deliver } = e;
    const { pdf, bytes } = await document();
    const address = origin + "/report/" + facts.reportId + "?q=%2f%41&x=plus+space&x=%2B";
    const pdfInput = format !== "link" ? { pdf } : {};
    const linkInput = format !== "pdf" ? { link: address } : {};
    await deliver(randomUUID()).expect(409);
    const { body: { artifact } } = await e.validate({ ...pdfInput, ...linkInput }).expect(201);
    await purchaser().expect(200, { status: "empty" }).expect("Cache-Control", "private, no-store");
    await purchaser(`/${artifact.id}/pdf`).expect(409);
    await deliver(randomUUID()).expect(409);
    await deliver(artifact.id, e.customer.token).expect(403);
    if (format !== "pdf") {
      linkAvailable = false;
      await deliver(artifact.id).expect(422).expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_LINK"));
      await purchaser().expect(200, { status: "empty" });
      linkAvailable = true;
    }
    const { body: delivered } = await deliver(artifact.id).expect(201);
    expect(delivered).toMatchObject({ status: "delivered", artifact: { id: artifact.id, format, report: facts }, deliveredAt: now });
    const count = received.length;
    linkAvailable = false;
    await deliver(artifact.id).expect(201, delivered);
    await purchaser().expect(200, delivered);
    expect(JSON.stringify(delivered).includes(address)).toBe(false);
    const pdfPath = `/${artifact.id}/pdf`, linkPath = `/${artifact.id}/link`;
    if (format === "link") await purchaser(pdfPath).expect(409);
    else {
      const { body } = await purchaser(pdfPath).expect(200).expect("Cache-Control", "private, no-store");
      expect(Buffer.from(body.dataBase64, "base64")).toEqual(bytes);
    }
    if (format === "pdf") await purchaser(linkPath).expect(409);
    else {
      const { body } = await purchaser(linkPath).expect(200).expect("Cache-Control", "private, no-store");
      expect(body.address === address).toBe(true);
    }
    expect(received).toHaveLength(count);
    const otherBuyer = await f.actor(null), seller = await f.actor(null, "seller");
    const dealer = await f.actor(null, "seller");
    await f.prisma.dealership.create({ data: { name: "Synthetic History Dealer", slug: dealer.user.id,
      members: { create: { userId: dealer.user.id, role: "owner" } } } });
    await purchaser("", otherBuyer.token).expect(403);
    await purchaser(pdfPath, seller.token).set("If-None-Match", "*").expect(403).expect("Cache-Control", "private, no-store");
    await purchaser(linkPath, dealer.token).expect(403);
    await purchaser(linkPath, e.operator.token).expect(403);
    await f.request.get(path + pdfPath).expect(401);
    await purchaser(`/${randomUUID()}/link`).expect(409);
    await e.record({ kind: "company_error" }, 2).expect(409);
    expect((await f.request.get(`${root}/requests/${e.id}/order`).auth(e.customer.token, { type: "bearer" }).expect(200)).body)
      .toMatchObject({ order: { id: e.target.orderId }, preparation: "delivered", collectionEnabled: false, wallet: null });
    expect((await f.request.get(`${root}/requests`).auth(e.customer.token, { type: "bearer" }).expect(200)).body.items)
      .toMatchObject([{ id: e.id, reportReady: true }]);
    await f.prisma.session.delete({ where: { id: e.customer.session.id } });
    await purchaser().expect(403);
    await purchaser(pdfPath).expect(403);
    await purchaser(linkPath).expect(403);
    await f.prisma.staffGrant.updateMany({ where: { userId: e.operator.user.id }, data: { revokedAt: new Date() } });
    await deliver(artifact.id).expect(403);
    await e.read("/content").expect(403);
  });

  it("restores a missing promised PDF using the identical original before delivering the same order", async () => {
    const e = await obtained("both");
    const { pdf, bytes } = await document();
    const { body: { artifact } } = await e.validate({ pdf, link: origin + "/report/" + facts.reportId }).expect(201);
    const s3 = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "" } });
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: "vehicle-history-private", Key: `report-artifacts/${e.id}/${artifact.id}`,
      }));
    } finally { s3.destroy(); }
    await e.deliver(artifact.id).expect(503);
    await f.request.get(`${root}/requests/${e.id}/report`).auth(e.customer.token, { type: "bearer" }).expect(200, { status: "empty" });
    await e.validate({ pdf: (await document({ language: "en" })).pdf }).expect(422)
      .expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_MISMATCH"));
    await e.validate({ pdf: { ...pdf, filename: "Different original.pdf" } }).expect(422)
      .expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_MISMATCH"));
    await e.validate({ pdf }).expect(201).expect(({ body }) => expect(body.artifact.id).toBe(artifact.id));
    await e.deliver(artifact.id).expect(201);
    const response = await f.request.get(`${root}/requests/${e.id}/report/${artifact.id}/pdf`)
      .auth(e.customer.token, { type: "bearer" }).expect(200);
    expect(Buffer.from(response.body.dataBase64, "base64")).toEqual(bytes);
  });

  it("delivers the earlier confirmed report before a newer validated report assigned to the same operator", async () => {
    f.config.set("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", {
      Carfax: { allowance: 12, resetUtc: "00:00", externalUsage: {} },
      AutoCheck: { allowance: 8, resetUtc: "00:00", externalUsage: {} },
    });
    const first = await obtained("link");
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T05:01:00.000Z");
    const second = await obtained("link", facts.vin, { operator: first.operator, laterWindow: true });
    const original = { link: origin + "/report/" + facts.reportId };
    const a = (await first.validate(original).expect(201)).body.artifact.id;
    const b = (await second.validate(original).expect(201)).body.artifact.id;
    await second.deliver(b).expect(409).expect(({ body }) => expect(body.code).toBe("HISTORY_FULFILMENT_FIFO"));
    await first.deliver(a).expect(201);
    await second.deliver(b).expect(201);
  });

  it("refuses first delivery when the booking deadline elapses during the final queue check", async () => {
    const e = await obtained("link");
    const { body: { artifact } } = await e.validate({ link: origin + "/report/" + facts.reportId }).expect(201);
    let samples = 0;
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date(++samples <= 2
      ? "2026-11-21T06:59:59.999Z" : "2026-11-21T07:00:00.000Z");
    await e.deliver(artifact.id).expect(409).expect(({ body }) => expect(body.code).toBe("HISTORY_ORDER_STALE"));
    await f.request.get(`${root}/requests/${e.id}/report`).auth(e.customer.token, { type: "bearer" }).expect(200, { status: "empty" });
  });

  it("keeps the original promise and escalates a second miss after one exact staffed hour across closing", async () => {
    const e = await obtained("both", facts.vin, { closeOfDay: true });
    const path = `${root}/requests/${e.id}`;
    const read = () => f.request.get(path + "/order").auth(e.customer.token, { type: "bearer" });
    const decide = (body: object) => f.request.post(path + "/recovery").auth(e.customer.token, { type: "bearer" }).send(body);
    const originalPromiseBy = "2026-11-21T14:30:00.000Z";
    const deadline = "2026-11-22T04:30:00.000Z";
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    await e.validate({}).expect(422);
    clock.now = () => new Date(originalPromiseBy);
    const { body: { recovery } } = await read().expect(200);
    expect(recovery).toMatchObject({ status: "offered", originalPromiseBy, originalFormat: "both",
      offeredDeadline: deadline, agreedDeadline: null, failure: "file_delivery" });
    const input = { kind: "accept", orderId: e.target.orderId, expectedVersion: recovery.version,
      deadline, format: "both", attemptKey: randomUUID() };
    await decide({ ...input, format: "pdf" }).expect(409);
    f.concurrent(2);
    const [accepted, replay] = await Promise.all([decide(input).set("x-history-concurrency", "1"), decide(input).set("x-history-concurrency", "1")]);
    expect(accepted.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(accepted.body).toMatchObject({ status: "agreed", originalPromiseBy, agreedDeadline: deadline });
    expect(replay.body).toEqual(accepted.body);
    clock.now = () => new Date(deadline);
    await read().expect(200).expect(({ body }) => expect(body.recovery).toMatchObject({
      status: "refund_decision_pending", pendingReason: "recovery_missed", originalPromiseBy, agreedDeadline: deadline,
    }));
    await decide({ ...input, attemptKey: randomUUID() }).expect(409);
  });

  it("requires agreement to a revised format before delivering any part of the promised pair", async () => {
    const e = await obtained("both");
    const { pdf } = await document();
    const path = `${root}/requests/${e.id}`;
    const order = () => f.request.get(path + "/order").auth(e.customer.token, { type: "bearer" });
    const staff = (input: object, token = e.operator.token) => f.request.post(e.work + "/recovery").auth(token, { type: "bearer" }).send(input);
    const customer = (input: object, token = e.customer.token) => f.request.post(path + "/recovery").auth(token, { type: "bearer" }).send(input);
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    await e.validate({ pdf }).expect(422);
    await customer({ kind: "decline", attemptKey: randomUUID(), orderId: e.target.orderId, expectedVersion: 1 }).expect(409);
    clock.now = () => new Date("2026-11-21T07:00:00.000Z");
    const { body: { recovery } } = await order().expect(200);
    const proposal = { kind: "propose_format", format: "pdf", expectedAssignmentVersion: 1,
      expectedVersion: recovery.version, orderId: e.target.orderId, attemptKey: randomUUID() };
    const wrongPurpose = await f.actor("vehicle_history_payment_evidence");
    await staff(proposal, wrongPurpose.token).expect(403);
    await staff({ ...proposal, expectedAssignmentVersion: 0 }).expect(409);
    const { body } = await staff(proposal).expect(201);
    const input = { kind: "accept", format: "pdf", deadline: recovery.offeredDeadline,
      orderId: e.target.orderId, expectedVersion: body.version, attemptKey: randomUUID() };
    await customer(input, (await f.actor(null)).token).expect(403);
    await customer({ ...input, expectedVersion: recovery.version }).expect(409);
    await e.validate({ pdf }).expect(409);
    await customer(input).expect(201).expect(({ body: state }) => expect(state).toMatchObject({ agreedFormat: "pdf", originalFormat: "both" }));
    await e.validate({ pdf }).expect(409);
    const { body: { artifact } } = await e.validate({ pdf, intentVersion: 3 }).expect(201);
    await e.deliver(artifact.id, e.operator.token, 3).expect(201);
    await order().expect(200).expect(({ body: current }) => expect(current).toMatchObject({
      preparation: "delivered", order: { acceptedOffer: { proposal: { format: "both" } } },
      recovery: { agreedFormat: "pdf", agreedDeadline: "2026-11-21T08:00:00.000Z", originalPromiseBy: "2026-11-21T07:00:00.000Z" },
    }));
    await f.request.get(path + "/report").auth(e.customer.token, { type: "bearer" }).expect(200)
      .expect(({ body: report }) => expect(report).toMatchObject({ status: "delivered", artifact: { format: "pdf", report: facts } }));
  });

  it("serializes a simultaneous customer decline and acceptance and keeps the winning decision", async () => {
    const e = await obtained("pdf");
    const path = `${root}/requests/${e.id}`;
    const read = () => f.request.get(path + "/order").auth(e.customer.token, { type: "bearer" });
    f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T07:00:00.000Z");
    const { body: { recovery } } = await read().expect(200);
    const decide = (input: object) => f.request.post(path + "/recovery").auth(e.customer.token, { type: "bearer" })
      .set("x-history-concurrency", "1").send({ ...input, orderId: e.target.orderId, expectedVersion: recovery.version, attemptKey: randomUUID() });
    f.concurrent(2);
    const results = await Promise.all([decide({ kind: "decline" }), decide({ kind: "accept", format: "pdf", deadline: recovery.offeredDeadline })]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = results.find((response) => response.status === 201)?.body;
    const saved = (await read().expect(200)).body.recovery;
    expect(saved).toEqual(winner);
    if (results[0]?.status === 201) expect(saved).toMatchObject({ status: "refund_decision_pending", pendingReason: "declined", agreedDeadline: null });
    else expect(saved).toMatchObject({ status: "agreed", agreedDeadline: recovery.offeredDeadline });
  });

  it("moves an unanswered offer to refund decision even when the next write is a stale acceptance", async () => {
    const e = await obtained("link");
    const path = `${root}/requests/${e.id}`;
    const read = () => f.request.get(path + "/order").auth(e.customer.token, { type: "bearer" });
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    clock.now = () => new Date("2026-11-21T07:00:00.000Z");
    const { body: { recovery } } = await read().expect(200);
    clock.now = () => new Date("2026-11-21T08:00:00.000Z");
    await f.request.post(path + "/recovery").auth(e.customer.token, { type: "bearer" }).send({ kind: "accept", format: "link",
      deadline: recovery.offeredDeadline, orderId: e.target.orderId, expectedVersion: recovery.version, attemptKey: randomUUID() }).expect(409);
    await read().expect(200).expect(({ body }) => expect(body.recovery).toMatchObject({
      status: "refund_decision_pending", pendingReason: "offer_elapsed", agreedDeadline: null,
    }));
  });

  it.each(["no_history", "company_error"] as const)("keeps %s context and an explicit pending founder decision", async (kind) => {
    const e = await obtained("pdf", facts.vin, { outcome: { kind } });
    const path = `${root}/requests/${e.id}`;
    const read = () => f.request.get(path + "/order").auth(e.customer.token, { type: "bearer" });
    if (kind === "company_error") {
      const { body: { recovery } } = await read().expect(200);
      expect(recovery).toMatchObject({ status: "attention", failure: "company_error" });
      await f.request.post(e.work + "/recovery").auth(e.operator.token, { type: "bearer" }).send({ kind: "company_error_refund",
        orderId: e.target.orderId, expectedAssignmentVersion: 1, expectedVersion: recovery.version, attemptKey: randomUUID() }).expect(201);
    }
    const founder = await f.actor("vehicle_history_refund_decision");
    await f.request.get(root + "/refunds/" + e.id).auth(founder.token, { type: "bearer" }).expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ failure: kind, reason: kind, refund: { status: "pending" } }));
    await read().expect(200).expect(({ body }) => expect(body).toMatchObject({
      status: "payment_confirmed", wallet: null,
      recovery: { status: "refund_decision_pending", pendingReason: kind, failure: kind, originalPromiseBy: "2026-11-21T07:00:00.000Z" },
    }));
  });

  it("settles the deadline in the worker and refuses a delivery held across it by the provider response", async () => {
    const e = await obtained("both");
    const { pdf } = await document();
    const clock = f.app.get<HistoryClock>(HISTORY_CLOCK);
    const worker = f.app.get(HistoryRecoveryWorker);
    const path = `${root}/requests/${e.id}`;
    const read = () => f.request.get(path + "/order").auth(e.customer.token, { type: "bearer" });
    const { body: { artifact } } = await e.validate({ pdf, link: origin + "/report/" + facts.reportId }).expect(201);
    clock.now = () => new Date("2026-11-21T07:00:00.000Z");
    await worker.execute();
    const offered = await f.prisma.historyRecoveryEvent.findFirstOrThrow({ where: { requestId: e.id } });
    expect(offered.state).toMatchObject({ status: "offered" });
    await f.request.post(path + "/recovery").auth(e.customer.token, { type: "bearer" }).send({ kind: "accept", format: "both",
      orderId: e.target.orderId, attemptKey: randomUUID(), expectedVersion: offered.version, deadline: "2026-11-21T08:00:00.000Z" }).expect(201);
    let inFlight!: () => void, release!: () => void;
    const serving = new Promise<void>((resolve) => { inFlight = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    beforeServingReport = async () => { inFlight(); await released; };
    const delivery = e.deliver(artifact.id).then((result) => result);
    await Promise.race([
      serving,
      delivery.then(({ status }) => { throw new Error(`Delivery returned ${status} before link validation`); }),
    ]);
    clock.now = () => new Date("2026-11-21T08:00:00.000Z");
    const scan = worker.execute();
    release();
    expect((await delivery).status).toBe(409);
    await scan;
    await worker.execute();
    expect(await f.prisma.historyRecoveryEvent.count({ where: { requestId: e.id } })).toBe(3);
    await read().expect(200).expect(({ body }) => expect(body.recovery).toMatchObject({
      status: "refund_decision_pending", pendingReason: "recovery_missed", agreedDeadline: "2026-11-21T08:00:00.000Z",
    }));
    await f.request.get(path + "/report").auth(e.customer.token, { type: "bearer" }).expect(200, { status: "empty" });
  });

  it("validates the original on the same paid order after a replacement booking", async () => {
    const e = await obtained("pdf", facts.vin, { lateReceipt: true });
    const { pdf, bytes } = await document();
    await e.validate({ pdf }).expect(201).expect(({ body }) => expect(body).toMatchObject({
      status: "validated", artifact: { format: "pdf", report: facts },
    }));
    const content = await e.read("/content").expect(200);
    expect(Buffer.from(content.body.dataBase64, "base64")).toEqual(bytes);
    const customerOrder = await f.request.get(`${root}/requests/${e.id}/order`)
      .auth(e.customer.token, { type: "bearer" }).expect(200);
    expect(customerOrder.body).toMatchObject({ order: { id: e.target.orderId }, replacement: { status: "accepted" },
      preparation: "preparing", wallet: null, payment: { outcome: "matched", amountMinor: 10000, bookingCommitted: true } });
  });

  it("rejects an invisible page even when its PDF stream and report metadata are present", async () => {
    const e = await obtained("pdf");
    const { pdf } = await document({}, { invisiblePage: 2 });
    await e.validate({ pdf }).expect(422)
      .expect(({ body }) => expect(body.code).toBe("HISTORY_REPORT_PDF"));
    expect((await e.read().expect(200)).body).toEqual({ status: "empty" });
    await e.validate({ pdf: (await document()).pdf }).expect(201);
  });

  it.each([
    ["pdf", "damaged", "readable"], ["link", "damaged", "readable"],
    ["pdf", "inline-missing-width", "inline"], ["link", "inline-missing-width", "inline"],
    ["pdf", "inline-short", "inline"], ["link", "inline-short", "inline"],
    ["pdf", "mask-short", "mask"], ["link", "mask-short", "mask"],
    ["pdf", "flate-short", "flate"], ["link", "flate-short", "flate"],
  ] as const)("refuses a %s report with a %s chart beside readable text", async (format, damaged, intact) => {
    const e = await obtained(format);
    const endpoint = origin + "/report/" + facts.reportId + "?scenario=";
    const broken = format === "pdf" ? { pdf: (await document({}, { chart: damaged })).pdf }
      : { link: endpoint + damaged };
    await e.validate(broken).expect(422).expect(({ body }) =>
      expect(body.code).toBe(format === "pdf" ? "HISTORY_REPORT_PDF" : "HISTORY_REPORT_LINK"));
    expect((await e.read().expect(200)).body).toEqual({ status: "empty" });
    const original = await document({}, { chart: intact });
    await e.validate(format === "pdf" ? { pdf: original.pdf } : { link: endpoint + intact }).expect(201);
    if (format === "pdf") {
      expect(Buffer.from((await e.read("/content").expect(200)).body.dataBase64, "base64")).toEqual(original.bytes);
    }
  });

  it("keeps provider availability separate from the accepted file formats", async () => {
    const e = await obtained("pdf", "DEMA0000000000006");
    expect(e.offer.preflight.providers).toEqual([{ name: "AutoCheck", originalReportDate: null }]);
    const { pdf } = await document({ vin: "DEMA0000000000006", provider: "AutoCheck" });
    await e.validate({ pdf, link: origin + "/report/fixture-14" }).expect(422);
    await e.validate({ pdf }).expect(201).expect(({ body }) => expect(body.artifact).toMatchObject({
      format: "pdf", report: { vin: "DEMA0000000000006", provider: "AutoCheck", originalReportDate: facts.originalReportDate },
    }));
    await e.record({ kind: "company_error" }, 2).expect(201);
    await e.read("/content").expect(409);
    expect(received).toEqual([]);
  });

  it("resumes an already-staged archive upload using only the recorded original", async () => {
    const e = await obtained("pdf", facts.vin, { source: "archive" });
    const { pdf, bytes } = await document();
    const id = randomUUID();
    await f.prisma.historyReportArtifact.create({ data: {
      id, requestId: e.id, orderId: e.target.orderId, intentId: e.target.intentId, intentVersion: e.target.intentVersion,
      acceptedRevision: e.target.acceptedRevision, stagedBy: e.operator.user.id,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      artifact: { id, source: "archive", format: "pdf", report: facts,
        pdf: { filename: pdf.filename, sizeBytes: bytes.length, pages: 2 } },
    } });

    await e.read().expect(200, { status: "staged" });
    await e.validate({ pdf }, (await f.actor()).token).expect(403);
    await e.validate({ pdf, expectedAssignmentVersion: 0 }).expect(409);
    await e.validate({ pdf: { ...pdf, filename: "Other original.pdf" } }).expect(409);
    await e.validate({ pdf: (await document({ reportId: "fixture-different" })).pdf }).expect(409);
    await e.validate({ pdf }).expect(201).expect(({ body }) => expect(body.artifact.id).toBe(id));
    const content = await e.read("/content").expect(200);
    expect(Buffer.from(content.body.dataBase64, "base64")).toEqual(bytes);
  });

  it("recovers exact bytes after an interrupted validation write and fences current reads", async () => {
    const e = await obtained("pdf");
    const { pdf, bytes } = await document();
    await f.prisma.$executeRawUnsafe(`CREATE FUNCTION refuse_history_report_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic report commit interruption'; END $$`);
    await f.prisma.$executeRawUnsafe(`CREATE TRIGGER synthetic_history_report_failure BEFORE UPDATE ON history_report_artifacts FOR EACH ROW EXECUTE FUNCTION refuse_history_report_commit()`);
    try { await e.validate({ pdf }).expect(503); }
    finally {
      await f.prisma.$executeRawUnsafe("DROP TRIGGER synthetic_history_report_failure ON history_report_artifacts");
      await f.prisma.$executeRawUnsafe("DROP FUNCTION refuse_history_report_commit()");
    }
    expect((await e.read().expect(200)).body).toEqual({ status: "staged" });
    await e.read("/content").expect(409);
    await e.validate({ pdf: (await document({ reportId: "fixture-different" })).pdf }).expect(409);
    await e.validate({ pdf }).expect(201);
    expect(Buffer.from((await e.read("/content").expect(200)).body.dataBase64, "base64")).toEqual(bytes);

    await f.request.get(e.path).query(e.target).expect(401);
    await e.read("/content", e.customer.token).expect(403);
    const evidenceReader = await f.actor("vehicle_history_payment_evidence");
    await e.read("/content", evidenceReader.token).expect(403);
    await e.read("/content", e.operator.token, { ...e.target, orderId: randomUUID() }).expect(409);
    await e.read("/content", e.operator.token, { ...e.target, intentId: randomUUID() }).expect(409);
    await e.read("/content", e.operator.token, { ...e.target, acceptedRevision: 1 }).expect(409);
    await e.read("/content", e.operator.token, { ...e.target, expectedAssignmentVersion: 0 }).expect(409);
    const successor = await f.actor();
    await f.request.post(e.work + "/handover").auth(e.operator.token, { type: "bearer" })
      .send({ targetOperatorId: successor.user.id, expectedAssignmentVersion: 1 }).expect(201);
    await e.read("/content").expect(403);
    await e.read("/content", successor.token, { ...e.target, expectedAssignmentVersion: 2 }).expect(200);
    await f.prisma.session.delete({ where: { id: successor.session.id } });
    await e.read("/content", successor.token, { ...e.target, expectedAssignmentVersion: 2 }).expect(403);
  });
});
