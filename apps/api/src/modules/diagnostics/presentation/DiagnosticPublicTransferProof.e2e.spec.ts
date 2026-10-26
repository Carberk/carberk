import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { S3Client, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import supertest from "supertest";
import { Pool } from "pg";
import { Listing } from "../../listings/domain/Listing";
import { PrismaListingRepository } from "../../listings/infrastructure/PrismaListingRepository";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { workerDatabaseName, workerUrls } from "../../../../test/helpers/testDatabases";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../identity/identity.public";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_OBJECTS, type DiagnosticObjects } from "../domain/ports/DiagnosticObjects";

const suite = defineE2eSuite("diagnostic-public-transfer-proof");
const people = ["sellerA", "sellerB", "erasureSeller", "erasurePdfSeller", "handoffErasureSeller", "outsider", "reception", "technician", "reviewer"] as const;
type Person = typeof people[number];
const capability: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technician: "diagnostics.technician", reviewer: "diagnostics.reviewer",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const centerId = suite.id("center");
const initialTime = new Date("2026-10-21T12:00:00.000Z");
const future = new Date("2027-01-01T00:00:00.000Z");
const localized = { tk: "Synag", ru: "Тест", en: "Synthetic" };
const rights = { category: "vehicle_observation", purpose: "Synthetic diagnostic identity comparison", basis: "Owned synthetic fixture only",
  provenance: "Generated VIN and chassis fixture, not a customer document", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: "2026-12-01T00:00:00.000Z", reason: "Synthetic fixture authorization" },
  supplierRestrictions: "No export or redistribution", hold: null };
// Offline Sharp 0.34.5 / libwebp 1.6.0 preparation. Both input and sanitized output are literal.
// These 4x4 color tiles are synthetic references, not photographs of actual identifiers.
const red = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=",
  inputSize: 95, output: "UklGRkAAAABXRUJQVlA4IDQAAAAwAgCdASoEAAQAAMASJaACdLoB+AH4AARoAAD++iGX/3easNN39a3/9aOfron+tHP/WVgA",
  sizeBytes: 72, sha256: "2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1" };
const blue = { input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==",
  inputSize: 94, output: "UklGRj4AAABXRUJQVlA4IDIAAADwAQCdASoEAAQAAMASJaACdLoB+AAETAAA/v5mof/60c/XRP9aOf+tHP/lKotU24oAAA==",
  sizeBytes: 70, sha256: "b7b11262b6b5f09879357d0857c949d7713b380c8b3a4682b0421390a0c7f873" };
