import { randomUUID } from "node:crypto";
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
      server = createServer({ key: readFileSync(key), cert: certificate }, (req, res) => {
        received.push(req.url ?? "");
        const scenario = new URL(req.url ?? "/", "https://127.0.0.1").searchParams.get("scenario");
        if (req.headers.authorization || req.headers.cookie) { res.writeHead(500).end(); return; }
        if (scenario === "login") { res.writeHead(302, { location: "/login" }).end(); return; }
        if (scenario === "payment") { res.writeHead(402).end(); return; }
        if (scenario === "operator") { res.writeHead(401, { "WWW-Authenticate": "Basic" }).end(); return; }
        if (scenario === "missing") { res.writeHead(404).end(); return; }
        if (scenario === "html") { res.writeHead(200, { "Content-Type": "text/html" }).end("Sign in to view this report"); return; }
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

  async function obtained(format: "pdf" | "link" | "both", vin = facts.vin, { lateReceipt = false } = {}) {
    const operator = await f.actor(), customer = await f.actor(null);
    const customerHttp = (path: string) => f.request.post(path).auth(customer.token, { type: "bearer" });
    const id = (await customerHttp(`${root}/requests`).send({ attemptKey: randomUUID() }).expect(201)).body.id as string;
    const work = `${root}/operator/requests/${id}`;
    const operatorHttp = (path: string) => f.request.post(work + path).auth(operator.token, { type: "bearer" });
    const expectedAssignmentVersion = 1;
    await operatorHttp("/claim").send({ expectedAssignmentVersion: 0 }).expect(201);
    const checked = (await operatorHttp("/offer").send({ kind: "check", vin, expectedVersion: 0, expectedAssignmentVersion }).expect(201)).body;
    const offer = (await operatorHttp("/offer").send({ kind: "propose", format, expectedVersion: 1, expectedAssignmentVersion,
      deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" }).expect(201)).body;
    const orderId = (await customerHttp(`${root}/requests/${id}/order`).send({ offer }).expect(201)).body.order.id as string;
    if (lateReceipt) f.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date("2026-11-21T07:05:00.000Z");
    await operatorHttp("/payment-verification").send({ orderId, expectedAssignmentVersion, attemptKey: randomUUID(),
      expectedPaymentVersion: 0, walletChecked: true, outcome: "matched", amountMinor: 10000, reference: "SYNTHETIC-VH14-REFERENCE",
      evidence: "Synthetic independent ledger", evidenceFileId: null, receivedAt: now }).expect(201);
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
      acceptedRevision, vin, format, provider, source: "new_source" }).expect(201);
    const record = (outcome: object, expectedVersion = 1) => operatorHttp("/fulfilment").send({ kind: "record", orderId,
      expectedAssignmentVersion, expectedVersion, attemptKey: randomUUID(), outcome });
    const target = { orderId, expectedAssignmentVersion, intentId, intentVersion: 2, acceptedRevision };
    const path = work + "/report-artifacts";
    const validate = (input: object, token = operator.token) => f.request.post(path).auth(token, { type: "bearer" }).send({ ...target, ...input });
    const read = (suffix = "", token = operator.token, query: object = target) => f.request.get(path + suffix).auth(token, { type: "bearer" }).query(query);
    const originalReportDate = checked.preflight.providers[0].originalReportDate ?? facts.originalReportDate;
    await record({ kind: "obtained", format, originalReportDate, permittedUse: true }).expect(201);
    return { id, work, customer, operator, target, path, record, validate, read, offer };
  }

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