const rightsB = { ...rights, provenance: "Independently generated B VIN and chassis tile, authorized by seller B for this visit" };
type Image = typeof red;
type Observation = { observedAt: string; mileageKm: number; method: "manual" | "vin"; vin: string | null; manualReference: string | null };
type Order = { id: string; version: number };
type Raw = { id: string; orderId: string; orderVersion: number; observationHash: string; observation: Observation; recordedBy: string; recordedAt: string };
const identifiers = (provenanceId: string, vin: "SYN-VIN-041") => [
  { kind: "vin_stamp", location: "Synthetic stamped VIN", value: vin, provenanceIds: [provenanceId] },
  { kind: "chassis_stamp", location: "Synthetic chassis plate", value: "SYN-CHASSIS-041", provenanceIds: [provenanceId] },
];
const definition = { title: localized, limitations: localized, syntheticNotice: localized,
  checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
const key = (id: string, image: Image) => `diagnostic-evidence/${id}/${image.sha256}`;
const metadata = (id: string, image: Image = red) => ({ id, sha256: image.sha256, mime: "image/webp", sizeBytes: image.sizeBytes });
const deniedBody = { statusCode: 403, code: "DIAGNOSTIC_NO_ACCESS", message: "Inspection request could not be completed",
  timestamp: expect.any(String), requestId: "unknown" };
const privateNoStore = (response: { headers: Record<string, string> }) => {
  expect(response.headers["cache-control"]).toContain("private");
  expect(response.headers["cache-control"]).toContain("no-store");
};
// Decode embedded subset-font Unicode maps and text operators. A search of raw
// compressed PDF bytes would miss the very disclosure asserted by this suite.
async function diagnosticPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const result: string[] = [];
  for (const page of pdf.getPages()) {
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const maps = new Map<string, Map<string, string>>();
    for (const [name, reference] of fonts.entries()) {
      const font = pdf.context.lookup(reference, PDFDict);
      const cmap = font.lookup(PDFName.of("ToUnicode")) as PDFRawStream;
      const mapping = new Map<string, string>();
      const source = Buffer.from(decodePDFRawStream(cmap).decode()).toString("ascii");
      for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const pair of block[1]!.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
          mapping.set(pair[1]!.toUpperCase(), String.fromCharCode(...pair[2]!.match(/.{4}/g)!.map(code => parseInt(code, 16))));
        }
      }
      expect(mapping.size, "Generated PDF has no decodable Unicode font map").toBeGreaterThan(0);
      maps.set(name.toString(), mapping);
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents!];
    let currentFont = "";
    for (const reference of streams) {
      const stream = pdf.context.lookup(reference) as PDFRawStream;
      const source = Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii");
      for (const token of source.matchAll(/(\/[^\s]+)\s+[\d.]+\s+Tf|<([0-9a-f]+)>\s*Tj/gi)) {
        if (token[1]) currentFont = token[1];
        else result.push(token[2]!.match(/.{4}/g)!.map(code => {
          const value = maps.get(currentFont)?.get(code.toUpperCase());
          if (value === undefined) throw new Error("Generated PDF contains an unmapped glyph");
          return value;
        }).join(""));
      }
    }
  }
  expect(result.length, "Generated PDF contains no decoded text").toBeGreaterThan(0);
  return result.join("\n");
}
// P1: separate personal publishers and physical visits. No Listing transfer is fabricated.
describe("public continuity across different sellers and Listings", { concurrent: false }, () => {
  let app: NestFastifyApplication; let db: PrismaService; let jwt: JwtService;
  let request: ReturnType<typeof supertest>; let objects: S3Client;
  let templateId: string;
  let fixtureOwner: Pool;
  const fixtureRole = `r8_${randomUUID().replaceAll("-", "")}`;
  type TriggerMode = { schema: string; table: string; name: string; mode: "D" | "O" | "A" | "R"; definition: string };
  let triggerSnapshot: TriggerMode[] = [];
  const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
  async function triggerModes() {
    return (await fixtureOwner.query<TriggerMode>(`SELECT n.nspname AS schema,c.relname AS table,t.tgname AS name,t.tgenabled AS mode,
      pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  }
  const matchedGuard = (name: string) => name.startsWith("diagnostic_source_") || name.startsWith("zz_diagnostic_source_") || name.startsWith("zzzz_campaign_preparation");
  async function activateFixture() {
    // Only the owned per-worker database. No environment-wide or production activation.
    const databases = inject("apiTestDatabases");
    if (!databases || new URL(process.env["DATABASE_URL"]!).pathname.slice(1) !== workerDatabaseName(databases.prefix, Number(process.env["VITEST_POOL_ID"]))) {
      throw new Error("R8 requires the task-owned disposable per-worker database");
    }
    triggerSnapshot = await triggerModes();
    const client = await fixtureOwner.connect();
    try {
      await client.query("BEGIN");
      for (const row of triggerSnapshot.filter(row => matchedGuard(row.name))) {
        await client.query(`ALTER TABLE ${identifier(row.schema)}.${identifier(row.table)} ENABLE TRIGGER ${identifier(row.name)}`);
      }
      const result = await client.query<{ source: boolean; campaign: boolean }>("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign");
      expect(result.rows).toEqual([{ source: true, campaign: true }]);
      await client.query("COMMIT");
      console.info("R8 disposable activation", { guards: triggerSnapshot.filter(row => matchedGuard(row.name)).length, readiness: result.rows });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async function restoreFixture() {
    if (!fixtureOwner) return;
    const client = await fixtureOwner.connect();
    const mode = { D: "DISABLE", O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" };
    try {
      await client.query("BEGIN");
      for (const row of triggerSnapshot) await client.query(`ALTER TABLE ${identifier(row.schema)}.${identifier(row.table)} ${mode[row.mode]} TRIGGER ${identifier(row.name)}`);
      await client.query("COMMIT");
      if (triggerSnapshot.length) expect(await triggerModes()).toEqual(triggerSnapshot);
      const receipts = await client.query("SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign");
      expect(receipts.rows).toEqual([{ source: 0, campaign: 0 }]);
      console.info("R8 exact trigger restoration", { triggers: triggerSnapshot.length, receipts: receipts.rows });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  const now = initialTime;
  const owned = { orders: [] as string[], reports: [] as string[], pdfs: [] as string[],
    raw: [] as string[], evidence: [] as string[], provenance: [] as string[], proofs: [] as string[], keys: new Set<string>(), users: [] as string[],
    sessions: [] as string[], grants: [] as { userId: string; capability: string }[], qualifications: [] as string[],
    requestKeys: [] as string[], findings: [] as string[], assignments: [] as { orderId: string; userId: string; capability: string }[] };
  // Only this exact product-purged order may have its original ownership severed.
  const erasedOrders = new Map<string, Date>();
  const erasedAuditIds = new Set<string>();
  let ownsCenter = false;
  const listings: { id: string; sellerId: string }[] = [];
  let catalogRegistered = false;
  const headers = (who: Person) => ({ authorization: `Bearer ${jwt.sign({ sub: suite.id(who), sid: suite.id(`${who}-session`), role: "buyer" })}` });
  const runtimeStarted = performance.now();
  let lastResponse: { verb: string; path: string; status: number; elapsedMs: number } | undefined;
  const observeResponse = (verb: string, path: string) => (response: { status: number }) => {
    lastResponse = { verb, path, status: response.status, elapsedMs: Math.round(performance.now() - runtimeStarted) };
  };
  const post = (who: Person, path: string, body: object) => request.post(`/api/v1/diagnostics/${path}`).set(headers(who)).send(body).on("response", observeResponse("POST", path));
  const get = (who: Person, path: string) => request.get(`/api/v1/diagnostics/${path}`).set(headers(who)).on("response", observeResponse("GET", path));
  const evidencePath = (o: Order) => `orders/${o.id}/identity-evidence`;
  const provenancePath = (o: Order, id?: string) => `orders/${o.id}/identity-provenance${id ? `/${id}` : ""}`;
  const comparisonPath = (b: Order, reportId: string) => `orders/${b.id}/reinspection-comparison?predecessorId=${reportId}`;
  const history = async (o: Order): Promise<Raw[]> => (await get("technician", `orders/${o.id}/identity-records`).expect(200)).body;
  const version = async (o: Order) => (await get("technician", `orders/${o.id}`).expect(200)).body.version as number;
  async function teardownOwnedFixtures() {
    if (!db) return;
    // Only request-registered keys, including an upload that wrote bytes before failing.
    // Never derive deletion authority from discovered database rows or bucket listings.
    const failures: unknown[] = [];
    try {
      // Identity DELETE guards permit only parent-order cascades. Establish all
      // ownership before touching objects or rows, including cross-order pins.
      const orders = await db.inspectionOrder.findMany({ where: { id: { in: owned.orders } } });
      expect(orders.every(order => order.centerId === centerId && order.templateVersionId === templateId
        && (listings.some(listing => listing.id === order.listingId && listing.sellerId === order.commissionerId)
          || erasedOrders.has(order.id) && order.listingId === null && order.commissionerId === null
            && order.erasedAt?.getTime() === erasedOrders.get(order.id)!.getTime()) && owned.requestKeys.includes(order.requestKey)),
      "Teardown refused: unregistered order binding").toBe(true);
      for (const [rows, ids] of [
        [await db.diagnosticContinuityProof.findMany({ where: { OR: [{ candidateOrderId: { in: owned.orders } },
          { predecessorOrderId: { in: owned.orders } }, { predecessorReportId: { in: owned.reports } },
          { issuerId: { in: owned.users } }, { linkingTechnicianId: { in: owned.users } },
          { issuerSessionId: { in: owned.sessions } }] }, select: { id: true } }), owned.proofs],
        [await db.diagnosticReportRecord.findMany({ where: { OR: [{ orderId: { in: owned.orders } },
          { predecessorId: { in: owned.reports } }, { identityRecordId: { in: owned.raw } },
          { identityEvidenceId: { in: owned.evidence } }, { continuityProofId: { in: owned.proofs } }, { templateVersionId: templateId ?? "unissued-template" }] }, select: { id: true } }), owned.reports],
        [await db.diagnosticPdfArtifact.findMany({ where: { reportId: { in: owned.reports } }, select: { id: true } }), owned.pdfs],
        [await db.diagnosticIdentityEvidence.findMany({ where: { OR: [{ orderId: { in: owned.orders } },
          { identityRecordId: { in: owned.raw } }, { supersedesId: { in: owned.evidence } }] }, select: { id: true } }), owned.evidence],
        [await db.diagnosticIdentityProvenance.findMany({ where: { orderId: { in: owned.orders } }, select: { id: true } }), owned.provenance],
        [await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: owned.orders } }, select: { id: true } }), owned.raw],
      ] as const) expect(rows.every(row => ids.includes(row.id)), "Teardown refused: unregistered cascade descendant").toBe(true);
      const reports = await db.diagnosticReportRecord.findMany({ where: { id: { in: owned.reports } } });
      for (const report of reports) {
        const state = report.state as { findings?: { id: string }[] };
        expect(owned.orders.includes(report.orderId) && report.templateVersionId === templateId
          && Array.isArray(state.findings) && state.findings.every(finding => owned.findings.includes(finding.id)),
        "Teardown refused: unregistered report/finding binding").toBe(true);
      }
      const provenance = await db.diagnosticIdentityProvenance.findMany({ where: { id: { in: owned.provenance } } });
      expect(provenance.every(row => owned.orders.includes(row.orderId) && (row.objectKey === null || owned.keys.has(row.objectKey))),
        "Teardown refused: unregistered provenance object").toBe(true);
      const pdfs = await db.diagnosticPdfArtifact.findMany({ where: { id: { in: owned.pdfs } } });
      expect(pdfs.every(row => owned.reports.includes(row.reportId) && owned.keys.has(row.objectKey)
        && row.objectKey === `diagnostic-pdf/${row.reportId}/${row.id}.pdf`),
        "Teardown refused: unregistered PDF object").toBe(true);
      const audits = await db.diagnosticAudit.findMany({ where: { OR: [{ centerId },
        { orderId: { in: owned.orders } }, { actorId: { in: owned.users } }] } });
      expect(audits.every(row => {
        const details = row.details as { templateVersionId?: string; reportId?: string };
        return ownsCenter && row.centerId === centerId && (row.actorId !== null && owned.users.includes(row.actorId) || row.actorId === null && erasedAuditIds.has(row.id))
          && (row.orderId !== null ? owned.orders.includes(row.orderId)
            : row.action === "TEMPLATE_PUBLISHED" && details.templateVersionId === templateId)
          && (details.reportId === undefined || owned.reports.includes(details.reportId));
      }), "Teardown refused: unregistered audit binding").toBe(true);
      expect(await db.diagnosticEvidence.count({ where: { reportId: { in: owned.reports } } }),
        "Teardown refused: unregistered report evidence").toBe(0);
      const unknownAssignments = await db.diagnosticOrderAssignment.count({ where: {
        orderId: { in: owned.orders }, NOT: { OR: owned.assignments } } });
      expect(unknownAssignments, "Teardown refused: unregistered assignment").toBe(0);
      if (ownsCenter) {
        expect(await db.inspectionOrder.count({ where: { OR: [{ centerId }, { templateVersionId: templateId ?? "unissued-template" }], id: { notIn: owned.orders } } }),
          "Teardown refused: unregistered center order").toBe(0);
        expect(await db.diagnosticTemplateVersion.count({ where: { centerId, id: { not: templateId ?? "unissued-template" } } }),
          "Teardown refused: unregistered center template").toBe(0);
        expect(await db.diagnosticCenterAssignment.count({ where: { centerId, id: { notIn: owned.qualifications } } }),
          "Teardown refused: unregistered center qualification").toBe(0);
      }
      // User SET NULL relations matter as well as CASCADE relations. Compare
      // every relation count with only the explicitly registered children.
      const sessions = await db.session.findMany({ where: { id: { in: owned.sessions } }, include: { _count: true } });
      expect(sessions.every(session => owned.users.includes(session.userId)
        && Object.values(session._count).every(count => count === 0)),
      "Teardown refused: unregistered Session descendant").toBe(true);
      const users = await db.user.findMany({ where: { id: { in: owned.users } },
        include: { _count: true, totpEnrollment: true, notificationPreferences: true } });
      for (const user of users) {
        const registered = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { _count: { select: {
          sessions: { where: { id: { in: owned.sessions } } },
          listings: { where: { OR: listings } },
          staffGrants: { where: { OR: owned.grants } },
          diagnosticCenterAssignments: { where: { id: { in: owned.qualifications }, centerId } },
          diagnosticCommissions: { where: { id: { in: owned.orders } } },
          diagnosticOrderAssignments: { where: { OR: owned.assignments } },
          publishedDiagnosticTemplates: { where: { id: templateId ?? "unissued-template" } },
          diagnosticAuditEntries: { where: { centerId, OR: [{ orderId: { in: owned.orders } },
            { orderId: null, action: "TEMPLATE_PUBLISHED", details: { path: ["templateVersionId"], equals: templateId ?? "unissued-template" } }] } },
          diagnosticIdentityRecords: { where: { id: { in: owned.raw } } },
          diagnosticIdentityEvidence: { where: { id: { in: owned.evidence } } },
          diagnosticIdentityProvenance: { where: { id: { in: owned.provenance } } },
        } } } });
        const allowed: Record<string, number> = registered._count;
        expect(user.totpEnrollment === null && user.notificationPreferences === null
          && Object.entries(user._count).every(([relation, count]) => count === (allowed[relation] ?? 0)),
        "Teardown refused: unregistered user descendant").toBe(true);
      }
      const listingRows = await db.listing.findMany({ where: { id: { in: listings.map(row => row.id) } }, include: { _count: true } });
      for (const listing of listingRows) {
        expect(listings.some(row => row.id === listing.id && row.sellerId === listing.sellerId)
          && listing.businessId === null && listing.brandId === suite.catalog.brandId
          && listing.modelId === suite.catalog.modelId && listing.cityId === suite.catalog.cityId,
        "Teardown refused: unregistered Listing binding").toBe(true);
        const known = await db.inspectionOrder.count({ where: { listingId: listing.id, id: { in: owned.orders } } });
        expect(Object.entries(listing._count).every(([relation, count]) => count === (relation === "diagnosticOrders" ? known : 0)),
          "Teardown refused: unregistered Listing descendant or SET NULL target").toBe(true);
      }
      // Catalog is an attributed cross-context prerequisite. Verify exact known children,
      // then remove only these registered rows after orders and Listings have gone.
      if (catalogRegistered) {
        const c = suite.catalog;
        const [brand, model, region, city] = await Promise.all([
          db.brand.findUnique({ where: { id: c.brandId }, include: { _count: true } }),
          db.model.findUnique({ where: { id: c.modelId }, include: { _count: true } }),
          db.region.findUnique({ where: { id: c.regionId }, include: { _count: true } }),
          db.city.findUnique({ where: { id: c.cityId }, include: { _count: true } }),
        ]);
        const n = listingRows.length;
        if (brand) expect(brand._count).toEqual({ models: model ? 1 : 0, listings: n });
        if (model) { expect(model.brandId).toBe(c.brandId); expect(model._count).toEqual({ generations: 0, listings: n }); }
        if (region) expect(region._count).toEqual({ cities: city ? 1 : 0, listings: 0 });
        if (city) { expect(city.regionId).toBe(c.regionId); expect(city._count).toEqual({ dealerships: 0, listings: n }); }
      }
      for (const objectKey of owned.keys) {
        try {
          await objects.send(new DeleteObjectCommand({ Bucket: "diagnostic-test-private", Key: objectKey }));
          await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: objectKey })))
            .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
        } catch (error) { failures.push(new Error(`Teardown failed for registered object ${objectKey}`, { cause: error })); }
      }
      if (failures.length) throw new AggregateError(failures, "Exact object cleanup failed; database rows preserved");
      // The isolated database owner drops the whole worker database in globalSetup's
      // finally. Keep all original attribution assertions and exact object cleanup;
      // never bypass a source guard to manufacture row-by-row fixture teardown.
      if (triggerSnapshot.length) {
        console.info("R8 disposable fixture outcomes", { lastResponse, orders: orders.length, reports: reports.length,
          raw: await db.diagnosticIdentityRecord.count({ where: { orderId: { in: owned.orders } } }),
          components: await db.diagnosticOwnershipComponent.count({ where: { orderId: { in: owned.orders } } }),
          grants: await db.diagnosticOwnershipGrant.count({ where: { orderId: { in: owned.orders } } }),
          proofs: await db.diagnosticContinuityProof.count({ where: { candidateOrderId: { in: owned.orders } } }), audits: audits.length });
        return;
      }
      await db.diagnosticContinuityProof.deleteMany({ where: { id: { in: owned.proofs } } });
      await db.diagnosticPdfArtifact.deleteMany({ where: { id: { in: owned.pdfs } } });
      for (const id of [...owned.reports].reverse()) await db.diagnosticReportRecord.deleteMany({ where: { id } });
      if (ownsCenter) await db.diagnosticAudit.deleteMany({ where: { centerId, AND: [{ OR: [{ actorId: { in: owned.users } }, { actorId: null, id: { in: [...erasedAuditIds] } }] },
          { OR: [{ orderId: { in: owned.orders } }, { orderId: null }] }] } });
      await db.diagnosticOrderAssignment.deleteMany({ where: { OR: owned.assignments } });
      // Reports no longer pin identity rows. The guarded rows leave only through
      // these exact request-registered order parents, never by direct DELETE.
      await db.inspectionOrder.deleteMany({ where: { id: { in: owned.orders }, centerId,
        OR: [...listings.map(listing => ({ listingId: listing.id, commissionerId: listing.sellerId })),
          ...[...erasedOrders].map(([id, erasedAt]) => ({ id, listingId: null, commissionerId: null, erasedAt }))], requestKey: { in: owned.requestKeys } } });
      if (ownsCenter) {
        await db.diagnosticTemplateVersion.deleteMany({ where: { id: templateId ?? "unissued-template" } });
        await db.diagnosticCenterAssignment.deleteMany({ where: { id: { in: owned.qualifications } } });
        await db.diagnosticCenter.delete({ where: { id: centerId } });
      }
      for (const listing of listings) await db.listing.deleteMany({ where: listing });
      if (catalogRegistered) {
        const c = suite.catalog;
        await db.city.deleteMany({ where: { id: c.cityId, regionId: c.regionId } });
        await db.region.deleteMany({ where: { id: c.regionId } });
        await db.model.deleteMany({ where: { id: c.modelId, brandId: c.brandId } });
        await db.brand.deleteMany({ where: { id: c.brandId } });
      }
      await db.session.deleteMany({ where: { id: { in: owned.sessions } } });
      await db.staffGrant.deleteMany({ where: { OR: owned.grants } });
      for (const id of owned.users) {
        const user = await db.user.findUnique({ where: { id }, include: { _count: true } });
        // User deletion cascades to many contexts. Preserve any actor with an unknown
        // descendant instead of treating a namespace or owned parent as authority.
        if (user) {
          expect(Object.values(user._count).every(count => count === 0), "Teardown refused: unregistered user descendant").toBe(true);
          await db.user.delete({ where: { id } });
        }
      }
    } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Owned fixture teardown failed; test assertions are reported separately");
  }

  beforeAll(async () => {
    // Existing erasure/lifecycle pattern: deterministic Date, with real timers still active.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(initialTime);
    const ownerUrl = process.env["DATABASE_URL"]!;
    fixtureOwner = new Pool({ connectionString: ownerUrl });
    const login = randomUUID();
    await fixtureOwner.query(`CREATE ROLE ${identifier(fixtureRole)} LOGIN PASSWORD '${login}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await fixtureOwner.query(`GRANT USAGE ON SCHEMA public TO ${identifier(fixtureRole)}`);
    await fixtureOwner.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(fixtureRole)}`);
    await fixtureOwner.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier(fixtureRole)}`);
    await fixtureOwner.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${identifier(fixtureRole)}`);
    const applicationUrl = new URL(ownerUrl); applicationUrl.username = fixtureRole; applicationUrl.password = login;
    try { process.env["DATABASE_URL"] = applicationUrl.toString(); db = new PrismaService(); } finally { process.env["DATABASE_URL"] = ownerUrl; }
    const role = await db.$queryRaw<{ current_user: string; session_user: string; privileged: boolean; owns: boolean }[]>`SELECT current_user,session_user,
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS privileged,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=r.oid) AS owns
      FROM pg_roles r WHERE rolname=current_user`;
    expect(role).toEqual([{ current_user: fixtureRole, session_user: fixtureRole, privileged: false, owns: false }]);
    console.info("R8 restricted application role", role);
    const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule, JwtModule.register({ global: true, secret: "synthetic-diagnostic-test" })] })
      .overrideProvider(PrismaService).useValue(db)
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => now })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => now, id: randomUUID, publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(who => suite.id(who) === userId) }).compile();
    app = testing.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService); jwt = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1"); request = supertest(app.getHttpServer());
    objects = new S3Client({ endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } });
    await objects.send(new HeadBucketCommand({ Bucket: "diagnostic-test-private" }));
    // Read-only collision fence. A previous attempt is preserved, never startup-cleaned.
    expect(await db.user.count({ where: { OR: [{ id: { in: people.map(who => suite.id(who)) } },
      { phone: { in: people.map(who => suite.phone(who)) } }] } })).toBe(0);
    expect(await db.session.count({ where: { id: { in: people.map(who => suite.id(`${who}-session`)) } } })).toBe(0);
    expect(await db.diagnosticCenter.count({ where: { OR: [{ id: centerId }, { code: suite.slugFor("center") }] } })).toBe(0);
    expect(await db.diagnosticCenterAssignment.count({ where: { id: { in: [
      ...people.filter(who => capability[who]).map(who => suite.id(`${who}-qualification`)), suite.id("template-qualification"),
    ] } } })).toBe(0);
    // e2eSuite.ts cross-context convention: real persisted identity Sessions, staff
    // grants/qualifications, catalog and active personal Listings are prerequisites.
    // No production authority adapter is overridden. All diagnostic state uses HTTP.
    expect(await db.listing.count({ where: { id: { in: [suite.id("listing-A"), suite.id("listing-B")] } } })).toBe(0);
    const c = suite.catalog;
    expect(await db.brand.count({ where: { OR: [{ id: c.brandId }, { slug: c.brandSlug }] } })).toBe(0);
    expect(await db.model.count({ where: { OR: [{ id: c.modelId }, { slug: c.modelSlug }] } })).toBe(0);
    expect(await db.region.count({ where: { OR: [{ id: c.regionId }, { slug: c.regionSlug }] } })).toBe(0);
    expect(await db.city.count({ where: { OR: [{ id: c.cityId }, { slug: c.citySlug }] } })).toBe(0);
    catalogRegistered = true;
    await seedSuiteCatalog(db, suite);
    for (const who of people) {
      owned.users.push(suite.id(who));
      await db.user.create({ data: { id: suite.id(who), phone: suite.phone(who), role: "buyer", phoneVerifiedAt: now } });
      owned.sessions.push(suite.id(`${who}-session`));
      await db.session.create({ data: { id: suite.id(`${who}-session`), userId: suite.id(who), refreshTokenHash: suite.id(`${who}-refresh`), expiresAt: future, adminTotpExpiresAt: future } });
      if (capability[who]) {
        const grant = { userId: suite.id(who), capability: capability[who]! }; owned.grants.push(grant);
        await db.staffGrant.create({ data: grant });
      }
    }
    for (const [name, seller] of [["A", "sellerA"], ["B", "sellerB"]] as const) {
      const listing = { id: suite.id(`listing-${name}`), sellerId: suite.id(seller) };
      listings.push(listing);
      await db.listing.create({ data: { ...listing, brandId: c.brandId, modelId: c.modelId, cityId: c.cityId,
        status: "active", vin: "SYN-VIN-041", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    }
    ownsCenter = true;
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const who of people) if (capability[who]) {
      const id = suite.id(`${who}-qualification`); owned.qualifications.push(id);
      await db.diagnosticCenterAssignment.create({ data: { id, centerId, userId: suite.id(who), capability: capability[who]!, qualifiedUntil: future } });
    }
    const templateGrant = { userId: suite.id("reception"), capability: "diagnostics.templates" }; owned.grants.push(templateGrant);
    await db.staffGrant.create({ data: templateGrant });
    owned.qualifications.push(suite.id("template-qualification"));
    await db.diagnosticCenterAssignment.create({ data: { id: suite.id("template-qualification"), centerId, userId: suite.id("reception"), capability: "diagnostics.templates", qualifiedUntil: future } });
    await activateFixture();
    const published = await post("reception", `centers/${centerId}/templates`, { expectedVersion: 0, definition, synthetic: true });
    if (typeof published.body.id === "string") templateId = published.body.id;
    expect(published.status, JSON.stringify(published.body)).toBe(201);
  });
  afterAll(async () => {
    try {
      // Stop and drain in-flight HTTP work before inspecting/deleting fixture objects
      // or restoring guards, including when a native test deadline fired.
      await app?.getHttpAdapter().close();
      await teardownOwnedFixtures();
    } finally {
      try { objects?.destroy(); await app?.close(); } finally {
        try { await restoreFixture(); } finally {
          if (fixtureOwner) {
            await fixtureOwner.query(`DROP OWNED BY ${identifier(fixtureRole)}`);
            await fixtureOwner.query(`DROP ROLE ${identifier(fixtureRole)}`);
            await fixtureOwner.end();
          }
          vi.useRealTimers();
        }
      }
    }
  });
  async function visit(observation: Observation, visitName: "A" | "B", seller: "sellerA" | "sellerB"): Promise<Order> {
    const requestKey = randomUUID(); owned.requestKeys.push(requestKey);
    const response = await post(seller, "orders", { requestKey, centerId,
      templateVersionId: templateId, audience: "listing_public", listingId: suite.id(`listing-${visitName}`), synthetic: true });
    let order = response.body;
    if (typeof order.id === "string") {
      owned.orders.push(order.id);
      owned.assignments.push({ orderId: order.id, userId: suite.id("reception"), capability: "diagnostics.reception" });
    }
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(order).toMatchObject({ version: 0, audience: "listing_public", listingId: suite.id(`listing-${visitName}`) });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ commissionerId: suite.id(seller), listingId: suite.id(`listing-${visitName}`) });
    for (const [who, expectedVersion, nextVersion] of [["technician", 0, 1], ["reviewer", 1, 2]] as const) {
      owned.assignments.push({ orderId: order.id, userId: suite.id(who), capability: capability[who]! });
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion,
        userId: suite.id(who), capability: capability[who], active: true }).expect(201));
      expect(order.version).toBe(nextVersion);
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: 2,
      kind: "physical", authorityReference: `Synthetic physical authorization for visit ${visitName}` }).expect(201));
    expect(order.version).toBe(3);
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: 3,
      kind: "publication", authorityReference: `Fresh synthetic publication consent from ${seller} for Listing ${visitName}` }).expect(201));
    expect(order.version).toBe(4);
    for (const [state, expectedVersion, nextVersion] of [["confirmed", 4, 5], ["arrived", 5, 6]] as const) {
      ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion, state }).expect(201));
      expect(order.version).toBe(nextVersion);
    }
    const observed = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: 6, ...observation });
    const records = await get("technician", `orders/${order.id}/identity-records`);
    if (Array.isArray(records.body)) owned.raw.push(...records.body.map((record: Raw) => record.id));
    expect(records.status, JSON.stringify(records.body)).toBe(200);
    expect(observed.status, JSON.stringify(observed.body)).toBe(201); order = observed.body;
    expect(order).toMatchObject({ version: 7, status: "arrived", physicalAuthorized: true, publicationAuthorized: true, vehicleMatched: true, observedVehicle: observation });
    return order;
  }
  async function visitOnListing(observation: Observation, seller: "sellerA" | "sellerB" | "erasureSeller" | "erasurePdfSeller" | "handoffErasureSeller", listingId: string, visitReference = listingId, requestOwnershipGrant = false): Promise<Order> {
    const requestKey = randomUUID(); owned.requestKeys.push(requestKey);
    const response = await post(seller, "orders", { requestKey, centerId, templateVersionId: templateId, audience: "listing_public", listingId, synthetic: true });
    let order = response.body;
    if (typeof order.id === "string") { owned.orders.push(order.id); owned.assignments.push({ orderId: order.id, userId: suite.id("reception"), capability: "diagnostics.reception" }); }
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(order).toMatchObject({ version: 0, audience: "listing_public", listingId });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ commissionerId: suite.id(seller), listingId });
    for (const [who, expectedVersion, nextVersion] of [["technician", 0, 1], ["reviewer", 1, 2]] as const) {
      owned.assignments.push({ orderId: order.id, userId: suite.id(who), capability: capability[who]! });
      ({ body: order } = await post("reception", `orders/${order.id}/assignments`, { expectedVersion, userId: suite.id(who), capability: capability[who], active: true }).expect(201));
      expect(order.version).toBe(nextVersion);
    }
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: 2, kind: "physical", authorityReference: `Synthetic physical authorization for visit ${visitReference}` }).expect(201));
    ({ body: order } = await post("reception", `orders/${order.id}/authorization`, { expectedVersion: 3, kind: "publication", authorityReference: visitReference === listingId ? `Fresh synthetic publication consent from ${seller} for Listing ${listingId}` : `Fresh synthetic publication consent from ${seller} for Listing ${listingId}, visit ${visitReference}` }).expect(201));
    for (const [state, expectedVersion] of [["confirmed", 4], ["arrived", 5]] as const) ({ body: order } = await post("reception", `orders/${order.id}/appointment`, { expectedVersion, state }).expect(201));
    // Ordinary authenticated source permission, never a seeded grant or technician declaration.
    const grant = requestOwnershipGrant ? await post(seller, `orders/${order.id}/ownership-grant`, { rights: { ...rights,
      purpose: "Synthetic restricted ownership continuity comparison",
      basis: "Authenticated synthetic seller explicitly grants the server-resolved ownership component",
      provenance: `Seller supplies consent for Listing/vehicle and seller/commissioner subjects of visit ${visitReference}`,
    } }).expect(201) : undefined;
    const observed = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: 6, ...observation,
      ...(grant ? { ownershipGrantId: grant.body.id } : {}) });
    const records = await get("technician", `orders/${order.id}/identity-records`);
    if (Array.isArray(records.body)) owned.raw.push(...records.body.map((record: Raw) => record.id));
    expect(records.status, JSON.stringify(records.body)).toBe(200); expect(observed.status, JSON.stringify(observed.body)).toBe(201); order = observed.body;
    expect(order).toMatchObject({ version: 7, status: "arrived", physicalAuthorized: true, publicationAuthorized: true, vehicleMatched: true, observedVehicle: observation });
    return order;
  }
  function intent(o: Order, id: string, image: Image = red, classification = rights) {
    return { id, expectedOrderVersion: o.version, contentType: "image/png", sizeBytes: image.inputSize, rights: classification };
  }
  async function stage(o: Order, id: string, image: Image = red, classification = rights) {
    owned.provenance.push(id);
    owned.keys.add(key(id, image));
    const response = await post("technician", provenancePath(o), intent(o, id, image, classification)).expect(201);
    privateNoStore(response); expect(response.body).toEqual({ id, state: "staged" });
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).toMatchObject({
      orderId: o.id, state: "staged", rights: classification, rightsUntil: new Date("2026-12-01T00:00:00.000Z"),
      contentType: "image/png", declaredSizeBytes: image.inputSize, objectKey: null, sha256: null,
    });
    await expect(objects.send(new HeadObjectCommand({ Bucket: "diagnostic-test-private", Key: key(id, image) })))
      .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  }
  const upload = (o: Order, id: string, image: Image = red) => request.put(`/api/v1/diagnostics/${provenancePath(o, id)}?expectedOrderVersion=${o.version}`)
    .set(headers("technician")).set("content-type", "application/octet-stream").set("x-evidence-type", "image/png").send(Buffer.from(image.input, "base64"));
  async function verified(o: Order, id: string, image: Image = red, classification = rights) {
    await stage(o, id, image, classification);
    const response = await upload(o, id, image).expect(200);
    privateNoStore(response); expect(response.body).toEqual({ ...metadata(id, image), state: "verified" });
    return response.body;
  }
  async function capture(o: Order, raw: Raw, p: string, image: Image, classification = rights) {
    expect(o.version).toBe(7);
    const input = { id: randomUUID(), expectedOrderVersion: 7, identityRecordId: raw.id,
      identifiers: identifiers(p, "SYN-VIN-041"), rights: classification, correction: null };
    owned.evidence.push(input.id);
    const response = await post("technician", evidencePath(o), input).expect(201); privateNoStore(response);
    expect(response.body).toEqual({ id: input.id, orderId: o.id, orderVersion: 8, identityRecordId: raw.id,
      observationHash: raw.observationHash, observation: raw.observation, identifiers: input.identifiers,
      provenance: [metadata(p, image)], rights: classification, correction: null, recordHash: expect.stringMatching(hash),
      recordedBy: suite.id("technician"), recordedAt: initialTime.toISOString() });
    o.version = 8; expect(await version(o)).toBe(8);
    return response.body;
  }
  async function release(o: Order) {
    const reportId = randomUUID(); owned.reports.push(reportId);
    const { body: draft } = await post("technician", `orders/${o.id}/reports`, { reportId, expectedOrderVersion: 8 }).expect(201);
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(finding.id);
    await post("technician", `reports/${draft.id}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${draft.id}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    const finalized = await post("reviewer", `reports/${draft.id}/transition`, { expectedVersion: 2, action: "finalize" });
    // Capture server-generated intents before any status assertion can interrupt ownership.
    const documents = await db.diagnosticPdfArtifact.findMany({ where: { reportId } });
    owned.pdfs.push(...documents.map(document => document.id));
    for (const document of documents) owned.keys.add(`diagnostic-pdf/${reportId}/${document.id}.pdf`);
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
    const documentResponse = await get("technician", `reports/${draft.id}/documents`).expect(200); privateNoStore(documentResponse);
    expect(documentResponse.body.map((document: { id: string }) => document.id).sort()).toEqual(documents.map(document => document.id).sort());
    return (await get("reviewer", `reports/${draft.id}`).expect(200)).body;
  }
  async function comparativeBytes(b: Order, reportId: string, p: string, image: Image) {
    const response = await get("reviewer", `orders/${b.id}/reinspection-comparison/provenance/${p}?predecessorId=${reportId}`).expect(200);
    privateNoStore(response);
    expect(response.headers["content-type"]).toContain("image/webp");
    const bytes = Buffer.from(response.body);
    expect(bytes.toString("base64")).toBe(image.output); expect(bytes.length).toBe(image.sizeBytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
  }

  async function denied(response: Awaited<ReturnType<typeof get>>) {
    expect(response.status).toBe(403); privateNoStore(response); expect(response.body).toEqual(deniedBody);
  }

  const publicGet = (path: string) => request.get(`/api/v1/public-diagnostics/${path}`);
  it("links independently observed public visits across distinct sellers and Listings without transferring restricted authority", async () => {
    expect(suite.id("reviewer")).not.toBe(suite.id("technician"));
    expect(suite.id("sellerA")).not.toBe(suite.id("sellerB"));
    expect(suite.id("listing-A")).not.toBe(suite.id("listing-B"));
    const original: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000,
      method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const revisit: Observation = { ...original, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100 };
    const a = await visit(original, "A", "sellerA"); const [ia] = await history(a);
    const pa = randomUUID(); await verified(a, pa, red); const ea = await capture(a, ia!, pa, red);
    const releasedA = await release(a);
    const beforeA = (await get("sellerA", `reports/${releasedA.id}`).expect(200)).body;
    const publicA = (await publicGet(`reports/${releasedA.id}`).expect(200)).body;
    const storedA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } });
    const artifactsA = await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } });
    expect(storedA).toMatchObject({ version: 3, audience: "listing_public", identityRecordId: ia!.id,
      identityRecordHash: ia!.observationHash, identityEvidenceId: ea.id, identityEvidenceHash: ea.recordHash,
      snapshotHash: expect.stringMatching(hash), finalizedAt: initialTime });
    expect(releasedA).toMatchObject({ status: "finalized", version: 3, observedAt: original.observedAt, mileageKm: 123000 });
    expect(artifactsA.map(row => row.locale).sort()).toEqual(["en", "ru", "tk"]);
    const b = await visit(revisit, "B", "sellerB"); const [ib] = await history(b);
    const pb = randomUUID(); expect(pb).not.toBe(pa);
    expect(red.sha256).not.toBe(blue.sha256);
    await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    const rawA = await history(a); const rawB = await history(b);
    for (const [order, raw, observation] of [[a, rawA, original], [b, rawB, revisit]] as const) {
      expect(raw).toEqual([{ id: expect.stringMatching(uuid), orderId: order.id, orderVersion: 7,
        observationHash: expect.stringMatching(hash), observation, recordedBy: suite.id("technician"), recordedAt: initialTime.toISOString() }]);
      expect(await version(order)).toBe(8);
    }
    expect(ib!.id).not.toBe(ia!.id);
    const orderA = await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } });
    const orderB = await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } });
    for (const [order, seller, listing] of [[orderA, "sellerA", "listing-A"], [orderB, "sellerB", "listing-B"]] as const) {
      expect(order).toMatchObject({ audience: "listing_public", commissionerId: suite.id(seller), listingId: suite.id(listing),
        version: 8, associationValidatedAt: initialTime });
      expect(order.physicalAuthorization).not.toBeNull(); expect(order.publicationAuthorization).not.toBeNull();
      expect(order.listingIdentityDigest).toMatch(hash);
      expect(await db.user.findUniqueOrThrow({ where: { id: suite.id(seller) } })).toMatchObject({ deletionScheduledAt: null, suspendedAt: null });
      expect(await db.listing.findUniqueOrThrow({ where: { id: suite.id(listing) } })).toMatchObject({ sellerId: suite.id(seller), status: "active", businessId: null });
    }
    expect(orderA.publicationAuthorization).not.toEqual(orderB.publicationAuthorization);
    expect(orderA.physicalAuthorization).not.toEqual(orderB.physicalAuthorization);
    const comparison = await get("reviewer", comparisonPath(b, releasedA.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toEqual({
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: storedA.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash,
        identity: { observation: original, evidence: ea, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
      candidate: { orderId: b.id, orderVersion: 8, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash,
        identity: { observation: revisit, evidence: eb, corrections: [], evidenceGeneration: 1, correctionHeadHash: null } },
    });
    await comparativeBytes(b, releasedA.id, pa, red); await comparativeBytes(b, releasedA.id, pb, blue);
    for (const [order, id, image, classification] of [[a, pa, red, rights], [b, pb, blue, rightsB]] as const) {
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).toMatchObject({ orderId: order.id,
        state: "verified", rights: classification, rightsUntil: new Date("2026-12-01T00:00:00.000Z"), objectKey: key(id, image),
        sha256: image.sha256, erasedAt: null, cleanupRequestedAt: null });
    }
    for (const who of ["sellerA", "sellerB", "outsider"] as const) {
      await denied(await get(who, comparisonPath(b, releasedA.id)));
      for (const order of [a, b]) {
        await denied(await get(who, `orders/${order.id}/identity-records`));
        await denied(await get(who, evidencePath(order)));
      }
      for (const id of [pa, pb]) await denied(await get(who, `orders/${b.id}/reinspection-comparison/provenance/${id}?predecessorId=${releasedA.id}`));
    }
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } })).toBe(0);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    expect((await get("reviewer", `reports/${releasedA.id}`).expect(200)).body).toEqual(releasedA);
    const auditsBefore = await db.diagnosticAudit.findMany({ where: { centerId } });
    // SETUP GATE: exact raw7/capture8, immutable A, own B material and both byte/hash
    // downloads precede criterion RED. Current privatePair predicts 403, never accepted here.
    const rationale = "Independent public visits with consistent retained VIN and chassis stamps across different personal sellers and Listings";
    const issuance = await post("reviewer", `orders/${b.id}/continuity-proofs`, {
      predecessorId: releasedA.id, expectedPredecessorVersion: 3, expectedOrderVersion: 8,
      predecessorIdentityRecordId: ia!.id, candidateIdentityRecordId: ib!.id, linkingTechnicianId: suite.id("technician"),
      method: "comparative_attestation", rationale, provenanceRecordIds: [pa, pb],
    });
    if (typeof issuance.body.proofId === "string") owned.proofs.push(issuance.body.proofId);
    expect(issuance.status, JSON.stringify(issuance.body)).toBe(201); privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: b.id } })).toBe(1);
    const issuedAudits = await db.diagnosticAudit.findMany({ where: { centerId, id: { notIn: auditsBefore.map(row => row.id) } } });
    expect(issuedAudits).toHaveLength(1);
    expect(issuedAudits[0]).toMatchObject({ orderId: b.id, actorId: suite.id("reviewer"), action: "CONTINUITY_PROOF_ISSUED", details: {} });
    const issued = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } });
    // Existing stable facts only. Future public Listing/publisher digest layout belongs
    // to the source round; this checkpoint does not invent a caller DTO or binding shape.
    expect(issued.bindings).toMatchObject({
      predecessor: { id: a.id, audience: "listing_public", commissionerId: suite.id("sellerA"), version: 8, evidenceGeneration: 1 },
      candidate: { id: b.id, audience: "listing_public", commissionerId: suite.id("sellerB"), version: 8, evidenceGeneration: 1 },
      evidencePins: [{ orderId: a.id, id: ea.id, hash: ea.recordHash }, { orderId: b.id, id: eb.id, hash: eb.recordHash }],
      evidence: [{ id: ea.id, recordHash: ea.recordHash }, { id: eb.id, recordHash: eb.recordHash }],
      provenance: expect.arrayContaining([{ id: pa, sha256: red.sha256, epoch: expect.any(String), rightsHash: expect.stringMatching(hash) },
        { id: pb, sha256: blue.sha256, epoch: expect.any(String), rightsHash: expect.stringMatching(hash) }]),
    });
    expect(issued).toMatchObject({ predecessorReportId: releasedA.id, predecessorOrderId: a.id, candidateOrderId: b.id,
      issuerId: suite.id("reviewer"), issuerSessionId: suite.id("reviewer-session"), linkingTechnicianId: suite.id("technician"),
      issuedAt: initialTime, consumedAt: null, consumedReportId: null, invalidatedAt: null });
    const proofPath = `orders/${b.id}/continuity-proofs/${issuance.body.proofId}`;
    const proof = await get("reviewer", proofPath).expect(200); privateNoStore(proof);
    expect(proof.body).toEqual({ proofId: issuance.body.proofId, policyVersion: "ADR-0108",
      predecessor: { reportId: releasedA.id, reportVersion: 3, snapshotHash: storedA.snapshotHash,
        identityRecordId: ia!.id, identityRecordHash: ia!.observationHash },
      candidate: { orderId: b.id, orderVersion: 8, identityRecordId: ib!.id, identityRecordHash: ib!.observationHash },
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", result: "same_vehicle", rationale,
      provenanceRecordIds: [pa, pb], issuedBy: suite.id("reviewer"), issuedAt: initialTime.toISOString() });
    const technicianProof = await get("technician", proofPath).expect(200); privateNoStore(technicianProof);
    expect(technicianProof.body).toEqual(proof.body);
    for (const who of ["sellerA", "sellerB", "outsider"] as const) await denied(await get(who, proofPath));
    expect((await get("reviewer", `orders/${b.id}/reports`).expect(200)).body).toEqual([]);
    expect(await version(b)).toBe(8);
    const reportId = randomUUID(); owned.reports.push(reportId);
    const input = { reportId, predecessorId: releasedA.id, expectedOrderVersion: 8,
      reason: "Independent new physical visit commissioned by seller B", proofId: issuance.body.proofId };
    const created = await post("technician", `orders/${b.id}/reinspections`, input).expect(201); privateNoStore(created);
    expect(created.body).toEqual({ id: reportId, orderId: b.id, audience: "listing_public", status: "draft", version: 0,
      templateVersionId: templateId, template: definition, observedAt: revisit.observedAt, mileageKm: 123100, findings: [],
      authorId: suite.id("technician"), reviewerId: null, successorOf: releasedA.id, correctionReason: input.reason,
      returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null, synthetic: true,
      supersededBy: null, lineageKind: "reinspection" });
    expect((await get("technician", `orders/${b.id}/reports`).expect(200)).body).toEqual([created.body]);
    expect((await get("technician", `reports/${reportId}/documents`).expect(200)).body).toEqual([]);
    expect(await db.diagnosticEvidence.count({ where: { reportId } })).toBe(0);
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId } })).toBe(0);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({
      identityRecordId: ib!.id, identityRecordHash: ib!.observationHash, identityEvidenceId: eb.id, identityEvidenceHash: eb.recordHash });
    const consumed = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } });
    expect(consumed).toMatchObject({ consumedReportId: reportId, consumedAt: initialTime });
    const auditsAfter = await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } });
    const newAudits = auditsAfter.filter(row => !auditsBefore.some(before => before.id === row.id));
    expect(newAudits.map(row => row.action).sort()).toEqual(["CONTINUITY_PROOF_CONSUMED", "CONTINUITY_PROOF_ISSUED", "REPORT_REINSPECTION_CREATED"]);
    expect(newAudits.every(row => row.orderId === b.id)).toBe(true);
    expect(newAudits.filter(row => row.action !== "CONTINUITY_PROOF_ISSUED").every(row => row.actorId === suite.id("technician"))).toBe(true);
    const retry = await post("technician", `orders/${b.id}/reinspections`, input).expect(201); privateNoStore(retry);
    expect(retry.body).toEqual(created.body);
    // Changed persisted binding conflicts even when reportId names the existing draft.
    await post("technician", `orders/${b.id}/reinspections`, { ...input, proofId: randomUUID() }).expect(409);
    await post("technician", `orders/${b.id}/reinspections`, { ...input, reason: "Changed binding" }).expect(409);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issuance.body.proofId } })).toEqual(consumed);
    expect(await db.diagnosticAudit.findMany({ where: { centerId }, orderBy: { id: "asc" } })).toEqual(auditsAfter);
    expect((await get("reviewer", proofPath).expect(200)).body).toEqual(proof.body);
    expect((await get("sellerA", `reports/${releasedA.id}`).expect(200)).body).toEqual(beforeA);
    expect((await publicGet(`reports/${releasedA.id}`).expect(200)).body).toEqual(publicA);
    await publicGet(`reports/${reportId}`).expect(404);
    await denied(await get("sellerA", `reports/${reportId}`));
    await denied(await get("sellerA", `reports/${reportId}/documents`));
    await denied(await get("sellerB", `reports/${reportId}`));
    await denied(await get("sellerB", `reports/${reportId}/documents`));
    await publicGet(`reports/${reportId}/documents`).expect(404);
    // Neither the link nor public lineage grants identity material or copies A's objects.
    await denied(await get("sellerB", `reports/${releasedA.id}`));
    await denied(await get("sellerB", `reports/${releasedA.id}/documents`));
    await denied(await get("sellerB", `reports/${releasedA.id}/documents/en`));
    await denied(await get("sellerB", provenancePath(a, pa)));
    await publicGet(`reports/${reportId}/evidence/${pa}`).expect(404);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    const findingB = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: "Independent B physical inspection finding",
      evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(findingB.id);
    await post("technician", `reports/${reportId}/findings`, { expectedVersion: 0, finding: findingB }).expect(201);
    await post("technician", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    await post("technician", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" }).expect(403);
    const finalized = await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
    const documentsB = await db.diagnosticPdfArtifact.findMany({ where: { reportId } });
    owned.pdfs.push(...documentsB.map(row => row.id));
    for (const row of documentsB) owned.keys.add(`diagnostic-pdf/${reportId}/${row.id}.pdf`);
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
    expect(documentsB).toHaveLength(3);
    expect(documentsB.every(row => row.reportId === reportId && !artifactsA.some(aPdf => aPdf.id === row.id))).toBe(true);
    expect((await publicGet(`listings/${suite.id("listing-B")}`).expect(200)).body).toEqual({ listingId: suite.id("listing-B"),
      reportId, observedAt: revisit.observedAt, mileageKm: 123100, synthetic: true });
    expect((await publicGet(`reports/${reportId}`).expect(200)).body).toMatchObject({ findings: [findingB], successorOf: releasedA.id,
      observedAt: revisit.observedAt, mileageKm: 123100, status: "finalized", version: 3 });
    expect((await publicGet(`listings/${suite.id("listing-A")}`).expect(200)).body.reportId).toBe(releasedA.id);
    const publicDocumentsB = await publicGet(`reports/${reportId}/documents`).expect(200);
    expect(publicDocumentsB.body.map((row: { id: string }) => row.id).sort()).toEqual(documentsB.map(row => row.id).sort());
    await publicGet(`reports/${reportId}/evidence/${pa}`).expect(404);
    await denied(await get("sellerB", evidencePath(a)));
    await denied(await get("sellerB", proofPath));
    await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Synthetic B publication withdrawn" }).expect(201);
    await publicGet(`listings/${suite.id("listing-B")}`).expect(404);
    expect((await publicGet(`listings?ids=${suite.id("listing-B")}`).expect(200)).body).toEqual([]);
    await publicGet(`reports/${reportId}`).expect(404);
    expect((await get("sellerB", `reports/${reportId}`).expect(200)).body.status).toBe("withdrawn");
    expect((await get("sellerA", `reports/${releasedA.id}`).expect(200)).body.supersededBy).toBeNull();
    expect((await publicGet(`listings/${suite.id("listing-A")}`).expect(200)).body.reportId).toBe(releasedA.id);
    // LA is unchanged. Its public report/PDF eligibility is governed independently by LA;
    // no assertion here requires A to remain available after a future LA authority change.
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: releasedA.id } })).toEqual(storedA);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: releasedA.id }, orderBy: { id: "asc" } })).toEqual(artifactsA);
    expect(await history(a)).toEqual(rawA); expect(await history(b)).toEqual(rawB);
    expect((await get("technician", evidencePath(a)).expect(200)).body).toEqual([ea]);
    expect((await get("technician", evidencePath(b)).expect(200)).body).toEqual([eb]);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } })).toEqual(orderA);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } })).toEqual(orderB);
  });

  /** Fresh visits use the original ordinary HTTP setup helpers. P1 retains every original
   * assertion; its evidence-free B finding uses Normal under the existing evidence rule. */
  async function freshPublicPair() {
    const observation: Observation = { observedAt: "2026-10-20T12:00:00.000Z", mileageKm: 124000, method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const a = await visit(observation, "A", "sellerA");
    const [ia] = await history(a); const pa = randomUUID();
    await verified(a, pa, red); const ea = await capture(a, ia!, pa, red);
    const released = await release(a);
    const b = await visit({ ...observation, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100 }, "B", "sellerB");
    const [ib] = await history(b); const pb = randomUUID();
    await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    return { a,b,ia: ia!,ib: ib!,pa,pb,ea,eb,released };
  }
  async function issuePublic(p: Awaited<ReturnType<typeof freshPublicPair>>, expectedPredecessorVersion = 3, retainedProvenance: string[] = []) {
    const response = await post("reviewer", `orders/${p.b.id}/continuity-proofs`, { predecessorId: p.released.id, expectedPredecessorVersion,
      expectedOrderVersion: p.b.version, predecessorIdentityRecordId: p.ia.id, candidateIdentityRecordId: p.ib.id,
      linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", rationale: "Independently retained synthetic VIN and chassis material",
      provenanceRecordIds: [p.pa,p.pb,...retainedProvenance] });
    if (typeof response.body.proofId === "string") owned.proofs.push(response.body.proofId);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.proofId as string;
  }
  async function reobservePublicCandidate(p: Awaited<ReturnType<typeof freshPublicPair>>) {
    const current = await get("technician", `orders/${p.b.id}`).expect(200);
    expect(current.body).toMatchObject({ vehicleMatched: false, physicalAuthorized: true, publicationAuthorized: true });
    const original = p.ib; const originalEvidence = p.eb; const retainedProvenance = p.pb;
    const observation = await post("technician", `orders/${p.b.id}/vehicle`, { expectedVersion: current.body.version, ...original.observation });
    const raw = await history(p.b);
    const appended = raw.filter(record => record.id !== original.id);
    owned.raw.push(...appended.map(record => record.id));
    expect(observation.status, JSON.stringify(observation.body)).toBe(201);
    expect(observation.body).toMatchObject({ version: current.body.version + 1, vehicleMatched: true });
    expect(raw).toHaveLength(2); expect(raw[0]).toEqual(original); expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ observation: original.observation, orderVersion: current.body.version + 1 });
    p.b.version = observation.body.version;
    const provenanceId = randomUUID(); await verified(p.b, provenanceId, blue, rightsB);
    const id = randomUUID(); owned.evidence.push(id);
    const correction = await post("technician", evidencePath(p.b), { id, expectedOrderVersion: p.b.version,
      identityRecordId: appended[0]!.id, identifiers: identifiers(provenanceId, "SYN-VIN-041"), rights: rightsB,
      correction: { supersedesId: originalEvidence.id, explanation: "Fresh physical observation revalidates B after the Listing was restored" } });
    expect(correction.status, JSON.stringify(correction.body)).toBe(201);
    expect(correction.body).toMatchObject({ id, identityRecordId: appended[0]!.id, orderVersion: p.b.version + 1,
      correction: { supersedesId: originalEvidence.id } });
    expect((await get("technician", evidencePath(p.b)).expect(200)).body).toContainEqual(originalEvidence);
    p.b.version = correction.body.orderVersion; p.ib = appended[0]!; p.eb = correction.body; p.pb = provenanceId;
    return [retainedProvenance];
  }
  function publicLink(p: Awaited<ReturnType<typeof freshPublicPair>>, proofId: string) {
    const reportId = randomUUID(); owned.reports.push(reportId);
    return { reportId, predecessorId: p.released.id, expectedOrderVersion: p.b.version, proofId, reason: "Fresh independently authorized public visit" };
  }

  async function automaticPredecessor() {
    const listingId = await isolatedListing("sellerA");
    const observation: Observation = { observedAt: "2026-10-21T10:00:00.000Z", mileageKm: 123000,
      method: "vin", vin: "syn-vin-041", manualReference: null };
    const a = await visitOnListing(observation, "sellerA", listingId, "A automatic physical visit", true);
    const [ia] = await history(a); const pa = randomUUID();
    await verified(a, pa, red); const ea = await capture(a, ia!, pa, red);
    const released = await release(a);
    return { listingId, observation, a, ia: ia!, pa, ea, released };
  }
  async function automaticCandidate(prior: Awaited<ReturnType<typeof automaticPredecessor>>) {
    const observation: Observation = { ...prior.observation, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100, vin: "SYN-VIN-041" };
    const b = await visitOnListing(observation, "sellerA", prior.listingId, "B automatic physical visit with own consent", true);
    const [ib] = await history(b); const pb = randomUUID();
    const classification = { ...rights, provenance: "Independently generated B VIN tile authorized by unchanged seller A for visit B" };
    await verified(b, pb, blue, classification); const eb = await capture(b, ib!, pb, blue, classification);
    return { ...prior, b, ib: ib!, pb, eb };
  }
  const automaticInput = (p: Awaited<ReturnType<typeof automaticCandidate>>) => ({ predecessorId: p.released.id,
    expectedPredecessorVersion: 3, expectedOrderVersion: p.b.version, predecessorIdentityRecordId: p.ia.id,
    candidateIdentityRecordId: p.ib.id, linkingTechnicianId: suite.id("technician"), method: "automatic_normalized_vin",
    rationale: "Equal normalized VIN, consistent retained stamps and unchanged public identity and ownership", provenanceRecordIds: [p.pa, p.pb] });

  async function refusesRestoredAutomaticOwnershipMutation(kind: "seller" | "vin") {
    const prior = await automaticPredecessor();
    const originalListing = await db.listing.findUniqueOrThrow({ where: { id: prior.listingId } });
    const aSnapshot = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: prior.released.id } });
    const aArtifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId: prior.released.id }, orderBy: { id: "asc" } });
    const aOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: prior.a.id } });
    const aRaw = await db.diagnosticIdentityRecord.findMany({ where: { orderId: prior.a.id }, orderBy: { id: "asc" } });
    const aEvidence = await db.diagnosticIdentityEvidence.findMany({ where: { orderId: prior.a.id }, orderBy: { id: "asc" } });
    const proofWhere = { OR: [{ predecessorOrderId: prior.a.id }, { candidateOrderId: prior.a.id }] };
    expect(await db.diagnosticContinuityProof.findMany({ where: proofWhere })).toEqual([]);
    expect(aSnapshot).toMatchObject({ status: "finalized", version: 3, snapshotHash: expect.stringMatching(hash),
      identityRecordId: prior.ia.id, identityRecordHash: prior.ia.observationHash,
      identityEvidenceId: prior.ea.id, identityEvidenceHash: prior.ea.recordHash });
    expect(aArtifacts.length).toBeGreaterThan(0);
    expect(aRaw).toHaveLength(1); expect(aEvidence).toHaveLength(1);
    expect(await history(prior.a)).toEqual([prior.ia]);

    // This isolated Listing is the only mutable source. Never observe A again.
    // Restore every scalar, including updatedAt, before creating B, even on failure.
    let mutationFailed = false;
    let restorationError: unknown;
    try {
      const changed = await db.listing.update({ where: { id: prior.listingId }, data: kind === "seller"
        ? { sellerId: suite.id("sellerB"), updatedAt: originalListing.updatedAt }
        : { vin: "SYN-VIN-999", updatedAt: originalListing.updatedAt } });
      expect(changed).toMatchObject(kind === "seller" ? { sellerId: suite.id("sellerB") } : { vin: "SYN-VIN-999" });
      expect(changed).not.toEqual(originalListing);
    } catch (error) {
      mutationFailed = true;
      throw error;
    } finally {
      try {
        await db.listing.update({ where: { id: prior.listingId }, data: originalListing });
      } catch (error) {
        restorationError = error;
        if (mutationFailed) console.error("Owned Listing restoration also failed; preserving the original mutation failure", error);
      }
    }
    if (restorationError) throw restorationError;
    expect(await db.listing.findUniqueOrThrow({ where: { id: prior.listingId } })).toEqual(originalListing);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: prior.a.id } })).toMatchObject({ associationValidatedAt: null });

    const p = await automaticCandidate(prior);
    const currentA = await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.a.id } });
    const bOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } });
    expect(p.a.id).not.toBe(p.b.id); expect(p.ia.id).not.toBe(p.ib.id); expect(p.pa).not.toBe(p.pb);
    for (const order of [currentA, bOrder]) expect(order).toMatchObject({ audience: "listing_public",
      listingId: originalListing.id, commissionerId: originalListing.sellerId, listingIdentityDigest: aOrder.listingIdentityDigest });
    expect(originalListing).toMatchObject({ sellerId: suite.id("sellerA"), businessId: null, vin: "SYN-VIN-041" });
    expect(bOrder).toMatchObject({ associationValidatedAt: initialTime });
    expect(bOrder.listingIdentityDigest).toMatch(hash);
    expect(bOrder.publicationAuthorization).not.toEqual(aOrder.publicationAuthorization);
    expect(bOrder.physicalAuthorization).not.toEqual(aOrder.physicalAuthorization);
    for (const [order, raw, evidence] of [[p.a, p.ia, p.ea], [p.b, p.ib, p.eb]] as const) {
      expect(await history(order)).toEqual([raw]);
      expect((await get("technician", evidencePath(order)).expect(200)).body).toEqual([evidence]);
      expect(evidence).toMatchObject({ correction: null, identifiers: identifiers(evidence.provenance[0].id, "SYN-VIN-041") });
    }
    const comparison = await get("reviewer", comparisonPath(p.b, p.released.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toMatchObject({ predecessor: { identityRecordId: p.ia.id, identity: { evidence: p.ea, corrections: [] } },
      candidate: { identityRecordId: p.ib.id, identity: { evidence: p.eb, corrections: [] } } });
    await comparativeBytes(p.b, p.released.id, p.pa, red); await comparativeBytes(p.b, p.released.id, p.pb, blue);
    const orderIds = [p.a.id, p.b.id];
    const audits = await db.diagnosticAudit.findMany({ where: { orderId: { in: orderIds } }, orderBy: { id: "asc" } });
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: p.b.id } })).toBe(0);

    // MASKED: current public automatic admission is default-closed. A passing 403
    // proves neither reached ownership discrimination nor behavioral RED. The
    // unchanged positive below must still reach issuance and require 201.
    const issuance = await post("reviewer", `orders/${p.b.id}/continuity-proofs`, automaticInput(p));
    if (typeof issuance.body.proofId === "string") owned.proofs.push(issuance.body.proofId);
    await denied(issuance);
    expect(await db.diagnosticContinuityProof.findMany({ where: proofWhere })).toEqual([]);
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: p.b.id } })).toBe(0);
    expect(await db.diagnosticReportRecord.count({ where: { orderId: p.b.id } })).toBe(0);
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: p.released.id } })).toBe(0);
    expect(await db.diagnosticAudit.findMany({ where: { orderId: { in: orderIds } }, orderBy: { id: "asc" } })).toEqual(audits);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: prior.released.id } })).toEqual(aSnapshot);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: prior.released.id }, orderBy: { id: "asc" } })).toEqual(aArtifacts);
    expect(await db.diagnosticIdentityRecord.findMany({ where: { orderId: prior.a.id }, orderBy: { id: "asc" } })).toEqual(aRaw);
    expect(await db.diagnosticIdentityEvidence.findMany({ where: { orderId: prior.a.id }, orderBy: { id: "asc" } })).toEqual(aEvidence);
    expect(await history(prior.a)).toEqual([prior.ia]); expect(await history(p.b)).toEqual([p.ib]);
    expect((await get("technician", evidencePath(prior.a)).expect(200)).body).toEqual([prior.ea]);
    expect(await db.listing.findUniqueOrThrow({ where: { id: prior.listingId } })).toEqual(originalListing);
  }

  it("refuses automatic continuity after a restored Listing seller change without reobserving A", async () => {
    await refusesRestoredAutomaticOwnershipMutation("seller");
  });

  it("refuses automatic continuity after a restored Listing VIN change without reobserving A", async () => {
    await refusesRestoredAutomaticOwnershipMutation("vin");
  });

  it("links unchanged public Listing identity and ownership by normalized VIN with independent B release", async () => {
    const p = await automaticCandidate(await automaticPredecessor());
    const listing = await db.listing.findUniqueOrThrow({ where: { id: p.listingId } });
    const aSnapshot = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } });
    const aArtifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId: p.released.id }, orderBy: { id: "asc" } });
    const aOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.a.id } });
    const bOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } });
    expect(aSnapshot).toMatchObject({ status: "finalized", version: 3, snapshotHash: expect.stringMatching(hash), identityRecordId: p.ia.id,
      identityRecordHash: p.ia.observationHash, identityEvidenceId: p.ea.id, identityEvidenceHash: p.ea.recordHash });
    expect(p.a.id).not.toBe(p.b.id); expect(p.ia.id).not.toBe(p.ib.id); expect(p.pa).not.toBe(p.pb);
    expect(suite.id("reviewer")).not.toBe(suite.id("technician"));
    for (const order of [aOrder, bOrder]) expect(order).toMatchObject({ commissionerId: suite.id("sellerA"), listingId: p.listingId,
      associationValidatedAt: initialTime, listingIdentityDigest: aOrder.listingIdentityDigest });
    expect(aOrder.listingIdentityDigest).toMatch(hash);
    expect(bOrder.publicationAuthorization).not.toEqual(aOrder.publicationAuthorization);
    expect(bOrder.physicalAuthorization).not.toEqual(aOrder.physicalAuthorization);
    for (const [order, raw, evidence] of [[p.a, p.ia, p.ea], [p.b, p.ib, p.eb]] as const) {
      expect(await history(order)).toEqual([raw]);
      expect((await get("technician", evidencePath(order)).expect(200)).body).toEqual([evidence]);
      expect(evidence).toMatchObject({ correction: null, identifiers: identifiers(evidence.provenance[0].id, "SYN-VIN-041") });
    }
    const comparison = await get("reviewer", comparisonPath(p.b, p.released.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toMatchObject({ predecessor: { identityRecordId: p.ia.id, identity: { evidence: p.ea, corrections: [] } },
      candidate: { identityRecordId: p.ib.id, identity: { evidence: p.eb, corrections: [] } } });
    await comparativeBytes(p.b, p.released.id, p.pa, red); await comparativeBytes(p.b, p.released.id, p.pb, blue);
    const auditsBefore = await db.diagnosticAudit.findMany({ where: { orderId: p.b.id }, orderBy: { id: "asc" } });
    // Criterion RED must be issuance after ordinary setup, never a seeded proof or ownership pin.
    const issuance = await post("reviewer", `orders/${p.b.id}/continuity-proofs`, automaticInput(p));
    if (typeof issuance.body.proofId === "string") owned.proofs.push(issuance.body.proofId);
    expect(issuance.status, JSON.stringify(issuance.body)).toBe(201); privateNoStore(issuance);
    expect(issuance.body).toEqual({ proofId: expect.stringMatching(uuid) });
    const proofId = issuance.body.proofId as string; const proofPath = `orders/${p.b.id}/continuity-proofs/${proofId}`;
    const proof = await get("reviewer", proofPath).expect(200); privateNoStore(proof);
    expect(proof.body).toMatchObject({ method: "automatic_normalized_vin", result: "same_vehicle", issuedBy: suite.id("reviewer"),
      predecessor: { reportId: p.released.id, snapshotHash: aSnapshot.snapshotHash, identityRecordId: p.ia.id, identityRecordHash: p.ia.observationHash },
      candidate: { orderId: p.b.id, orderVersion: 8, identityRecordId: p.ib.id, identityRecordHash: p.ib.observationHash }, provenanceRecordIds: [p.pa, p.pb] });
    expect((await get("technician", proofPath).expect(200)).body).toEqual(proof.body);
    const input = publicLink(p, proofId);
    const first = await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201); privateNoStore(first);
    expect(first.body).toMatchObject({ id: input.reportId, successorOf: p.released.id, findings: [], observedAt: "2026-10-21T11:00:00.000Z",
      mileageKm: 123100, status: "draft", version: 0, templateVersionId: templateId });
    expect((await get("technician", `orders/${p.b.id}/reports`).expect(200)).body).toEqual([first.body]);
    expect((await get("technician", `reports/${input.reportId}/documents`).expect(200)).body).toEqual([]);
    expect(await db.diagnosticEvidence.count({ where: { reportId: input.reportId } })).toBe(0);
    expect(await db.diagnosticPdfArtifact.count({ where: { reportId: input.reportId } })).toBe(0);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } })).toMatchObject({ identityRecordId: p.ib.id,
      identityRecordHash: p.ib.observationHash, identityEvidenceId: p.eb.id, identityEvidenceHash: p.eb.recordHash });
    const consumed = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(consumed).toMatchObject({ consumedReportId: input.reportId, consumedAt: initialTime });
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: p.b.id } })).toBe(1);
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: p.released.id } })).toBe(1);
    const audits = await db.diagnosticAudit.findMany({ where: { orderId: p.b.id }, orderBy: { id: "asc" } });
    const added = audits.filter(row => !auditsBefore.some(before => before.id === row.id));
    expect(added.map(row => row.action).sort()).toEqual(["CONTINUITY_PROOF_CONSUMED", "CONTINUITY_PROOF_ISSUED", "REPORT_REINSPECTION_CREATED"]);
    expect(added.find(row => row.action === "CONTINUITY_PROOF_ISSUED")).toMatchObject({ actorId: suite.id("reviewer") });
    expect(added.filter(row => row.action !== "CONTINUITY_PROOF_ISSUED").every(row => row.actorId === suite.id("technician"))).toBe(true);
    expect((await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201)).body).toEqual(first.body);
    await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: randomUUID() }).expect(409);
    expect(await db.diagnosticAudit.findMany({ where: { orderId: p.b.id }, orderBy: { id: "asc" } })).toEqual(audits);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(consumed);
    await publicGet(`reports/${input.reportId}`).expect(404);
    for (const who of ["sellerA", "sellerB", "outsider"] as const) {
      await denied(await get(who, proofPath)); await denied(await get(who, evidencePath(p.a)));
      await denied(await get(who, comparisonPath(p.b, p.released.id)));
    }
    const finding = await submitLinked(input.reportId);
    await post("technician", `reports/${input.reportId}/transition`, { expectedVersion: 2, action: "finalize" }).expect(403);
    expect((await finalizeLinked(input.reportId)).status).toBe(201);
    const publicReport = await publicGet(`reports/${input.reportId}`).expect(200);
    expect(publicReport.body).toMatchObject({ successorOf: p.released.id, findings: [finding],
      observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100, status: "finalized" });
    for (const restrictedId of [proofId, p.pa, p.pb, p.ia.id, p.ib.id, p.ea.id, p.eb.id]) expect(publicReport.text).not.toContain(restrictedId);
    expect((await publicGet(`listings/${p.listingId}`).expect(200)).body).toEqual({ listingId: p.listingId, reportId: input.reportId,
      observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 123100, synthetic: true });
    await publicGet(`reports/${input.reportId}/evidence/${p.pa}`).expect(404);
    await publicGet(`reports/${input.reportId}/evidence/${p.pb}`).expect(404);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } })).toEqual(aSnapshot);
    expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: p.released.id }, orderBy: { id: "asc" } })).toEqual(aArtifacts);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.a.id } })).toEqual(aOrder);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } })).toEqual(bOrder);
    expect(await db.listing.findUniqueOrThrow({ where: { id: p.listingId } })).toEqual(listing);
    expect(await history(p.a)).toEqual([p.ia]); expect(await history(p.b)).toEqual([p.ib]);
  });

  it("refuses restored current public ownership after authorized A reobservation without inventing historical continuity", async () => {
    const prior = await automaticPredecessor();
    const originalListing = await db.listing.findUniqueOrThrow({ where: { id: prior.listingId } });
    const aSnapshot = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: prior.released.id } });
    await db.listing.update({ where: { id: prior.listingId }, data: { sellerId: suite.id("outsider") } });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: prior.a.id } })).toMatchObject({ associationValidatedAt: null });
    await db.listing.update({ where: { id: prior.listingId }, data: { sellerId: originalListing.sellerId, updatedAt: originalListing.updatedAt } });
    expect(await db.listing.findUniqueOrThrow({ where: { id: prior.listingId } })).toEqual(originalListing);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: prior.a.id } })).toMatchObject({ associationValidatedAt: null });
    const reobserved = await post("technician", `orders/${prior.a.id}/vehicle`, { expectedVersion: await version(prior.a), ...prior.observation });
    const raw = await history(prior.a);
    owned.raw.push(...raw.filter(record => record.id !== prior.ia.id).map(record => record.id));
    expect(reobserved.status, JSON.stringify(reobserved.body)).toBe(201);
    expect(raw).toHaveLength(2); expect(raw[0]).toEqual(prior.ia);
    expect(raw[1]).toMatchObject({ observation: prior.observation, recordedBy: suite.id("technician") });
    const p = await automaticCandidate(prior);
    const aOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.a.id } });
    const bOrder = await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } });
    expect(aOrder).toMatchObject({ associationValidatedAt: initialTime, listingIdentityDigest: bOrder.listingIdentityDigest });
    expect(bOrder).toMatchObject({ commissionerId: suite.id("sellerA"), listingId: prior.listingId, associationValidatedAt: initialTime });
    expect(bOrder.listingIdentityDigest).toMatch(hash); expect(bOrder.publicationAuthorization).not.toEqual(aOrder.publicationAuthorization);
    const comparison = await get("reviewer", comparisonPath(p.b, p.released.id)).expect(200); privateNoStore(comparison);
    expect(comparison.body).toMatchObject({ predecessor: { identityRecordId: p.ia.id, identity: { evidence: p.ea, corrections: [] } },
      candidate: { identityRecordId: p.ib.id, identity: { evidence: p.eb, corrections: [] } } });
    await comparativeBytes(p.b, p.released.id, p.pa, red); await comparativeBytes(p.b, p.released.id, p.pb, blue);
    for (const order of [p.a, p.b]) expect(await db.diagnosticIdentityEvidence.count({ where: { orderId: order.id } })).toBe(1);
    const audits = await db.diagnosticAudit.findMany({ where: { orderId: p.b.id }, orderBy: { id: "asc" } });
    // Current source refuses in ContinuityPair before facts/comparisonRights or SQL.
    // This asserts refusal, not reached historical-ownership discrimination after admission.
    await denied(await post("reviewer", `orders/${p.b.id}/continuity-proofs`, automaticInput(p)));
    expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: p.b.id } })).toBe(0);
    expect(await db.diagnosticReportRecord.count({ where: { orderId: p.b.id } })).toBe(0);
    expect(await db.diagnosticAudit.findMany({ where: { orderId: p.b.id }, orderBy: { id: "asc" } })).toEqual(audits);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } })).toEqual(aSnapshot);
    expect((await get("technician", evidencePath(p.a)).expect(200)).body).toEqual([p.ea]);
    expect(await history(p.a)).toEqual(raw);
  });

  it("binds actual public identities and refuses missing-proof SQL and non-atomic consumption", async () => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(proof.bindings).toMatchObject({
      predecessor: { audience: "listing_public", commissionerId: suite.id("sellerA"), listingBinding: { id: suite.id("listing-A"), sellerId: suite.id("sellerA"), businessId: null,
        identity: { vin: "SYN-VIN-041", brandId: suite.catalog.brandId, modelId: suite.catalog.modelId }, identityDigest: expect.stringMatching(hash) } },
      candidate: { audience: "listing_public", commissionerId: suite.id("sellerB"), publicationAuthorizationHash: expect.stringMatching(hash),
        associationValidatedAt: initialTime.toISOString(), listingBinding: { id: suite.id("listing-B"), sellerId: suite.id("sellerB"), businessId: null,
          publisher: { userId: suite.id("sellerB"), sellerId: suite.id("sellerB"), businessId: null, membershipId: null, generation: expect.stringMatching(hash) } } },
    });
    const { proofId: _, ...missing } = input;
    await denied(await post("technician", `orders/${p.b.id}/reinspections`, missing));
    const state = { id: input.reportId, orderId: p.b.id, audience: "listing_public", status: "draft", templateVersionId: templateId,
      observedAt: p.ib.observation.observedAt, mileageKm: p.ib.observation.mileageKm, findings: [], authorId: suite.id("technician"), reviewerId: null,
      successorOf: p.released.id, correctionReason: input.reason, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null };
    const data = { id: input.reportId, orderId: p.b.id, audience: "listing_public", templateVersionId: templateId!, predecessorId: p.released.id,
      reinspection: true, identityRecordId: p.ib.id, identityRecordHash: p.ib.observationHash, identityEvidenceId: p.eb.id, identityEvidenceHash: p.eb.recordHash, state };
    await expect(db.diagnosticReportRecord.create({ data })).rejects.toThrow(/diagnostic_reinspection_continuity/);
    // Marking a proof consumed without its report/audits must fail at commit and roll back.
    await expect(db.$transaction(async tx => {
      await tx.diagnosticContinuityProof.update({ where: { id: proofId }, data: { consumedReportId: input.reportId, consumedAt: initialTime } });
    })).rejects.toThrow(/diagnostic_public_continuity_consumption_atomic/);
    // A proof and report without the consumption/creation audits also roll back together.
    await expect(db.$transaction(async tx => {
      await tx.diagnosticContinuityProof.update({ where: { id: proofId }, data: { consumedReportId: input.reportId, consumedAt: initialTime } });
      await tx.diagnosticReportRecord.create({ data: { ...data, continuityProofId: proofId, reinspectionOrderVersion: p.b.version } });
    })).rejects.toThrow(/diagnostic_public_continuity_consumption_atomic/);
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(proof);
    await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
  });
  it("permanently refuses the SAME unused proof after the personal publisher is suspended then restored", async () => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
    try {
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: initialTime } });
      const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(invalid.invalidatedAt).toBeInstanceOf(Date);
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } });
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
      expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
      const replacement = await issuePublic(p);
      expect(replacement).not.toBe(proofId);
      await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: replacement }).expect(201);
    } finally { await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } }); }
  });
  it("rechecks B publisher power at independent release while preserving its consumed link and ordinary draft writes", async () => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
    await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
    const consumed = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    try {
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: initialTime } });
      const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
      owned.findings.push(finding.id);
      await post("technician", `reports/${input.reportId}/findings`, { expectedVersion: 0, finding }).expect(201);
      await post("technician", `reports/${input.reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
      await denied(await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 2, action: "finalize" }));
      expect((await get("reviewer", `reports/${input.reportId}`).expect(200)).body).toMatchObject({ version: 2, status: "submitted", findings: [finding] });
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(consumed);
      await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } });
      // A changes after consumption; B publication must never re-run A admission.
      await post("reviewer", `reports/${p.released.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Independent A history" }).expect(201);
      const finalized = await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 2, action: "finalize" });
      const pdfs = await db.diagnosticPdfArtifact.findMany({ where: { reportId: input.reportId } });
      owned.pdfs.push(...pdfs.map(row => row.id));
      for (const row of pdfs) owned.keys.add(`diagnostic-pdf/${input.reportId}/${row.id}.pdf`);
      expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(consumed);
    } finally { await db.user.update({ where: { id: suite.id("sellerB") }, data: { suspendedAt: null } }); }
  });
  it("admits retained withdrawn A without requiring its historical personal seller to publish B", async () => {
    const p = await freshPublicPair();
    await post("reviewer", `reports/${p.released.id}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Retained historical predecessor" }).expect(201);
    const historical = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } });
    try {
      await db.user.update({ where: { id: suite.id("sellerA") }, data: { suspendedAt: initialTime } });
      const proofId = await issuePublic(p,4); const input = publicLink(p,proofId);
      await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
      expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } })).toEqual(historical);
      expect((await get("technician", `reports/${input.reportId}`).expect(200)).body).toMatchObject({ findings: [], orderId: p.b.id, successorOf: p.released.id });
    } finally { await db.user.update({ where: { id: suite.id("sellerA") }, data: { suspendedAt: null } }); }
  });
  it("permanently invalidates the SAME business publisher proof across membership revoke and restore", async () => {
    const businessId = suite.id("public-transfer-business");
    const members = [{ id: suite.id("public-transfer-owner"), userId: suite.id("sellerA"), role: "owner" as const },
      { id: suite.id("public-transfer-sales"), userId: suite.id("sellerB"), role: "sales" as const }];
    // Other-context prerequisites use real identity/Listing rows, never a publisher Session.
    await db.dealership.create({ data: { id: businessId, slug: suite.slugFor("public-transfer-business"), name: "Synthetic public transfer business", status: "active", admissionMode: "synthetic" } });
    try {
      for (const member of members) await db.dealershipMember.create({ data: { ...member, dealershipId: businessId, status: "active" } });
      for (const name of ["A","B"]) await db.listing.update({ where: { id: suite.id(`listing-${name}`) }, data: { businessId } });
      const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p,proofId);
      const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(proof.bindings).toMatchObject({ candidate: { listingBinding: { businessId,
        publisher: { userId: suite.id("sellerB"), membershipId: members[1]!.id, businessId, generation: expect.stringMatching(hash) } } } });
      const memberBefore = await db.dealershipMember.findUniqueOrThrow({ where: { id: members[1]!.id } });
      await db.dealershipMember.update({ where: { id: memberBefore.id }, data: { status: "suspended" } });
      const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(invalid.invalidatedAt).toBeInstanceOf(Date);
      await db.dealershipMember.update({ where: { id: memberBefore.id }, data: { status: "active" } });
      expect(await db.dealershipMember.findUniqueOrThrow({ where: { id: memberBefore.id } })).toEqual(memberBefore);
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
      const replacement = await issuePublic(p);
      await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: replacement }).expect(201);
    } finally {
      // Exact registered business fixture only. Unknown descendants refuse cleanup.
      for (const name of ["A","B"]) await db.listing.update({ where: { id: suite.id(`listing-${name}`) }, data: { businessId: null } });
      const actual = await db.dealershipMember.findMany({ where: { dealershipId: businessId } });
      expect(actual.every(row => members.some(member => member.id === row.id && member.userId === row.userId)), "Unknown business member descendant").toBe(true);
      await db.dealershipMember.deleteMany({ where: { dealershipId: businessId, id: { in: members.map(member => member.id) } } });
      const business = await db.dealership.findUniqueOrThrow({ where: { id: businessId }, include: { _count: true } });
      expect(Object.values(business._count).every(count => count === 0), "Unknown business descendant").toBe(true);
      await db.dealership.delete({ where: { id: businessId } });
    }
  });

  // Boundary fixtures own only these exact other-context rows. Diagnostic state still
  // comes from the original HTTP intake, consent, observation and capture helpers.
  const membershipIntents = new Map<string, ("suspend" | "restore")[]>();
  async function withBusiness(run: (businessId: string, memberId: string) => Promise<void>, differentStoredSeller = false) {
    const businessId = randomUUID(); const ownerId = randomUUID(); const memberId = randomUUID();
    const auditIds: string[] = [];
    membershipIntents.set(businessId, []);
    expect(await db.auditLog.count({ where: { targetType: "Dealership", targetId: businessId } })).toBe(0);
    await db.dealership.create({ data: { id: businessId, slug: `synthetic-${businessId}`, name: "Synthetic public matrix business", status: "active", admissionMode: "synthetic" } });
    try {
      await db.dealershipMember.create({ data: { id: ownerId, dealershipId: businessId, userId: suite.id("sellerA"), role: "owner", status: "active" } });
      await db.dealershipMember.create({ data: { id: memberId, dealershipId: businessId, userId: suite.id("sellerB"), role: "sales", status: "active" } });
      for (const side of ["A", "B"]) await db.listing.update({ where: { id: suite.id(`listing-${side}`) }, data: { businessId,
        ...(side === "B" && differentStoredSeller ? { sellerId: suite.id("sellerA") } : {}) } });
      await run(businessId, memberId);
    } finally {
      // Business membership requests have one precisely shaped audit each. Do not
      // erase unrelated audits merely because they mention this business or actor.
      const audits = await db.auditLog.findMany({ where: { targetType: "Dealership", targetId: businessId } });
      const remaining = [...membershipIntents.get(businessId)!];
      for (const audit of audits) {
        const action = (audit.details as { action: "suspend" | "restore" }).action;
        expect(remaining).toContain(action);
        remaining.splice(remaining.indexOf(action), 1);
        expect(audit).toMatchObject({ actorId: suite.id("sellerA"), action: "BUSINESS_MEMBERSHIP_CHANGED", targetType: "Dealership", targetId: businessId });
        expect(["suspend", "restore"].map(action => ({ targetUserId: suite.id("sellerB"), action }))).toContainEqual(audit.details);
        auditIds.push(audit.id);
      }
      expect(remaining).toHaveLength(0);
      await db.auditLog.deleteMany({ where: { id: { in: auditIds }, actorId: suite.id("sellerA"), targetType: "Dealership", targetId: businessId, action: "BUSINESS_MEMBERSHIP_CHANGED" } });
      for (const [side, seller] of [["A", "sellerA"], ["B", "sellerB"]] as const) await db.listing.update({ where: { id: suite.id(`listing-${side}`) }, data: { businessId: null, sellerId: suite.id(seller) } });
      const actual = await db.dealershipMember.findMany({ where: { dealershipId: businessId } });
      expect(actual.every(row => row.id === ownerId && row.userId === suite.id("sellerA") || row.id === memberId && row.userId === suite.id("sellerB")), "Unknown matrix business member").toBe(true);
      await db.dealershipMember.deleteMany({ where: { dealershipId: businessId, id: { in: [ownerId, memberId] } } });
      const business = await db.dealership.findUniqueOrThrow({ where: { id: businessId }, include: { _count: true } });
      expect(Object.values(business._count).every(count => count === 0), "Unknown matrix business descendant").toBe(true);
      await db.dealership.delete({ where: { id: businessId } });
    }
  }
  const membership = (businessId: string, action: "suspend" | "restore") => {
    const intents = membershipIntents.get(businessId);
    if (!intents) throw new Error("Unregistered business membership mutation");
    intents.push(action);
    return request.post(`/api/v1/business/${businessId}/members`).set(headers("sellerA")).send({ targetUserId: suite.id("sellerB"), action });
  };
  async function submitLinked(reportId: string) {
    const finding = { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null };
    owned.findings.push(finding.id);
    await post("technician", `reports/${reportId}/findings`, { expectedVersion: 0, finding }).expect(201);
    await post("technician", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" }).expect(201);
    return finding;
  }
  async function finalizeLinked(reportId: string) {
    const response = await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
    const documents = await db.diagnosticPdfArtifact.findMany({ where: { reportId } });
    owned.pdfs.push(...documents.map(row => row.id));
    for (const row of documents) owned.keys.add(`diagnostic-pdf/${reportId}/${row.id}.pdf`);
    return response;
  }
  it("publishes B for a different employee of the same business while preserving A's historical commissioner and denying membership staff powers", async () => {
    await withBusiness(async (businessId, memberId) => {
      const p = await freshPublicPair();
      const historical = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } });
      expect(await db.listing.findUniqueOrThrow({ where: { id: suite.id("listing-B") } })).toMatchObject({ sellerId: suite.id("sellerA"), businessId });
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } })).toMatchObject({ commissionerId: suite.id("sellerB"), publicationAuthorization: expect.any(Object), associationValidatedAt: initialTime });
      const body = { predecessorId: p.released.id, expectedPredecessorVersion: 3, expectedOrderVersion: 8,
        predecessorIdentityRecordId: p.ia.id, candidateIdentityRecordId: p.ib.id, linkingTechnicianId: suite.id("technician"),
        method: "comparative_attestation", rationale: "Independent physical identity material", provenanceRecordIds: [p.pa, p.pb] };
      await denied(await post("sellerB", `orders/${p.b.id}/continuity-proofs`, body));
      const proofId = await issuePublic(p); const input = publicLink(p, proofId);
      expect((await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).bindings).toMatchObject({
        predecessor: { commissionerId: suite.id("sellerA") }, candidate: { commissionerId: suite.id("sellerB"), listingBinding: {
          sellerId: suite.id("sellerA"), businessId, publisher: { userId: suite.id("sellerB"), membershipId: memberId } } } });
      await denied(await post("sellerB", `orders/${p.b.id}/reinspections`, input));
      const created = await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
      expect(created.body).toMatchObject({ findings: [], successorOf: p.released.id, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100 });
      const finding = await submitLinked(input.reportId);
      expect((await finalizeLinked(input.reportId)).status).toBe(201);
      expect((await publicGet(`reports/${input.reportId}`).expect(200)).body.id).toBe(input.reportId);
      expect((await publicGet(`reports/${input.reportId}`).expect(200)).body).toMatchObject({ findings: [finding], status: "finalized" });
      expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } })).toEqual(historical);
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.a.id } })).toMatchObject({ commissionerId: suite.id("sellerA") });
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } })).toMatchObject({ commissionerId: suite.id("sellerB") });
      await denied(await get("sellerB", evidencePath(p.a)));
      await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Independent B withdrawal" }).expect(201);
      await publicGet(`reports/${input.reportId}`).expect(404);
    }, true);
  });

  it.each(["A", "B"] as const)("permanently refuses each SAME unused proof after %s Listing identity, seller or status restoration", async side => {
    // Each mutation gets a distinct valid pair and proof, so a previous invalidation
    // cannot make a missing trigger appear covered. Restoring the original row is exact.
    for (const change of [{ year: 2020 }, { sellerId: suite.id("outsider") }, { status: "sold" as const }]) {
      const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p, proofId);
      const id = suite.id(`listing-${side}`); const original = await db.listing.findUniqueOrThrow({ where: { id } });
      try {
        await db.listing.update({ where: { id }, data: change });
        const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
        expect(invalid.invalidatedAt).toBeInstanceOf(Date);
        await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
        expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
        await db.listing.update({ where: { id }, data: { year: original.year, sellerId: original.sellerId, status: original.status, updatedAt: original.updatedAt } });
        expect(await db.listing.findUniqueOrThrow({ where: { id } })).toEqual(original);
        await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
        expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
        const retainedProvenance = side === "B" && ("year" in change || "sellerId" in change) ? await reobservePublicCandidate(p) : [];
        await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
        expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
        const replacement = await issuePublic(p, 3, retainedProvenance);
        expect(replacement).not.toBe(proofId);
        await post("technician", `orders/${p.b.id}/reinspections`, { ...input, expectedOrderVersion: p.b.version, proofId: replacement }).expect(201);
      } finally { await db.listing.update({ where: { id }, data: { year: original.year, sellerId: original.sellerId, status: original.status, updatedAt: original.updatedAt } }); }
    }
  });
  it("permanently refuses the SAME unused proof after business suspension and restoration", async () => {
    await withBusiness(async businessId => {
      const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p, proofId);
      const original = await db.dealership.findUniqueOrThrow({ where: { id: businessId } });
      await db.dealership.update({ where: { id: businessId }, data: { status: "suspended" } });
      const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(invalid.invalidatedAt).toBeInstanceOf(Date);
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      await db.dealership.update({ where: { id: businessId }, data: { status: "active", updatedAt: original.updatedAt } });
      expect(await db.dealership.findUniqueOrThrow({ where: { id: businessId } })).toEqual(original);
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
      const replacement = await issuePublic(p);
      await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: replacement }).expect(201);
    });
  });
  it("refuses missing, unknown and wrong-pair public proofs without creating a successor or consuming a valid proof", async () => {
    const p = await freshPublicPair(); const other = await freshPublicPair();
    const proofId = await issuePublic(p); const wrongPair = await issuePublic(other);
    const input = publicLink(p, proofId); const { proofId: omitted, ...missing } = input;
    expect(omitted).toBe(proofId);
    await denied(await post("technician", `orders/${p.b.id}/reinspections`, missing));
    const before = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    for (const bad of [randomUUID(), wrongPair]) await denied(await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: bad }));
    expect(await db.diagnosticReportRecord.count({ where: { orderId: p.b.id } })).toBe(0);
    expect(await db.diagnosticReportRecord.count({ where: { predecessorId: p.released.id } })).toBe(0);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(before);
    await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
  });
  it("refuses public automatic comparison across changed Listing and commissioner after reaching retained comparative material", async () => {
    const p = await freshPublicPair();
    const listing = await db.listing.findUniqueOrThrow({ where: { id: suite.id("listing-B") } });
    await db.listing.update({ where: { id: listing.id }, data: { sellerId: suite.id("outsider") } });
    try {
      await get("reviewer", comparisonPath(p.b, p.released.id)).expect(200);
      await comparativeBytes(p.b, p.released.id, p.pa, red); await comparativeBytes(p.b, p.released.id, p.pb, blue);
      await denied(await post("reviewer", `orders/${p.b.id}/continuity-proofs`, { predecessorId: p.released.id, expectedPredecessorVersion: 3,
        expectedOrderVersion: 8, predecessorIdentityRecordId: p.ia.id, candidateIdentityRecordId: p.ib.id, linkingTechnicianId: suite.id("technician"), method: "automatic_normalized_vin", rationale: "Equal raw VIN does not authorize changed public ownership", provenanceRecordIds: [p.pa, p.pb] }));
      expect(await db.diagnosticContinuityProof.count({ where: { candidateOrderId: p.b.id } })).toBe(0);
      expect(await db.diagnosticReportRecord.count({ where: { orderId: p.b.id } })).toBe(0);
    } finally {
      await db.listing.update({ where: { id: listing.id }, data: { sellerId: listing.sellerId } });
    }
    const retainedProvenance = await reobservePublicCandidate(p);
    await issuePublic(p, 3, retainedProvenance);
  });

  // Observe actual PostgreSQL lock waits outside the holder transaction, with the
  // existing 500-query bound. Release on every failure before draining requests.
  async function contendPublisher(businessId: string, operation: () => PromiseLike<supertest.Response>) {
    let revoke: Promise<supertest.Response> | undefined; let admission: Promise<supertest.Response> | undefined;
    let results: Promise<PromiseSettledResult<supertest.Response>[]> | undefined;
    try {
      await db.$transaction(async tx => {
        const [holder] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM users WHERE id=${suite.id("sellerB")} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM dealerships WHERE id=${businessId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM listings WHERE id=${suite.id("listing-B")} FOR UPDATE`;
        const wait = async (count: number) => {
          for (let attempt = 0; ; attempt++) {
            const [observed] = await db.$queryRaw<{ waiting: number }[]>`WITH direct AS (SELECT activity.pid FROM pg_stat_activity activity WHERE ${holder!.pid}::int = ANY(pg_blocking_pids(activity.pid)))
              SELECT ((SELECT count(*) FROM direct) + (SELECT count(*) FROM pg_stat_activity activity WHERE activity.pid NOT IN (SELECT pid FROM direct) AND pg_blocking_pids(activity.pid) && ARRAY(SELECT pid FROM direct)))::int AS waiting`;
            if (observed!.waiting === count) return;
            if (attempt === 500) throw new Error(`Only ${observed!.waiting} of ${count} publisher requests reached the User/Business lock holder`);
          }
        };
        revoke = Promise.resolve(membership(businessId, "suspend"));
        // Attach rejection handlers immediately; keep the original failure for the caller.
        results = Promise.allSettled([revoke]);
        await wait(1);
        admission = Promise.resolve(operation()); results = Promise.allSettled([revoke, admission]);
        await wait(2);
      });
    } catch (failure) { await results; throw failure; }
    const settled = await results!;
    const rejected = settled.find(result => result.status === "rejected");
    if (rejected) throw rejected.reason;
    return settled.map(result => (result as PromiseFulfilledResult<supertest.Response>).value);
  }
  it("serializes public consume against real business publisher membership revocation without stale release", async () => {
    await withBusiness(async businessId => {
      const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p, proofId);
      const [revoked, consumed] = await contendPublisher(businessId, () => post("technician", `orders/${p.b.id}/reinspections`, input));
      expect(revoked!.status).toBe(201); expect(revoked!.body).toEqual({ ok: true });
      expect(consumed!.status).toBe(403);
      const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      await denied(consumed!);
      expect(proof).toMatchObject({ consumedReportId: null, consumedAt: null, invalidatedAt: expect.any(Date) });
      expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
      await publicGet(`reports/${input.reportId}`).expect(404);
      await membership(businessId, "restore").expect(201);
      await denied(await post("technician", `orders/${p.b.id}/reinspections`, input));
      await post("technician", `orders/${p.b.id}/reinspections`, { ...input, proofId: await issuePublic(p) }).expect(201);
    });
  });
  it("serializes independent B finalization against real business publisher membership revocation", async () => {
    await withBusiness(async businessId => {
      const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p, proofId);
      await post("technician", `orders/${p.b.id}/reinspections`, input).expect(201);
      const finding = await submitLinked(input.reportId);
      const consumedProof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
      const [revoked, finalized] = await contendPublisher(businessId, () => finalizeLinked(input.reportId));
      expect(revoked!.status).toBe(201); expect(revoked!.body).toEqual({ ok: true });
      expect(finalized!.status).toBe(403);
      const current = (await get("technician", `reports/${input.reportId}`).expect(200)).body;
      expect(current).toMatchObject({ findings: [finding], status: "submitted", version: 2 });
      await denied(finalized!);
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(consumedProof);
      await membership(businessId, "restore").expect(201);
      expect((await finalizeLinked(input.reportId)).status).toBe(201);
      expect((await publicGet(`reports/${input.reportId}`).expect(200)).body.id).toBe(input.reportId);
      await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Publisher race cleanup through product" }).expect(201);
      await publicGet(`reports/${input.reportId}`).expect(404);
    });
  });

  async function generateDocuments(reportId: string, locales: readonly string[], maintain = false) {
    const artifacts = await db.diagnosticPdfArtifact.findMany({ where: { reportId, locale: { in: [...locales] } }, orderBy: { locale: "asc" } });
    expect(artifacts.map(row => row.locale)).toEqual([...locales].sort());
    expect(artifacts.every(row => owned.pdfs.includes(row.id) && owned.keys.has(row.objectKey))).toBe(true);
    const databases = inject("apiTestDatabases");
    if (!databases) throw new Error("PDF isolation refused: missing injected apiTestDatabases");
    const pool = Number(process.env["VITEST_POOL_ID"]);
    const expectedUrl = workerUrls(databases, pool).databaseUrl;
    const expectedName = workerDatabaseName(databases.prefix, pool);
    const workerRoot = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const assert = require('node:assert/strict');
      const { randomUUID } = require('node:crypto');
      const { readFile } = require('node:fs/promises');
      const { PrismaService } = require('@auto-tm/db');
      const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
      const { DiagnosticArtifactWorker } = require('./src/jobs/diagnostics/DiagnosticArtifactWorker.ts');
      const { S3DiagnosticArtifactObjects } = require('./src/jobs/diagnostics/S3DiagnosticArtifactObjects.ts');
      async function main() {
        const db = new PrismaService(); let s3;
        try {
          assert.equal(process.env.GITHUB_ACTIONS, 'true', 'PDF isolation refused: hosted disposable services required');
          assert.equal(process.env.DATABASE_URL, ${JSON.stringify(expectedUrl)}, 'PDF isolation refused: unexpected worker URL');
          const expected = new URL(${JSON.stringify(expectedUrl)});
          assert.notEqual(expected.pathname, new URL(${JSON.stringify(databases.baseDatabaseUrl)}).pathname, 'PDF isolation refused: base database');
          assert.match(expected.hostname, /^(localhost|127[.]0[.]0[.]1)$/);
          assert.deepEqual(await db.$queryRawUnsafe('SELECT current_database() AS name'), [{ name: ${JSON.stringify(expectedName)} }]);
          const endpoint = process.env.MINIO_ENDPOINT || '';
          assert.match(endpoint, new RegExp('^http://(localhost|127[.]0[.]0[.]1):[0-9]+$'), 'PDF isolation refused: hosted-local MinIO required');
          s3 = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin', secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin' } });
          await s3.send(new HeadBucketCommand({ Bucket: 'diagnostic-test-private' }));
          const artifacts = ${JSON.stringify(artifacts)};
          for (const artifact of artifacts) {
            assert.deepEqual(JSON.parse(JSON.stringify(await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: artifact.id } }))), artifact);
            assert.equal(artifact.reportId, ${JSON.stringify(reportId)});
            assert.equal(artifact.objectKey, 'diagnostic-pdf/' + artifact.reportId + '/' + artifact.id + '.pdf');
          }
          const [regular, bold] = await Promise.all(['Regular', 'Bold'].map(weight => readFile('./assets/fonts/NotoSans-' + weight + '.ttf')));
          const worker = new DiagnosticArtifactWorker(db, new S3DiagnosticArtifactObjects(s3, 'diagnostic-test-private'), { regular, bold },
            { now: () => new Date(${JSON.stringify(initialTime.toISOString())}), id: randomUUID, enabled: () => true });
          if (${JSON.stringify(maintain)}) {
            // execute() selects globally, including cleanup. Refuse all foreign
            // diagnostic rows/objects before either generation or maintenance.
            for (const [model, ids] of [
              ['inspectionOrder', ${JSON.stringify(owned.orders)}],
              ['diagnosticReportRecord', ${JSON.stringify(owned.reports)}],
              ['diagnosticPdfArtifact', ${JSON.stringify(owned.pdfs)}],
              ['diagnosticIdentityRecord', ${JSON.stringify(owned.raw)}],
              ['diagnosticIdentityEvidence', ${JSON.stringify(owned.evidence)}],
              ['diagnosticIdentityProvenance', ${JSON.stringify(owned.provenance)}],
              ['diagnosticContinuityProof', ${JSON.stringify(owned.proofs)}],
            ]) assert.equal(await db[model].count({ where: { id: { notIn: ids } } }), 0, 'PDF maintenance refused: unregistered ' + model);
            assert.equal(await db.diagnosticEvidence.count(), 0, 'PDF maintenance refused: unexpected finding evidence');
            for (const model of ['diagnosticPdfArtifact', 'diagnosticIdentityProvenance']) {
              for (const row of await db[model].findMany()) assert.ok(row.objectKey === null || ${JSON.stringify([...owned.keys])}.includes(row.objectKey), 'PDF maintenance refused: unregistered object');
            }
          }
          for (const artifact of artifacts) assert.equal(await worker.generate(artifact.id), true, 'Expected exact artifact generation');
          // One ordinary bounded pass, even when EN is already ready. Do not
          // reset its state or manufacture a replacement intent in test setup.
          if (${JSON.stringify(maintain)}) await worker.execute();
        } finally { s3?.destroy(); await db.onModuleDestroy(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    await promisify(execFile)(process.execPath, ["-e", script], { cwd: workerRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve(workerRoot, "tsconfig.json") }, timeout: 60000, killSignal: "SIGKILL" });
    if (maintain) {
      // Register only ids returned by B's public list, as at finalization. A
      // production-created replacement must also pass exact teardown guards.
      const documents = await publicGet(`reports/${reportId}/documents`).expect(200);
      for (const document of documents.body) {
        expect(document.id).toMatch(uuid);
        if (!owned.pdfs.includes(document.id)) owned.pdfs.push(document.id);
        owned.keys.add(`diagnostic-pdf/${reportId}/${document.id}.pdf`);
      }
    }
  }

  it.each(["draft", "finalized"] as const)("keeps different-commissioner %s B usable after A-only product account purge without disclosing or resurrecting A's restricted material", async phase => {
    const erasureSeller = phase === "draft" ? "erasureSeller" : "erasurePdfSeller";
    const listingId = suite.id(`listing-erasure-A-${phase}`);
    expect(await db.listing.count({ where: { id: listingId } })).toBe(0);
    listings.push({ id: listingId, sellerId: suite.id(erasureSeller) });
    await db.listing.create({ data: { id: listingId, sellerId: suite.id(erasureSeller), brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", vin: "SYN-VIN-041", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    const observation: Observation = { observedAt: "2026-10-20T12:00:00.000Z", mileageKm: 124000, method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const a = await visitOnListing(observation, erasureSeller, listingId); const [ia] = await history(a);
    const pa = randomUUID(); await verified(a, pa, red); const ea = await capture(a, ia!, pa, red); const released = await release(a);
    const listingB = await isolatedListing("sellerB");
    const b = await visitOnListing({ ...observation, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100 }, "sellerB", listingB);
    const [ib] = await history(b); const pb = randomUUID(); await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    const p = { a, b, ia: ia!, ib: ib!, pa, pb, ea, eb, released };
    const proofId = await issuePublic(p); const input = publicLink(p, proofId);
    const created = await post("technician", `orders/${b.id}/reinspections`, input).expect(201);
    let finding: Awaited<ReturnType<typeof submitLinked>> | undefined;
    let issuedBytes: Buffer | undefined;
    let issuedExposesPredecessor = false;
    let issuedArtifact: Awaited<ReturnType<typeof db.diagnosticPdfArtifact.findUniqueOrThrow>> | undefined;
    const storage = app.get<DiagnosticObjects>(DIAGNOSTIC_OBJECTS);
    if (phase === "finalized") {
      finding = await submitLinked(input.reportId);
      expect((await finalizeLinked(input.reportId)).status).toBe(201);
      await generateDocuments(input.reportId, ["en"]);
      const issued = await publicGet(`reports/${input.reportId}/documents/en`).expect(200);
      privateNoStore(issued);
      expect(issued.headers["content-type"]).toContain("application/pdf");
      issuedBytes = Buffer.from(issued.body);
      // This issued copy is historical. Erasure cannot recall or overwrite it.
      const text = await diagnosticPdfText(issuedBytes);
      expect(text).toContain(input.reportId);
      issuedExposesPredecessor = text.includes(released.id);
      issuedArtifact = await db.diagnosticPdfArtifact.findFirstOrThrow({ where: { reportId: input.reportId, locale: "en" } });
    }
    const retryBeforeErasure = (await post("technician", `orders/${b.id}/reinspections`, input).expect(201)).body;
    const beforeB = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } });
    const orderB = await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } });
    const ownEvidence = await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: eb.id } });
    const ownProvenance = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: pb } });
    const beforeA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: released.id } });
    const auditsB = await db.diagnosticAudit.findMany({ where: { orderId: b.id }, orderBy: { id: "asc" } });
    expect(orderB.commissionerId).toBe(suite.id("sellerB"));
    const restricted = [evidencePath(a), `orders/${a.id}/identity-records`, provenancePath(a, pa),
      comparisonPath(b, released.id), `orders/${b.id}/continuity-proofs/${proofId}`];
    for (const path of restricted) await denied(await get("sellerB", path));
    const targetAudits = await db.diagnosticAudit.findMany({ where: { actorId: suite.id(erasureSeller) } });
    expect(targetAudits.every(row => row.centerId === centerId && row.orderId === a.id)).toBe(true);
    for (const row of targetAudits) erasedAuditIds.add(row.id);
    expect(await db.measurementInvestigationExport.count()).toBe(0);
    expect(await db.measurementState.count({ where: { key: { startsWith: "inventory_baseline:" } } })).toBe(0);
    await request.delete("/api/v1/me").set(headers(erasureSeller)).expect(204, "");
    const scheduled = await db.user.findUniqueOrThrow({ where: { id: suite.id(erasureSeller) } });
    expect(scheduled.deletionScheduledAt?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
    expect(await db.session.count({ where: { userId: scheduled.id } })).toBe(0);
    expect(await db.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ status: "archived", archivedByDeletion: true });
    // The production job is global at selection. Refuse before mutation unless
    // every due account and stale OTP belongs to this exact registered fixture.
    // No AppModule, scheduler, service override or global purge switch is used.
    const workerRoot = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const assert = require('node:assert/strict');
      const { PrismaService } = require('@auto-tm/db');
      const { PurgeExpiredAccounts } = require('./src/jobs/PurgeExpiredAccounts.ts');
      async function main() {
        const db = new PrismaService();
        try {
          assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Purge isolation refused: hosted disposable services required');
          const url = new URL(process.env.DATABASE_URL);
          assert.match(url.hostname, /^(localhost|127[.]0[.]0[.]1)$/);
          const now = new Date(${JSON.stringify(scheduled.deletionScheduledAt!.toISOString())});
          const target = ${JSON.stringify(scheduled.id)};
          assert.deepEqual(await db.user.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } }), [{ id: target }], 'Purge isolation refused: foreign due account');
          const stale = await db.otpRequest.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } }, select: { userId: true, destination: true } });
          assert.equal(stale.every(row => row.userId === target || row.userId === null && row.destination === ${JSON.stringify(suite.phone(erasureSeller))}), true, 'Purge isolation refused: foreign stale OTP');
          assert.deepEqual((await db.inspectionOrder.findMany({ where: { commissionerId: target }, select: { id: true } })), [{ id: ${JSON.stringify(a.id)} }], 'Purge isolation refused: unknown commissioned order');
          assert.equal(await db.diagnosticReportRecord.count({ where: { OR: [{ state: { path: ['authorId'], equals: target } }, { state: { path: ['reviewerId'], equals: target } }] } }), 0, 'Purge isolation refused: staff descendants');
          assert.deepEqual(await new PurgeExpiredAccounts(db).execute({ now }), { purgedCount: 1 });
        } finally { await db.$disconnect(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    // Register the sole permitted severed ownership before a worker assertion can
    // fail after commit. Cleanup still demands its exact erasedAt and null pins.
    erasedOrders.set(a.id, scheduled.deletionScheduledAt!);
    const purge = () => promisify(execFile)(process.execPath, ["-e", script], { cwd: workerRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve(workerRoot, "tsconfig.json") }, timeout: 30000, killSignal: "SIGKILL" });
    if (phase === "finalized") {
      const read = storage.read.bind(storage);
      let erasedDuringRead = false;
      const paused = vi.spyOn(storage, "read").mockImplementationOnce(async (...args) => {
        const bytes = await read(...args);
        await purge(); erasedDuringRead = true;
        return bytes;
      });
      try {
        const raced = await publicGet(`reports/${input.reportId}/documents/en`);
        expect(erasedDuringRead, "Erasure must occur after real storage I/O").toBe(true);
        // Soft assertions still fail the case, while allowing hosted RED to reach
        // newly generated PDFs even if this historical download also exposes A.
        if (issuedExposesPredecessor) {
          if (raced.status === 200) {
            const text = await diagnosticPdfText(Buffer.from(raced.body));
            expect(text).toContain(input.reportId);
            expect.soft(text, "Post-I/O gate must not deliver erased predecessor content").not.toContain(released.id);
            expect.soft(Buffer.from(raced.body)).not.toEqual(issuedBytes);
          } else expect.soft(raced.headers["content-type"]).not.toContain("application/pdf");
        } else if (raced.status === 200) expect(await diagnosticPdfText(Buffer.from(raced.body))).not.toContain(released.id);
      } finally { paused.mockRestore(); }
    } else await purge();
    expect(await db.user.findUniqueOrThrow({ where: { id: scheduled.id } })).toMatchObject({ phone: null, deletionScheduledAt: null });
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ commissionerId: null, listingId: null,
      erasedAt: scheduled.deletionScheduledAt, observedVehicle: null, physicalAuthorization: null, publicationAuthorization: null });
    const erasedA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: released.id } });
    expect(erasedA).toMatchObject({ erasedAt: scheduled.deletionScheduledAt, identityRecordId: null, identityEvidenceId: null,
      snapshot: beforeA.snapshot, snapshotHash: beforeA.snapshotHash });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: ia!.id } })).toMatchObject({ observation: null, observationHash: null, recordedById: null, erasedAt: scheduled.deletionScheduledAt });
    expect(await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: ea.id } })).toMatchObject({ identifiers: null, provenance: null, rights: null, recordHash: null, erasedAt: scheduled.deletionScheduledAt });
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: pa } })).toMatchObject({ state: "cleanup_pending", rights: null, erasedAt: scheduled.deletionScheduledAt, cleanupRequestedAt: scheduled.deletionScheduledAt });
    expect((await db.diagnosticPdfArtifact.findMany({ where: { reportId: released.id } })).map(row => ({ state: row.state, cleanupRequestedAt: row.cleanupRequestedAt })))
      .toEqual([1, 2, 3].map(() => ({ state: "cleanup_pending", cleanupRequestedAt: scheduled.deletionScheduledAt })));
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: proofId } })).toBeNull();
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } })).toEqual(orderB);
    // Proof erasure removes restricted A/B material, retaining B's immutable
    // original consumption pointer and own state, snapshot and authorship.
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } })).toEqual(beforeB);
    expect(await db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: eb.id } })).toEqual(ownEvidence);
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: pb } })).toEqual(ownProvenance);
    expect(await history(b)).toEqual([ib]);
    expect((await get("technician", evidencePath(b)).expect(200)).body).toEqual([eb]);
    expect((await get("technician", provenancePath(b, pb)).expect(200)).body.toString("base64")).toBe(blue.output);
    for (const who of ["reviewer", "sellerB"] as const) {
      for (const path of [...restricted, `reports/${released.id}`, `reports/${released.id}/documents`, `reports/${released.id}/documents/en`]) {
        const response = await get(who, path); await denied(response);
        for (const secret of [pa, ea.id, proofId, red.sha256, key(pa, red), ia!.observationHash, ea.recordHash]) expect(response.text).not.toContain(secret);
      }
    }
    await publicGet(`reports/${released.id}`).expect(404); await publicGet(`listings/${listingId}`).expect(404);
    expect((await post("technician", `orders/${b.id}/reinspections`, input).expect(201)).body).toEqual(retryBeforeErasure);
    if (phase === "draft") expect(retryBeforeErasure).toEqual(created.body);
    expect(await db.diagnosticAudit.findMany({ where: { orderId: b.id }, orderBy: { id: "asc" } })).toEqual(auditsB);
    if (phase === "draft") {
      finding = await submitLinked(input.reportId);
      expect((await post("technician", `orders/${b.id}/reinspections`, input).expect(201)).body).toMatchObject({ status: "submitted", version: 2, findings: [finding] });
      expect((await finalizeLinked(input.reportId)).status).toBe(201);
    }
    const releasedB = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } });
    const documents = await publicGet(`reports/${input.reportId}/documents`).expect(200);
    privateNoStore(documents);
    expect(documents.body.map((row: { locale: string }) => row.locale).sort()).toEqual(["en", "ru", "tk"]);
    expect(JSON.stringify(documents.body)).not.toMatch(/objectKey|sha256|diagnostic-pdf\//);
    const newLocales = phase === "draft" ? ["tk", "ru", "en"] as const : ["tk", "ru"] as const;
    await generateDocuments(input.reportId, newLocales, phase === "finalized");
    if (issuedBytes && issuedArtifact) {
      expect(await db.diagnosticPdfArtifact.findUniqueOrThrow({ where: { id: issuedArtifact.id } })).toEqual(issuedArtifact);
      expect(Buffer.from(await storage.read(issuedArtifact.objectKey, issuedArtifact.sizeBytes!, issuedArtifact.sha256!))).toEqual(issuedBytes);
    }
    const recoveredLocales = ["tk", "ru", "en"] as const;
    const readyDocuments = await publicGet(`reports/${input.reportId}/documents`).expect(200);
    for (const locale of recoveredLocales) {
      const downloaded = await publicGet(`reports/${input.reportId}/documents/${locale}`);
      const descriptor = readyDocuments.body.find((row: { locale: string }) => row.locale === locale);
      if (downloaded.status !== 200) {
        expect.soft(downloaded.headers["content-type"]).not.toContain("application/pdf");
        expect.soft(descriptor?.state).not.toBe("ready");
      }
      expect(downloaded.status, `Current ${locale} PDF must recover after ordinary artifact maintenance`).toBe(200);
      privateNoStore(downloaded);
      expect(downloaded.headers["content-type"]).toContain("application/pdf");
      expect(descriptor).toMatchObject({ state: "ready" });
      const text = await diagnosticPdfText(Buffer.from(downloaded.body));
      for (const own of [input.reportId, finding!.id, templateId, "2026-10-21T11:00:00.000Z", "124100 km"]) expect(text).toContain(own);
      for (const secret of [released.id, released.findings[0].id, pa, ea.id, proofId, red.sha256, key(pa, red), ia!.observationHash, ea.recordHash]) {
        expect.soft(text, `Current ${locale} PDF must not disclose erased A material`).not.toContain(secret);
      }
      // The locale route selects the current artifact, not a historical id.
      if (locale === "en" && issuedExposesPredecessor && issuedArtifact) {
        expect(descriptor?.id, "Safe replacement has its own artifact identity").not.toBe(issuedArtifact.id);
        expect(Buffer.from(downloaded.body)).not.toEqual(issuedBytes);
      }
    }
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } })).toEqual(releasedB);
    const publicB = await publicGet(`reports/${input.reportId}`).expect(200);
    expect.soft(publicB.body).toMatchObject({ findings: [finding], observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100, templateVersionId: templateId, template: definition, successorOf: null });
    for (const secret of [released.id, released.findings[0].id, pa, ea.id, proofId, red.sha256, key(pa, red), ia!.observationHash, ea.recordHash]) {
      expect.soft(publicB.text).not.toContain(secret);
      expect.soft(JSON.stringify(readyDocuments.body)).not.toContain(secret);
    }
    expect((await publicGet(`listings/${listingB}`).expect(200)).body.reportId).toBe(input.reportId);
    await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Surviving B independent withdrawal" }).expect(201);
    await publicGet(`listings/${listingB}`).expect(404); await publicGet(`listings/${listingId}`).expect(404);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: released.id } })).toEqual(erasedA);
  });

  async function isolatedListing(seller: "sellerA" | "sellerB", year: number | null = null) {
    const id = randomUUID(); const sellerId = suite.id(seller);
    listings.push({ id, sellerId });
    await new PrismaListingRepository(db).save(Listing.create({ id, publicNumber: 0, sellerId, brandId: suite.catalog.brandId, modelId: suite.catalog.modelId,
      cityId: suite.catalog.cityId, status: "active", vin: "SYN-VIN-041", ...(year === null ? {} : { year }), priceAmount: 100000, priceCurrency: "TMT",
      allowCalls: true, allowChat: true, publishedAt: now }));
    return id;
  }
  it("admits changed Listing identity and id through B's fresh ordinary authorization and association", async () => {
    const observation: Observation = { observedAt: "2026-10-20T12:00:00.000Z", mileageKm: 124000, method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const listingA = await isolatedListing("sellerA", 2019); const listingB = await isolatedListing("sellerB", 2020);
    expect(listingB).not.toBe(listingA);
    const a = await visitOnListing(observation, "sellerA", listingA); const [ia] = await history(a);
    const pa = randomUUID(); await verified(a, pa, red); const ea = await capture(a, ia!, pa, red); const released = await release(a);
    const b = await visitOnListing({ ...observation, mileageKm: 124100 }, "sellerB", listingB); const [ib] = await history(b);
    const pb = randomUUID(); await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    const p = { a, b, ia: ia!, ib: ib!, pa, pb, ea, eb, released };
    const proofId = await issuePublic(p); const input = publicLink(p, proofId);
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(proof.bindings).toMatchObject({ predecessor: { listingBinding: { id: listingA, sellerId: suite.id("sellerA"), identity: { year: 2019 } } },
      candidate: { listingBinding: { id: listingB, sellerId: suite.id("sellerB"), identity: { year: 2020 } }, publicationAuthorization: expect.any(Object), associationValidatedAt: initialTime.toISOString() } });
    await post("technician", `orders/${b.id}/reinspections`, input).expect(201);
    await submitLinked(input.reportId); expect((await finalizeLinked(input.reportId)).status).toBe(201);
    expect((await publicGet(`listings/${listingB}`).expect(200)).body).toEqual({ listingId: listingB, reportId: input.reportId,
      observedAt: observation.observedAt, mileageKm: 124100, synthetic: true });
    expect((await publicGet(`listings/${listingA}`).expect(200)).body.reportId).toBe(released.id);
    await post("reviewer", `reports/${input.reportId}/transition`, { expectedVersion: 3, action: "withdraw", reason: "Changed identity visit withdrawn independently" }).expect(201);
    await publicGet(`listings/${listingB}`).expect(404);
  });
  it.each(["raw observation", "structured evidence correction"] as const)("refuses the SAME public proof after ordinary %s changes its bound source", async source => {
    const p = await freshPublicPair(); const proofId = await issuePublic(p); const input = publicLink(p, proofId);
    const historical = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } });
    if (source === "raw observation") {
      const changed = await post("technician", `orders/${p.b.id}/vehicle`, { expectedVersion: 8, ...p.ib.observation, mileageKm: 124101 }).expect(201);
      expect(changed.body).toMatchObject({ version: 9, vehicleMatched: true, observedVehicle: { mileageKm: 124101 } });
      const raw = await history(p.b); owned.raw.push(...raw.filter(row => row.id !== p.ib.id).map(row => row.id));
      expect(raw).toHaveLength(2); expect(raw[0]).toEqual(p.ib); expect(raw[1]).toMatchObject({ orderVersion: 9, observation: { mileageKm: 124101 } });
    } else {
      const provenance = randomUUID(); await verified(p.b, provenance, blue, rightsB);
      const id = randomUUID(); owned.evidence.push(id);
      const correction = await post("technician", evidencePath(p.b), { id, expectedOrderVersion: 8, identityRecordId: p.ib.id,
        identifiers: identifiers(provenance, "SYN-VIN-041"), rights: rightsB, correction: { supersedesId: p.eb.id, explanation: "Independent second stamp confirms the recorded vehicle" } }).expect(201);
      expect(correction.body).toMatchObject({ id, orderVersion: 9, correction: { supersedesId: p.eb.id } });
      expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: p.b.id } })).toMatchObject({ version: 9, identityEvidenceGeneration: 2 });
    }
    const invalid = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(invalid.invalidatedAt).toBeInstanceOf(Date);
    await denied(await post("technician", `orders/${p.b.id}/reinspections`, { ...input, expectedOrderVersion: 9 }));
    expect(await db.diagnosticReportRecord.findUnique({ where: { id: input.reportId } })).toBeNull();
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: p.released.id } })).toEqual(historical);
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } })).toEqual(invalid);
  });


  // #923 append-only journey. Product account erasure must not rerun A admission for B recovery.
  it("recovers only the existing B result after A-only product erasure removes the restricted handoff", async () => {
    const erasureSeller = "handoffErasureSeller" as const;
    const listingId = suite.id("listing-erasure-A-handoff");
    expect(await db.listing.count({ where: { id: listingId } })).toBe(0);
    listings.push({ id: listingId, sellerId: suite.id(erasureSeller) });
    await db.listing.create({ data: { id: listingId, sellerId: suite.id(erasureSeller), brandId: suite.catalog.brandId,
      modelId: suite.catalog.modelId, cityId: suite.catalog.cityId, status: "active", vin: "SYN-VIN-041", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    const observation: Observation = { observedAt: "2026-10-20T12:00:00.000Z", mileageKm: 124000, method: "vin", vin: "SYN-VIN-041", manualReference: null };
    const a = await visitOnListing(observation, erasureSeller, listingId); const [ia] = await history(a);
    const pa = randomUUID(); await verified(a, pa, red); const ea = await capture(a, ia!, pa, red); const released = await release(a);
    const listingB = await isolatedListing("sellerB");
    const b = await visitOnListing({ ...observation, observedAt: "2026-10-21T11:00:00.000Z", mileageKm: 124100 }, "sellerB", listingB);
    const [ib] = await history(b); const pb = randomUUID(); await verified(b, pb, blue, rightsB); const eb = await capture(b, ib!, pb, blue, rightsB);
    const p = { a, b, ia: ia!, ib: ib!, pa, pb, ea, eb, released };
    const input = publicLink(p, randomUUID());
    // Remove A access before issuing a replacement; the selected technician remains B-only.
    await post("reception", `orders/${a.id}/assignments`, { expectedVersion: await version(a), userId: suite.id("technician"), capability: "diagnostics.technician", active: false }).expect(201);
    const handoffProofId = await issuePublic(p);
    const path = `orders/${b.id}/continuity-handoffs`;
    expect((await get("technician", path).expect(200)).body.handoffs).toEqual([{ proofId: handoffProofId, status: "usable", expectedOrderVersion: b.version }]);
    await denied(await get("technician", `orders/${b.id}/continuity-proofs/${handoffProofId}`));
    const command = { reportId: input.reportId, expectedOrderVersion: input.expectedOrderVersion, reason: input.reason };
    const commandPath = `${path}/${handoffProofId}/consume`;
    expect((await post("technician", commandPath, command).expect(201)).body).toEqual({ reportId: input.reportId });
    const beforeB = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } });
    const auditsB = await db.diagnosticAudit.findMany({ where: { orderId: b.id }, orderBy: { id: "asc" } });
    const targetAudits = await db.diagnosticAudit.findMany({ where: { actorId: suite.id(erasureSeller) } });
    expect(targetAudits.every(row => row.centerId === centerId && row.orderId === a.id)).toBe(true);
    for (const row of targetAudits) erasedAuditIds.add(row.id);
    expect(await db.measurementInvestigationExport.count()).toBe(0);
    expect(await db.measurementState.count({ where: { key: { startsWith: "inventory_baseline:" } } })).toBe(0);
    await request.delete("/api/v1/me").set(headers(erasureSeller)).expect(204, "");
    const scheduled = await db.user.findUniqueOrThrow({ where: { id: suite.id(erasureSeller) } });
    expect(scheduled.deletionScheduledAt?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
    expect(await db.session.count({ where: { userId: scheduled.id } })).toBe(0);
    expect(await db.listing.findUniqueOrThrow({ where: { id: listingId } })).toMatchObject({ status: "archived", archivedByDeletion: true });
    // The production job is global at selection. Refuse before mutation unless
    // every due account and stale OTP belongs to this exact registered fixture.
    // No AppModule, scheduler, service override or global purge switch is used.
    const workerRoot = resolve(__dirname, "../../../../../worker");
    const script = `
      require('reflect-metadata'); require('tsx/cjs');
      const assert = require('node:assert/strict');
      const { PrismaService } = require('@auto-tm/db');
      const { PurgeExpiredAccounts } = require('./src/jobs/PurgeExpiredAccounts.ts');
      async function main() {
        const db = new PrismaService();
        try {
          assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Purge isolation refused: hosted disposable services required');
          const url = new URL(process.env.DATABASE_URL);
          assert.match(url.hostname, /^(localhost|127[.]0[.]0[.]1)$/);
          const now = new Date(${JSON.stringify(scheduled.deletionScheduledAt!.toISOString())});
          const target = ${JSON.stringify(scheduled.id)};
          assert.deepEqual(await db.user.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } }), [{ id: target }], 'Purge isolation refused: foreign due account');
          const stale = await db.otpRequest.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } }, select: { userId: true, destination: true } });
          assert.equal(stale.every(row => row.userId === target || row.userId === null && row.destination === ${JSON.stringify(suite.phone(erasureSeller))}), true, 'Purge isolation refused: foreign stale OTP');
          assert.deepEqual((await db.inspectionOrder.findMany({ where: { commissionerId: target }, select: { id: true } })), [{ id: ${JSON.stringify(a.id)} }], 'Purge isolation refused: unknown commissioned order');
          assert.equal(await db.diagnosticReportRecord.count({ where: { OR: [{ state: { path: ['authorId'], equals: target } }, { state: { path: ['reviewerId'], equals: target } }] } }), 0, 'Purge isolation refused: staff descendants');
          assert.deepEqual(await new PurgeExpiredAccounts(db).execute({ now }), { purgedCount: 1 });
        } finally { await db.$disconnect(); }
      }
      void main().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    // Register the sole permitted severed ownership before a worker assertion can
    // fail after commit. Cleanup still demands its exact erasedAt and null pins.
    erasedOrders.set(a.id, scheduled.deletionScheduledAt!);
    const purge = () => promisify(execFile)(process.execPath, ["-e", script], { cwd: workerRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: resolve(workerRoot, "tsconfig.json") }, timeout: 30000, killSignal: "SIGKILL" });
    await purge();
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: handoffProofId } })).toBeNull();
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } })).toEqual(beforeB);
    const recovered = await get("technician", path).expect(200); privateNoStore(recovered);
    expect(recovered.body).toEqual({ handoffs: [], result: { proofId: handoffProofId, reportId: input.reportId }, nextCursor: null, scope: "current_b_owned_handoffs" });
    expect((await post("technician", commandPath, command).expect(201)).body).toEqual({ reportId: input.reportId });
    for (const changed of [{ ...command, reason: "Changed" }, { ...command, expectedOrderVersion: command.expectedOrderVersion + 1 }])
      privateNoStore(await post("technician", commandPath, changed).expect(409));
    expect(await db.diagnosticAudit.findMany({ where: { orderId: b.id }, orderBy: { id: "asc" } })).toEqual(auditsB);
    for (const who of ["reviewer", "technician"] as const) await denied(await get(who, `orders/${b.id}/continuity-proofs/${handoffProofId}`));
    await submitLinked(input.reportId);
    expect((await finalizeLinked(input.reportId)).status).toBe(201);
    expect((await publicGet(`reports/${input.reportId}`).expect(200)).body).toMatchObject({ id: input.reportId, successorOf: null, status: "finalized" });
    await post("reception", `orders/${b.id}/assignments`, { expectedVersion: await version(b), userId: suite.id("technician"), capability: "diagnostics.technician", active: false }).expect(201);
    await get("technician", path).expect(403);
    await post("technician", commandPath, command).expect(403);
  });
});
