import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { Prisma, PrismaService, assertDiagnosticSourceCommand, sealDiagnosticFirstObservation, withDiagnosticSourceCommand, type DiagnosticSourceCommand, type DiagnosticSourceTuple } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { CheckBusinessAuthority } from "../application/CheckBusinessAuthority";
import { CheckStaffAuthority } from "../application/CheckStaffAuthority";
import { PrismaBusinessAuthority } from "./PrismaBusinessAuthority";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";
import { PrismaStaffBindings } from "./PrismaStaffBindings";
import { PrismaPublisherBindings } from "./PrismaPublisherBindings";
import { DiagnosticAuthority } from "../../diagnostics/infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "../../diagnostics/infrastructure/campaignDiagnosticAdmission";
import { DiagnosticPublicBindings } from "../../diagnostics/infrastructure/DiagnosticPublicBindings";
import { DiagnosticReportAccess } from "../../diagnostics/infrastructure/DiagnosticReportAccess";
import { DiagnosticDiscoveryCursor } from "../../diagnostics/infrastructure/DiagnosticDiscoveryCursor";
import { PrismaDiagnosticIntake, diagnosticObservationHash } from "../../diagnostics/infrastructure/PrismaDiagnosticIntake";
import { DiagnosticOwnershipCapture } from "../../diagnostics/infrastructure/DiagnosticOwnershipCapture";
import { PrismaDiagnosticReports } from "../../diagnostics/infrastructure/PrismaDiagnosticReports";
import { PrismaDiagnosticIdentityEvidence } from "../../diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence";
import { PrismaDiagnosticContinuityProofs } from "../../diagnostics/infrastructure/PrismaDiagnosticContinuityProofs";
import { S3DiagnosticObjects } from "../../diagnostics/infrastructure/S3DiagnosticObjects";
import { diagnosticRuntime } from "../../diagnostics/infrastructure/diagnosticRuntime";
import { DiagnosticReport, type DiagnosticReportState } from "../../diagnostics/domain/DiagnosticReport";
import type { DiagnosticSubject } from "../../diagnostics/domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("b1-purge-effect-closure");
const people = ["sellerA", "sellerB", "technician", "reviewer", "predecessorReviewer", "reception", "outsider"] as const;
const localized = { en: "Synthetic", ru: "Synthetic", tk: "Synthetic" };
const centerId = suite.id("center");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=", "base64");
const subject = (alias: typeof people[number]): DiagnosticSubject => ({ userId: suite.id(alias), sessionId: suite.id(`${alias}-session`) });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function present<T>(value: T | undefined): T { if (value === undefined) throw new Error("missing persisted scenario row"); return value; }
type Tx = Prisma.TransactionClient;

/** Authored, never locally executed. Uses the configured disposable API SQL/MinIO
 * lane, actual source APIs and actual Identity policies. No HTTP server, permission
 * fake, seeded ownership grant/proof/report, repin or trigger exemption. The
 * preactivation graph is completed before selectively enabling dormant guards. */
describe("B1 disposal of lawful persisted ownership and consumed retry graphs", { concurrent: false }, () => {
  const db = new PrismaService();
  const config = new ConfigService({ APP_ENV: "test", DIAGNOSTIC_SYNTHETIC_ENABLED: true, DIAGNOSTIC_SYNTHETIC_PUBLIC_ENABLED: true,
    DIAGNOSTIC_SYNTHETIC_USER_IDS: people.map(who => suite.id(who)), DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private",
    MINIO_ENDPOINT: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000", MINIO_ACCESS_KEY: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", MINIO_SECRET_KEY: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" });
  const runtime = diagnosticRuntime(config);
  const clock = { now: () => new Date() };
  const business = new CheckBusinessAuthority(new PrismaBusinessAuthority(db), clock);
  const staff = new CheckStaffAuthority(new PrismaStaffAuthority(db), clock);
  const authority = new DiagnosticAuthority(staff, business, runtime, new CampaignDiagnosticAdmission(config));
  const bindings = new DiagnosticPublicBindings(new PrismaPublisherBindings());
  const objects = new S3DiagnosticObjects(config);
  const evidence = new PrismaDiagnosticIdentityEvidence(db, authority, objects, runtime);
  const reports = new PrismaDiagnosticReports(db, authority, runtime, new DiagnosticReportAccess(authority, runtime), evidence, bindings);
  const intake = new PrismaDiagnosticIntake(db, authority, business, bindings, runtime);
  const proofs = new PrismaDiagnosticContinuityProofs(new DiagnosticDiscoveryCursor(randomBytes(32)), db, authority, new PrismaStaffBindings(), reports, evidence, bindings, runtime);
  const keys = new Set<string>();
  let templateId: string;
  const end = new Date(Date.now() + 24 * 3600_000);
  const rights = D.DiagnosticIdentityRightsSchema.parse({ category: "vehicle_observation", purpose: "SYNTHETIC disposal scenario", basis: "Explicit synthetic seller declaration",
    provenance: "Authored synthetic source; no customer material", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: end.toISOString(), reason: "Explicit scenario rights end" }, supplierRestrictions: "Service only", hold: null });
  async function guards(enabled: boolean) {
    const rows = await db.$queryRaw<{ table: string; name: string }[]>`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
    for (const row of rows) await db.$executeRawUnsafe(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
  }
  async function projection(tx: Tx, table: string, value: unknown) {
    return present((await tx.$queryRaw< { row: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_normalize(${table},${JSON.stringify(value)}::jsonb) AS row`)[0]).row;
  }
  async function source(tx: Tx, table: string, id: string) {
    return present((await tx.$queryRaw<{ row: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(diagnostic_source_read(${table},jsonb_build_object('id',${id})),diagnostic_source_meta(${table})->'fields') AS row`)[0]).row;
  }
  beforeAll(async () => {
    await db.onModuleInit(); await guards(false);
    expect(await db.user.count({ where: { id: { in: people.map(who => suite.id(who)) } } }), "Preserve a colliding earlier graph").toBe(0);
    await seedSuiteCatalog(db, suite);
    for (const who of people) {
      await db.user.create({ data: { id: suite.id(who), email: `${suite.id(who)}@purge.invalid`, emailVerifiedAt: new Date(), displayName: who } });
      await db.session.create({ data: { ...{ id: subject(who).sessionId, userId: subject(who).userId }, refreshTokenHash: randomUUID(), expiresAt: end, adminTotpExpiresAt: end } });
    }
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("center"), names: localized } });
    for (const [who, capability] of [["reception", "diagnostics.reception"], ["reception", "diagnostics.templates"], ["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"], ["predecessorReviewer", "diagnostics.reviewer"]] as const) {
      await db.staffGrant.create({ data: { userId: suite.id(who), capability } });
      await db.diagnosticCenterAssignment.create({ data: { centerId, userId: suite.id(who), capability, qualifiedUntil: end } });
    }
    templateId = (await intake.publishTemplate(subject("reception"), centerId, { expectedVersion: 0, synthetic: true, definition: { title: localized, limitations: localized, syntheticNotice: localized, checks: [{ id: "brakes", label: localized, required: false, evidenceRequired: false, measurement: null }], panels: [] } })).id;
  });
  afterAll(async () => {
    // Keep SQL graph on failure for parent inspection; remove only exact object
    // keys registered by this suite. Never discover bucket deletion authority.
    await guards(false);
    for (const key of keys) await objects.remove(key);
    objects.onModuleDestroy(); await db.onModuleDestroy();
  });

  async function visit(who: "sellerA" | "sellerB", declaration = rights) {
    await guards(false);
    const id = randomUUID(), listingId = randomUUID(), rawId = randomUUID();
    await db.listing.create({ data: { id: listingId, sellerId: suite.id(who), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId,
      vin: "WVWZZZ1JZXW000001", status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    const createdAt = new Date();
    const data = { id, centerId, templateVersionId: templateId, commissionerId: suite.id(who), requestKey: randomUUID(), audience: "listing_public", listingId, synthetic: true, createdAt, updatedAt: createdAt, epoch: randomUUID(), status: "requested", version: 0, identityEvidenceGeneration: 0 };
    await guards(true);
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, { operation: "intake_create", roots: [{ table: "inspection_orders", key: { id } }], rows: [{ table: "inspection_orders", key: { id }, verb: "insert", expected: "absent", next: await projection(tx, "inspection_orders", data) }], actorUserId: suite.id(who), sessionId: subject(who).sessionId, cutoff: null, campaign: null }, async () => {
      const [ids] = await tx.$queryRaw<{ audit: string; assignment: string }[]>`SELECT diagnostic_intake_uuid(${'diagnostic-source:intake_create:' + id}) AS audit,
       diagnostic_intake_uuid(${'diagnostic-source:intake-assignment:' + id + ':'} || (SELECT id FROM diagnostic_center_assignments WHERE "centerId"=${centerId} AND "userId"=${suite.id("reception")} AND capability='diagnostics.reception')) AS assignment`;
      const chosen = present(ids);
      await tx.inspectionOrder.create({ data: { ...data, assignments: { create: { id: chosen.assignment, userId: suite.id("reception"), capability: "diagnostics.reception" } } } });
      await tx.diagnosticAudit.create({ data: { id: chosen.audit, centerId, orderId: id, actorId: suite.id(who), action: "INTAKE_CREATED", details: { audience: data.audience, templateVersionId: templateId, synthetic: true } } });
    }));
    await guards(false);
    let order = await intake.read(subject(who), id);
    for (const [actor, capability] of [["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"], ["predecessorReviewer", "diagnostics.reviewer"]] as const) order = await intake.assign(subject("reception"), id, { expectedVersion: order.version, userId: suite.id(actor), capability, active: true });
    for (const kind of ["physical", "publication"] as const) order = await intake.authorize(subject("reception"), id, { expectedVersion: order.version, kind, authorityReference: `Explicit SYNTHETIC ${kind} declaration` });
    for (const state of ["confirmed", "arrived"] as const) order = await intake.appointment(subject("reception"), id, { expectedVersion: order.version, state });
    // The actual public grant entry checks the acting current Session and actual
    // personal seller policy. No direct ownership grant INSERT is used.
    await expect(intake.grantOwnership(subject("technician"), id, { rights: declaration })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    const granted = await intake.grantOwnership(subject(who), id, { rights: declaration });
    const grant = await db.diagnosticOwnershipGrant.findUniqueOrThrow({ where: { id: granted.id } });
    expect(grant).toMatchObject({ grantorId: suite.id(who), sessionId: subject(who).sessionId, state: "available" });
    // Capture uses the exported receipt, actual raw hash and actual component API.
    // The prepared tuple is source intent, never a declaration of derived effects.
    const observation = { observedAt: new Date().toISOString(), mileageKm: 120000, method: "vin" as const, vin: "WVWZZZ1JZXW000001", manualReference: null };
    await guards(true);
    await db.$transaction(async tx => {
      const old = await source(tx, "inspection_orders", id), version = Number(old["version"]) + 1, now = new Date();
      const digest = grant.identityDigest;
      if (!digest) throw new Error("source grant has no identity digest");
      const next = { ...old, version, observedVehicle: json(observation), listingIdentityDigest: digest, associationValidatedAt: now.toISOString(), updatedAt: now.toISOString() };
      const raw = await projection(tx, "diagnostic_identity_records", { id: rawId, orderId: id, orderVersion: version, observation, observationHash: diagnosticObservationHash(id, version, observation), recordedById: suite.id("technician"), recordedAt: now });
      const component = await projection(tx, "diagnostic_ownership_components", { identityRecordId: rawId, orderId: id, orderVersion: version, grantId: grant.id, state: "available", scope: "diagnostic_ownership_continuity", sourceListingId: grant.listingId, identityDigest: grant.identityDigest, sellerId: grant.sellerId, commissionerId: grant.commissionerId, businessId: grant.businessId, membershipId: grant.membershipId, rights: grant.rights, rightsUntil: grant.rightsUntil, declaredById: suite.id("technician"), declaredAt: now });
      const command: DiagnosticSourceCommand = { operation: "observation_append", roots: [{ table: "inspection_orders", key: { id } }], rows: [
        { table: "inspection_orders", key: { id }, verb: "update", expected: { source: old }, next },
        { table: "diagnostic_identity_records", key: { id: rawId }, verb: "insert", expected: "absent", next: raw },
        { table: "diagnostic_ownership_components", key: { identityRecordId: rawId }, verb: "insert", expected: "absent", next: component },
      ], actorUserId: suite.id("technician"), sessionId: subject("technician").sessionId, cutoff: null, campaign: null };
      await withDiagnosticSourceCommand(tx, command, async receipt => {
        const row = (await authority.order(tx, subject("technician"), id, "diagnostics.technician")).row;
        await tx.inspectionOrder.update({ where: { id }, data: { version, observedVehicle: observation, listingIdentityDigest: digest, associationValidatedAt: now, updatedAt: now } });
        await tx.diagnosticIdentityRecord.create({ data: { id: rawId, orderId: id, orderVersion: version, observation, observationHash: diagnosticObservationHash(id, version, observation), recordedById: suite.id("technician"), recordedAt: now } });
        await DiagnosticOwnershipCapture.append(tx, row, rawId, version, suite.id("technician"), now, { rights: declaration }, grant.id);
        await sealDiagnosticFirstObservation(tx, receipt, id, rawId);
      });
    });
    expect(await db.diagnosticSourceAnchor.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ state: "unchanged", firstRecordId: rawId });
    await guards(false);
    const p = randomUUID(); const current = await db.inspectionOrder.findUniqueOrThrow({ where: { id } });
    await evidence.stage(subject("technician"), id, { id: p, expectedOrderVersion: current.version, contentType: "image/png", sizeBytes: png.length, rights: declaration });
    await evidence.upload(subject("technician"), id, p, { expectedOrderVersion: current.version, mime: "image/png", bytes: png });
    const provenance = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } });
    if (provenance.objectKey) keys.add(provenance.objectKey);
    await evidence.append(subject("technician"), id, { id: randomUUID(), expectedOrderVersion: current.version, identityRecordId: rawId, identifiers: [{ kind: "vin_stamp", location: "Synthetic chassis", value: observation.vin, provenanceIds: [p] }], rights: declaration, correction: null });
    return { id, listingId, grantId: granted.id, rawId, provenanceId: p, who };
  }

  async function revoke(tx: Tx, v: Awaited<ReturnType<typeof visit>>, now: Date, incomplete = false, directDelete = false) {
    const old = await source(tx, "diagnostic_ownership_grants", v.grantId);
    const next = { ...old, state: "erased", listingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null, membershipId: null,
      grantorId: null, grantorMembershipId: null, sessionId: null, rights: null, rightsUntil: null, declaredAt: null, erasedAt: now.toISOString() };
    return withDiagnosticSourceCommand(tx, { operation: "ownership_revoke", roots: [{ table: "diagnostic_ownership_grants", key: { id: v.grantId } }], rows: [{ table: "diagnostic_ownership_grants", key: { id: v.grantId }, verb: "update", expected: { source: old }, next }], actorUserId: suite.id(v.who), sessionId: subject(v.who).sessionId, cutoff: now, campaign: null }, async receipt => {
      await business.resolve(subject(v.who), tx);
      if (incomplete) {
        // Deliberate naked early receipt deletion, before a single effect.
        await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
        return;
      }
      await tx.$queryRaw`SELECT diagnostic_dispose_ownership_scope(NULL::text,${now}::timestamp,${v.grantId}::text)`;
      if (directDelete) {
        await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
        throw new Error("completed direct DELETE rollback sentinel");
      }
    });
  }
  it("disposes available grants/components/first anchors and retains immutable raw and foreign material", async () => {
    const a = await visit("sellerA"), b = await visit("sellerB");
    const beforeRaw = await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: a.rawId } });
    const foreignComponent = await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: b.rawId } });
    await guards(true);
    await expect(db.$transaction(tx => revoke(tx, a, new Date(), true))).rejects.toThrow("diagnostic_source_final_effect");
    expect(await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: a.rawId } })).toMatchObject({ state: "available" });
    await expect(db.$transaction(tx => revoke(tx, a, new Date(), false, true))).rejects.toThrow("completed direct DELETE rollback sentinel");
    expect(await db.diagnosticOwnershipGrant.findUniqueOrThrow({ where: { id: a.grantId } })).toMatchObject({ state: "available" });
    await db.$transaction(tx => revoke(tx, a, new Date()));
    expect(await db.diagnosticOwnershipGrant.findUniqueOrThrow({ where: { id: a.grantId } })).toMatchObject({ state: "erased", rights: null, grantorId: null, sessionId: null });
    expect(await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: a.rawId } })).toMatchObject({ state: "erased", grantId: null, rights: null, sourceListingId: null });
    expect(await db.diagnosticSourceAnchor.findUniqueOrThrow({ where: { orderId: a.id } })).toMatchObject({ state: "erased", source: null, firstRecordId: null });
    expect(await db.diagnosticIdentityRecord.findUniqueOrThrow({ where: { id: a.rawId } })).toEqual(beforeRaw);
    expect(await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: b.rawId } })).toEqual(foreignComponent);
    await expect(db.$executeRaw`UPDATE diagnostic_ownership_components SET state='available' WHERE "identityRecordId"=${a.rawId}`).rejects.toThrow();
  });

  it("retains OLD Listing selectors after a real source transfer, without changing foreign Listing or repinning", async () => {
    const a = await visit("sellerA"); await guards(true);
    const oldListing = await db.listing.findUniqueOrThrow({ where: { id: a.listingId } });
    await db.$transaction(async tx => {
      const old = await source(tx, "listings", a.listingId);
      await withDiagnosticSourceCommand(tx, { operation: "listing_change", roots: [{ table: "listings", key: { id: a.listingId } }], rows: [{ table: "listings", key: { id: a.listingId }, verb: "update", expected: { source: old }, next: { ...old, sellerId: suite.id("sellerB") } }], actorUserId: suite.id("sellerA"), sessionId: subject("sellerA").sessionId, cutoff: null, campaign: null }, async () => { await tx.listing.update({ where: { id: a.listingId }, data: { sellerId: suite.id("sellerB") } }); });
    });
    expect(await db.diagnosticSourceAnchor.findUniqueOrThrow({ where: { orderId: a.id } })).toMatchObject({ state: "changed", firstRecordId: a.rawId });
    await db.$transaction(async tx => {
      const [scope] = await tx.$queryRaw<{ s: { table: string; key: { id?: string } }[] }[]>`SELECT diagnostic_source_scope(${JSON.stringify({ operation: "ownership_revoke", roots: [{ table: "diagnostic_ownership_grants", key: { id: a.grantId } }], rows: [], actorUserId: suite.id("sellerA"), sessionId: subject("sellerA").sessionId, cutoff: new Date(), campaign: null })}::jsonb) AS s`;
      expect(present(scope).s).toContainEqual(expect.objectContaining({ table: "users", key: { id: oldListing.sellerId } }));
      expect(present(scope).s).toContainEqual(expect.objectContaining({ table: "listings", key: { id: a.listingId } }));
      await revoke(tx, a, new Date());
    });
    expect(await db.listing.findUniqueOrThrow({ where: { id: a.listingId } })).toMatchObject({ sellerId: suite.id("sellerB"), deletedAt: null, vin: oldListing.vin });
    expect(await db.diagnosticSourceAnchor.findUniqueOrThrow({ where: { orderId: a.id } })).toMatchObject({ state: "erased", firstRecordId: null });
  });

  async function unusedProof(declaration = rights) {
    const a = await visit("sellerA", declaration), b = await visit("sellerB", declaration);
    await guards(false);
    const orderA = await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } });
    const draft = await reports.create(subject("technician"), a.id, { reportId: randomUUID(), expectedOrderVersion: orderA.version });
    const submitted = await reports.transition(subject("technician"), draft.id, { expectedVersion: draft.version, action: "submit" });
    const released = await reports.transition(subject("predecessorReviewer"), draft.id, { expectedVersion: submitted.version, action: "finalize" });
    const orderB = await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } });
    const issued = await proofs.issue(subject("reviewer"), b.id, D.DiagnosticContinuityProofIssuanceSchema.parse({ predecessorId: released.id,
      expectedPredecessorVersion: released.version, expectedOrderVersion: orderB.version, predecessorIdentityRecordId: a.rawId,
      candidateIdentityRecordId: b.rawId, linkingTechnicianId: suite.id("technician"), method: "comparative_attestation",
      rationale: "Explicit independent comparison of synthetic stamp provenance", provenanceRecordIds: [a.provenanceId, b.provenanceId] }));
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: issued.proofId } });
    await guards(true);
    const [bound] = await db.$queryRaw<{ valid: boolean }[]>`SELECT diagnostic_continuity_proof_bound(p) valid FROM diagnostic_continuity_proofs p WHERE id=${proof.id}`;
    expect(present(bound).valid).toBe(true);
    expect(proof).toMatchObject({ invalidatedAt: null, consumedAt: null, consumedReportId: null });
    return { a, b, proof, released, orderB };
  }

  it.each([0, 1].flatMap(visit => ["format", "no-op"].map(kind => ({ visit, kind }))))("valid unused proof invalidates on visit $visit $kind UPDATE-OF without inventing an ownership transition", async ({ visit, kind }) => {
    const graph = await unusedProof();
    const selected = visit === 0 ? graph.a : graph.b;
    const beforeRaw = await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    const beforeReport = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: graph.released.id } });
    const beforeAnchors = await db.diagnosticSourceAnchor.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { orderId: "asc" } });
    const vin = kind === "format" ? " wvwzzz1jzxw000001 " : "WVWZZZ1JZXW000001";
    await db.$transaction(async tx => {
      const old = await source(tx, "listings", selected.listingId);
      await withDiagnosticSourceCommand(tx, { operation: "listing_change", roots: [{ table: "listings", key: { id: selected.listingId } }], rows: [{ table: "listings", key: { id: selected.listingId }, verb: "update", expected: { source: old }, next: { ...old, vin } }], actorUserId: suite.id(selected.who), sessionId: subject(selected.who).sessionId, cutoff: null, campaign: null }, async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "listing_change");
        // UPDATE OF fires, and updatedAt differs even when vin is unchanged.
        const prior = await tx.listing.findUniqueOrThrow({ where: { id: selected.listingId } });
        await tx.listing.update({ where: { id: selected.listingId }, data: { vin, updatedAt: new Date(prior.updatedAt.getTime()+1) } });
      });
    });
    expect((await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } })).invalidatedAt).not.toBeNull();
    expect(await db.diagnosticSourceAnchor.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { orderId: "asc" } })).toEqual(beforeAnchors);
    expect(await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } })).toEqual(beforeRaw);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: graph.released.id } })).toEqual(beforeReport);
    const count = await db.diagnosticAudit.count({ where: { orderId: { in: [graph.a.id, graph.b.id] } } });
    await expect(proofs.consume(subject("technician"), graph.b.id, { proofId: graph.proof.id, reportId: randomUUID(), predecessorId: graph.released.id,
      expectedOrderVersion: graph.orderB.version, reason: "Invalidated synthetic handoff" })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await db.diagnosticAudit.count({ where: { orderId: { in: [graph.a.id, graph.b.id] } } })).toBe(count);
    expect(await db.diagnosticReportRecord.count({ where: { orderId: graph.b.id } })).toBe(0);
  });

  it.each(["issue", "consume"] as const)("%s checks real execution-time expiry after preparation without accepting the earlier source timestamp", async operation => {
    // Genuine seller grants, captures, evidence and proof all share this explicit
    // user-ended declaration. No rights field or DB clock is rewritten later.
    const until = new Date(Date.now()+30_000);
    const declaration = D.DiagnosticIdentityRightsSchema.parse({ ...rights, schedule: { ...rights.schedule, until: until.toISOString() } });
    const graph = await unusedProof(declaration);
    const beforeProof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } });
    const beforeReports = await db.diagnosticReportRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    const beforeAudits = await db.diagnosticAudit.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    async function wallClock(target: number) {
      const deadline = Date.now()+35_000;
      while (Date.now()<deadline) {
        const [row] = await db.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() at`;
        if (present(row).at.getTime()>=target) return;
      }
      throw new Error("PostgreSQL clock did not reach the declared expiry");
    }
    // Waiting happens outside the transaction until its last two seconds. The
    // ordinary interactive-transaction timeout is unchanged.
    await wallClock(until.getTime()-2000);
    let entered: () => void = () => { throw new Error("missing prepared expiry barrier"); };
    let release: () => void = () => { throw new Error("missing expiry release"); };
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const id = operation === "issue" ? randomUUID() : graph.proof.id;
    const stamp = new Date();
    const attempt = db.$transaction(async tx => {
      const old = await source(tx, "diagnostic_continuity_proofs", graph.proof.id);
      const consumedReportId = randomUUID();
      const next: DiagnosticSourceTuple = operation === "consume" ? { ...old, consumedAt: stamp.toISOString(), consumedReportId } : {
        ...old, id, requestId: null, content: json({ ...(graph.proof.content as Prisma.JsonObject), proofId: id }),
      };
      await withDiagnosticSourceCommand(tx, { operation: operation === "issue" ? "proof_issue" : "proof_consume", roots: [{ table: "diagnostic_continuity_proofs", key: { id: graph.proof.id } }], rows: [operation === "issue" ? { table: "diagnostic_continuity_proofs", key: { id }, verb: "insert", expected: "absent", next: await projection(tx, "diagnostic_continuity_proofs", next) } : { table: "diagnostic_continuity_proofs", key: { id }, verb: "update", expected: { source: old }, next: await projection(tx, "diagnostic_continuity_proofs", next) }], actorUserId: suite.id("reviewer"), sessionId: subject("reviewer").sessionId, cutoff: null, campaign: null }, async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, operation === "issue" ? "proof_issue" : "proof_consume");
        entered(); await hold;
        if (operation === "consume") await tx.diagnosticContinuityProof.update({ where: { id }, data: { consumedAt: stamp, consumedReportId } });
        else await tx.$executeRaw`INSERT INTO diagnostic_continuity_proofs SELECT (jsonb_populate_record(NULL::diagnostic_continuity_proofs,${JSON.stringify(next)}::jsonb)).*`;
      });
    }).then(() => null, (error: unknown) => error);
    await ready;
    try { await wallClock(until.getTime()+1); } finally { release(); }
    const error = await attempt;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("diagnostic_continuity_proof_expired");
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } })).toEqual(beforeProof);
    if (operation === "issue") expect(await db.diagnosticContinuityProof.findUnique({ where: { id } })).toBeNull();
    expect(await db.diagnosticReportRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } })).toEqual(beforeReports);
    expect(await db.diagnosticAudit.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } })).toEqual(beforeAudits);
    expect(await db.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["expire", "delete"] as const)("Session %s discovers its incoming valid proof and finishes invalidation without a late resource lock", async operation => {
    const graph = await unusedProof();
    const beforeRaw = await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    const beforeReports = await db.diagnosticReportRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    const sid = subject("reviewer").sessionId;
    await db.$transaction(async tx => {
      const old = await source(tx, "sessions", sid);
      const expiresAt = new Date(Date.now()-1);
      const row = operation === "delete" ? { table: "sessions" as const, key: { id: sid }, verb: "delete" as const, expected: { source: old }, next: null } : {
        table: "sessions" as const, key: { id: sid }, verb: "update" as const, expected: { source: old }, next: { ...old, expiresAt: expiresAt.toISOString() },
      };
      await withDiagnosticSourceCommand(tx, { operation: "session_change", roots: [{ table: "sessions", key: { id: sid } }], rows: [row], actorUserId: suite.id("reviewer"), sessionId: sid, cutoff: null, campaign: null }, async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, "session_change");
        const [scope] = await tx.$queryRaw<{ scope: { table: string; key: { id?: string } }[] }[]>`SELECT scope FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
        expect(present(scope).scope).toContainEqual(expect.objectContaining({ table: "diagnostic_continuity_proofs", key: { id: graph.proof.id } }));
        const before = await tx.$queryRaw`SELECT classid::text,objid::text,objsubid,mode FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' ORDER BY classid,objid,objsubid,mode`;
        if (operation === "delete") await tx.session.delete({ where: { id: sid } });
        else await tx.session.update({ where: { id: sid }, data: { expiresAt } });
        expect(await tx.$queryRaw`SELECT classid::text,objid::text,objsubid,mode FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' ORDER BY classid,objid,objsubid,mode`).toEqual(before);
      });
    });
    expect((await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } })).invalidatedAt).not.toBeNull();
    expect(await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } })).toEqual(beforeRaw);
    expect(await db.diagnosticReportRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } })).toEqual(beforeReports);
    // Restore only this suite's Session as a preactivation fixture for following
    // cases. Revoked proof payloads remain permanently invalidated.
    await guards(false);
    if (operation === "delete") await db.session.create({ data: { id: sid, userId: suite.id("reviewer"), refreshTokenHash: randomUUID(), expiresAt: end, adminTotpExpiresAt: end } });
    else await db.session.update({ where: { id: sid }, data: { expiresAt: end } });
    await guards(true);
  });


  it.each(["grant", "qualification"] as const)("a %s selector covers its incoming proof before revocation; restoring eligibility leaves that proof invalidated", async kind => {
    const graph = await unusedProof();
    const reviewerId = suite.id("reviewer"), capability = "diagnostics.reviewer";
    const qualification = await db.diagnosticCenterAssignment.findFirstOrThrow({ where: { userId: reviewerId, centerId, capability } });
    const anchors = await db.diagnosticSourceAnchor.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { orderId: "asc" } });
    for (const revokedAt of [new Date(), null]) {
      await db.$transaction(async tx => {
        const table = kind === "grant" ? "staff_grants" : "diagnostic_center_assignments";
        const key = kind === "grant" ? { userId: reviewerId, capability } : { id: qualification.id };
        const [r] = await tx.$queryRaw<{ row: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(diagnostic_source_read(${table},${JSON.stringify(key)}::jsonb),diagnostic_source_meta(${table})->'fields') row`;
        const old = present(r).row, next = { ...old, revokedAt: revokedAt?.toISOString() ?? null };
        const row = kind === "grant" ? { table: "staff_grants" as const, key: { userId: reviewerId, capability }, verb: "update" as const, expected: { source: old }, next } : {
          table: "diagnostic_center_assignments" as const, key: { id: qualification.id }, verb: "update" as const, expected: { source: old }, next,
        };
        await withDiagnosticSourceCommand(tx, { operation: "staff_eligibility", roots: kind === "grant" ? [{ table: "staff_grants", key: { userId: reviewerId, capability } }] : [{ table: "diagnostic_center_assignments", key: { id: qualification.id } }], rows: [row], actorUserId: reviewerId, sessionId: subject("reviewer").sessionId, cutoff: null, campaign: null }, async receipt => {
          await assertDiagnosticSourceCommand(tx, receipt, "staff_eligibility");
          if (kind === "grant") await tx.staffGrant.update({ where: { userId_capability: { userId: reviewerId, capability } }, data: { revokedAt } });
          else await tx.diagnosticCenterAssignment.update({ where: { id: qualification.id }, data: { revokedAt } });
        });
      });
      expect((await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } })).invalidatedAt).not.toBeNull();
      expect(await db.diagnosticSourceAnchor.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { orderId: "asc" } })).toEqual(anchors);
    }
  });

  // Actor erasure is last: the worker database retains this suite's graph.
  function signal() {
    let release: () => void = () => { throw new Error("missing SQL barrier"); };
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
  }
  async function blocked(waiter: number, blocker: number) {
    const deadline = Date.now()+5000;
    while (Date.now()<deadline) {
      const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) blocked`;
      if (present(row).blocked) return;
    }
    throw new Error("expected actual PostgreSQL dependency wait");
  }
  async function executionTime(target: Date) {
    const deadline = Date.now()+35_000;
    while (Date.now()<deadline) {
      const [row] = await db.$queryRaw<{ expired: boolean }[]>`SELECT clock_timestamp()>=${target}::timestamptz expired`;
      if (present(row).expired) return;
    }
    throw new Error("PostgreSQL did not reach the seller's declared end");
  }

  it.each(["ordinary", "material"].flatMap(opposition => (opposition === "material" ? ["proof"] : ["report", "proof"]).flatMap(edge => [false, true].map(writerFirst => ({ opposition, edge, writerFirst })))))("NEW $edge edge versus $opposition enters the actual rediscovered graph, writerFirst=$writerFirst", async ({ opposition, edge, writerFirst }) => {
    const graph = await unusedProof();
    const beforeRaw = await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    const originalProof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } });
    const originalReport = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: graph.released.id } });
    const id = randomUUID(), now = new Date();
    const order = await db.inspectionOrder.findUniqueOrThrow({ where: { id: graph.b.id } });
    const observed = reports.observed(order);
    const leaf = present((await db.diagnosticIdentityEvidence.findMany({ where: { orderId: order.id, erasedAt: null } }))[0]);
    // The proof prototype comes from actual issuance against current lawful
    // evidence and declarations. Its new identifier is checked by the original
    // SQL binding guard. The report uses B's actual independent raw/leaf pins.
    const table = edge === "proof" ? "diagnostic_continuity_proofs" : "diagnostic_reports";
    const data = edge === "proof" ? { ...originalProof, id, requestId: null, content: { ...(originalProof.content as Prisma.JsonObject), proofId: id } } : {
      id, orderId: order.id, templateVersionId: order.templateVersionId, audience: order.audience, status: "draft", version: 0, reinspection: false, createdAt: now, updatedAt: now,
      identityRecordId: graph.b.rawId, identityRecordHash: present(beforeRaw.find(row => row.id === graph.b.rawId)).observationHash,
      identityEvidenceId: leaf.id, identityEvidenceHash: leaf.recordHash,
      state: { id, orderId: order.id, audience: order.audience, templateVersionId: order.templateVersionId, status: "draft", observedAt: observed.observedAt,
        mileageKm: observed.mileageKm, findings: [], authorId: suite.id("technician"), reviewerId: null, successorOf: null,
        correctionReason: null, returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null },
    };
    const writer = await db.$transaction(async tx => ({ operation: edge === "proof" ? "proof_issue" : "report_change",
      roots: [{ table: "inspection_orders", key: { id: order.id } }], rows: [{ table, key: { id }, verb: "insert", expected: "absent", next: await projection(tx,table,data) }],
      actorUserId: suite.id(edge === "proof" ? "reviewer" : "technician"), sessionId: subject(edge === "proof" ? "reviewer" : "technician").sessionId,
      cutoff: null, campaign: null }) as DiagnosticSourceCommand);
    const materialBefore = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.a.provenanceId } });
    const foreignBefore = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.b.provenanceId } });
    const disposedEpoch=randomUUID();
    const reader = await db.$transaction(async tx => {
      if(opposition==="material") {
        const material=await source(tx,"diagnostic_identity_provenance",graph.a.provenanceId),proof=await source(tx,"diagnostic_continuity_proofs",graph.proof.id);
        return {operation:"identity_material_change",roots:[{table:"diagnostic_identity_provenance",key:{id:graph.a.provenanceId}}],rows:[
          {table:"diagnostic_identity_provenance",key:{id:graph.a.provenanceId},verb:"update",expected:{source:material},next:{...material,state:"cleanup_pending",epoch:disposedEpoch,rights:null,cleanupRequestedAt:now.toISOString(),erasedAt:now.toISOString()}},
          {table:"diagnostic_continuity_proofs",key:{id:graph.proof.id},verb:"delete",expected:{source:proof},next:null},
        ],actorUserId:null,sessionId:null,cutoff:now,campaign:null} as DiagnosticSourceCommand;
      }
      const old = await source(tx,"users",suite.id("sellerA"));
      return { operation: "account_restore", roots: [{ table: "users", key: { id: suite.id("sellerA") } }], rows: [{ table: "users", key: { id: suite.id("sellerA") }, verb: "update", expected: { source: old }, next: old }], actorUserId: null, sessionId: null, cutoff: null, campaign: null } as DiagnosticSourceCommand;
    });
    const entered = signal(), release = signal(), secondEntered = signal();
    let firstPid=0, secondPid=0;
    async function write(tx: Tx) {
      const who = edge === "proof" ? "reviewer" : "technician";
      const capability = edge === "proof" ? "diagnostics.reviewer" : "diagnostics.technician";
      await authority.order(tx,subject(who),graph.a.id,capability);
      await authority.order(tx,subject(who),graph.b.id,capability);
      if (edge === "proof") await tx.$executeRaw`INSERT INTO diagnostic_continuity_proofs SELECT (jsonb_populate_record(NULL::diagnostic_continuity_proofs,${JSON.stringify(data)}::jsonb)).*`;
      else await tx.$executeRaw`INSERT INTO diagnostic_reports SELECT (jsonb_populate_record(NULL::diagnostic_reports,${JSON.stringify(await projection(tx,table,data))}::jsonb)).*`;
    }
    async function oppose(tx:Tx) {
      if(opposition!=="material")return;
      await tx.diagnosticContinuityProof.delete({where:{id:graph.proof.id}});
      await tx.diagnosticIdentityProvenance.update({where:{id:graph.a.provenanceId},data:{state:"cleanup_pending",epoch:disposedEpoch,rights:Prisma.DbNull,cleanupRequestedAt:now,erasedAt:now}});
    }
    const first = db.$transaction(async tx => {
      firstPid=present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx,writerFirst ? writer : reader,async receipt => {
        await assertDiagnosticSourceCommand(tx,receipt,writerFirst ? writer.operation : reader.operation);
        entered.release(); await release.promise; if (writerFirst) await write(tx);else await oppose(tx);
      });
    });
    await entered.promise;
    const second = db.$transaction(async tx => {
      secondPid=present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid; secondEntered.release();
      await withDiagnosticSourceCommand(tx,writerFirst ? reader : writer,async receipt => {
        await assertDiagnosticSourceCommand(tx,receipt,writerFirst ? reader.operation : writer.operation);
        if (!writerFirst) await write(tx);else await oppose(tx);
      });
    }).then(() => null,(error: unknown) => error);
    await secondEntered.promise;
    try { await blocked(secondPid,firstPid); } finally { release.release(); }
    await first; const outcome=await second;
    if (writerFirst) { expect(outcome).toBeInstanceOf(Error); expect((outcome as Error).message).toContain("diagnostic_source_graph_changed"); }
    else if(opposition==="material"){expect(outcome).toBeInstanceOf(Error);expect((outcome as Error).message).toMatch(/diagnostic_source_(graph_changed|stale)/);}else expect(outcome).toBeNull();
    expect(await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id,graph.b.id] } },orderBy: { id: "asc" } })).toEqual(beforeRaw);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: originalReport.id } })).toEqual(originalReport);
    if(opposition==="material" && !writerFirst){
      expect(await db.diagnosticContinuityProof.findUnique({where:{id:originalProof.id}})).toBeNull();
      expect(await db.diagnosticContinuityProof.findUnique({where:{id}})).toBeNull();
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({where:{id:graph.a.provenanceId}})).toEqual({...materialBefore,state:"cleanup_pending",epoch:disposedEpoch,rights:null,cleanupRequestedAt:now,erasedAt:now});
    }else{
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: originalProof.id } })).toEqual(originalProof);
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({where:{id:graph.a.provenanceId}})).toEqual(materialBefore);
    }
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({where:{id:graph.b.provenanceId}})).toEqual(foreignBefore);
    if (edge === "proof" && !(opposition==="material" && !writerFirst)) expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id } })).toMatchObject({ issuerId: originalProof.issuerId, invalidatedAt: null });
    else if(edge==="report") expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id } })).toMatchObject({ orderId: order.id, identityRecordId: graph.b.rawId, identityEvidenceId: leaf.id });
    expect(await db.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["material", "proof"].flatMap(disposed => [false, true].map(useFirst => ({ disposed, useFirst }))))("$disposed expiry versus proof use, useFirst=$useFirst preserves the complete committed result", async ({ disposed, useFirst }) => {
    const until = new Date(Date.now()+30_000);
    const declaration = D.DiagnosticIdentityRightsSchema.parse({ ...rights, schedule: { ...rights.schedule, until: until.toISOString() } });
    const graph = await unusedProof(declaration);
    const rawBefore = await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } });
    const reportBefore = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: graph.released.id } });
    const materialBefore = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.a.provenanceId } });
    const foreignBefore = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.b.provenanceId } });
    const candidate = await db.inspectionOrder.findUniqueOrThrow({ where: { id: graph.b.id } });
    const leaf = present((await db.diagnosticIdentityEvidence.findMany({ where: { orderId: candidate.id, erasedAt: null } }))[0]);
    const reportId = randomUUID(), stamp = new Date();
    const observed = reports.observed(candidate);
    const state = new DiagnosticReport(reportBefore.state as unknown as DiagnosticReportState).reinspect({ reportId, orderId: candidate.id,
      templateVersionId: candidate.templateVersionId, authorId: suite.id("technician"), observedAt: observed.observedAt,
      mileageKm: observed.mileageKm, reason: "Explicit synthetic reinspection" }).state;
    const reportData = { id: reportId, orderId: candidate.id, templateVersionId: candidate.templateVersionId, predecessorId: reportBefore.id,
      reinspection: true, status: "draft", version: 0, audience: candidate.audience, state: json(state), identityRecordId: graph.b.rawId,
      identityRecordHash: present(rawBefore.find(row => row.id === graph.b.rawId)).observationHash,
      identityEvidenceId: leaf.id, identityEvidenceHash: leaf.recordHash, continuityProofId: graph.proof.id,
      reinspectionOrderVersion: candidate.version, createdAt: stamp, updatedAt: stamp };
    const use = await db.$transaction(async tx => {
      const old = await source(tx, "diagnostic_continuity_proofs", graph.proof.id);
      return { operation: "proof_consume", roots: [{ table: "diagnostic_continuity_proofs", key: { id: graph.proof.id } }], rows: [
        { table: "diagnostic_continuity_proofs", key: { id: graph.proof.id }, verb: "update", expected: { source: old }, next: { ...old, consumedAt: stamp.toISOString(), consumedReportId: reportId } },
        { table: "diagnostic_reports", key: { id: reportId }, verb: "insert", expected: "absent", next: await projection(tx, "diagnostic_reports", reportData) },
      ], actorUserId: suite.id("technician"), sessionId: subject("technician").sessionId, cutoff: null, campaign: null } as DiagnosticSourceCommand;
    });
    // Unlocked intent reads are allowed before entry. The planned deletion and
    // report use share their actual original proof/material/Listing endpoints.
    const disposal = await db.$transaction(async tx => {
      const table = disposed === "proof" ? "diagnostic_continuity_proofs" : "diagnostic_identity_provenance";
      const id = disposed === "proof" ? graph.proof.id : graph.a.provenanceId;
      const old = await source(tx, table, id);
      const next = { ...old, state: "cleanup_pending", epoch: randomUUID(), rights: null, cleanupRequestedAt: until.toISOString(), erasedAt: until.toISOString() };
      return { operation: disposed === "proof" ? "proof_expire" : "identity_material_change", roots: [{ table, key: { id } }], rows: [
        disposed === "proof" ? { table, key: { id }, verb: "delete", expected: { source: old }, next: null } : { table, key: { id }, verb: "update", expected: { source: old }, next },
      ], actorUserId: null, sessionId: null, cutoff: until, campaign: null } as DiagnosticSourceCommand;
    });
    const entered = signal(), release = signal(), secondEntered = signal();
    let firstPid = 0, secondPid = 0;
    async function consume(tx: Tx) {
      // Real current technician authority for BOTH visits; the SQL consumption
      // guard separately verifies the persisted proof's current bound graph.
      await authority.order(tx, subject("technician"), graph.a.id, "diagnostics.technician");
      await authority.order(tx, subject("technician"), graph.b.id, "diagnostics.technician");
      await tx.diagnosticContinuityProof.update({ where: { id: graph.proof.id }, data: { consumedAt: stamp, consumedReportId: reportId } });
      await tx.diagnosticReportRecord.create({ data: reportData });
    }
    async function dispose(tx: Tx) {
      // Exact existing worker proof retirement and provenance-rights retirement
      // effects. No seeded proof/grant or storage/permission substitute is used.
      await tx.diagnosticContinuityProof.delete({ where: { id: graph.proof.id } });
      if (disposed === "material") {
        const row = present(disposal.rows[0]);
        if (row.verb !== "update") throw new Error("material update intent required");
        await tx.$executeRaw`UPDATE diagnostic_identity_provenance SET state='cleanup_pending',epoch=${String(row.next["epoch"])},rights=NULL,"cleanupRequestedAt"=${until}::timestamp,"erasedAt"=${until}::timestamp WHERE id=${graph.a.provenanceId}`;
      }
    }
    // At most the existing five-second transaction budget is used. Wait for the
    // declared clock boundary outside the transaction until its last two seconds.
    await executionTime(new Date(until.getTime()-2000));
    if (!useFirst) await executionTime(until);
    const first = db.$transaction(async tx => {
      firstPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx, useFirst ? use : disposal, async receipt => {
        await assertDiagnosticSourceCommand(tx, receipt, useFirst ? "proof_consume" : disposal.operation);
        if (useFirst) await consume(tx); else await dispose(tx);
        entered.release(); await release.promise;
      });
    });
    await entered.promise;
    if (useFirst) await executionTime(until);
    const second = db.$transaction(async tx => {
      secondPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid; secondEntered.release();
      await withDiagnosticSourceCommand(tx, useFirst ? disposal : use, async () => { throw new Error("stale graph must refuse before work"); });
    }).then(() => null, (error: unknown) => error);
    await secondEntered.promise;
    try { await blocked(secondPid, firstPid); } finally { release.release(); }
    await first;
    const refusal = await second;
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toMatch(/diagnostic_source_(graph_changed|stale)/);
    if (useFirst) {
      expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } })).toMatchObject({ consumedReportId: reportId, invalidatedAt: null });
      expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ continuityProofId: graph.proof.id, reinspectionOrderVersion: candidate.version, identityRecordId: graph.b.rawId, state });
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.a.provenanceId } })).toEqual(materialBefore);
    } else {
      expect(await db.diagnosticContinuityProof.findUnique({ where: { id: graph.proof.id } })).toBeNull();
      expect(await db.diagnosticReportRecord.findUnique({ where: { id: reportId } })).toBeNull();
      expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.a.provenanceId } })).toEqual(disposed === "material" ? {
        ...materialBefore, state: "cleanup_pending", epoch: present(disposal.rows[0]).next?.["epoch"], rights: null, cleanupRequestedAt: until, erasedAt: until,
      } : materialBefore);
    }
    expect(await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: [graph.a.id, graph.b.id] } }, orderBy: { id: "asc" } })).toEqual(rawBefore);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportBefore.id } })).toEqual(reportBefore);
    expect(await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: graph.b.provenanceId } })).toEqual(foreignBefore);
    expect(await db.diagnosticSourceCommand.count()).toBe(0);
  });

  it.each(["finish", "delete"] as const)("Session deletion %s clears a consumed request's personal pair and preserves the actual report retry minimum", async mode => {
    const graph = await unusedProof();
    await guards(false);
    const sid = randomUUID(), actor = { userId: suite.id("technician"), sessionId: sid };
    await db.session.create({ data: { id: sid, userId: actor.userId, refreshTokenHash: randomUUID(), expiresAt: end, adminTotpExpiresAt: end } });
    const request = await proofs.prepareRequest(actor, graph.b.id, { kind: "consume" });
    const input = D.DiagnosticContinuityRequestExecuteSchema.parse({ kind: "consume", command: { proofId: graph.proof.id, reportId: randomUUID(), expectedOrderVersion: graph.orderB.version, reason: "Synthetic Session deletion fixture" } });
    await proofs.executeRequest(actor, graph.b.id, request.requestId, input);
    const report = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { continuityRequestId: request.requestId } });
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: graph.proof.id } });
    const predecessor = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: graph.released.id } });
    const beforeSession = await db.session.findUniqueOrThrow({ where: { id: sid } });
    await guards(true);
    const c = await db.$transaction(async tx => ({ operation: "session_change", roots: [{ table: "sessions", key: { id: sid } }], rows: [{ table: "sessions", key: { id: sid }, verb: "delete", expected: { source: await source(tx,"sessions",sid) }, next: null }], actorUserId: actor.userId, sessionId: sid, cutoff: null, campaign: null }) as DiagnosticSourceCommand);
    await expect(db.$transaction(tx => withDiagnosticSourceCommand(tx,c,async () => {
      await tx.session.delete({ where: { id: sid } }); throw new Error("consumed Session rollback sentinel");
    }))).rejects.toThrow("consumed Session rollback sentinel");
    expect(await db.session.findUniqueOrThrow({ where: { id: sid } })).toEqual(beforeSession);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: report.id } })).toEqual(report);
    await db.$transaction(async tx => {
      if (mode === "finish") await withDiagnosticSourceCommand(tx,c,() => tx.session.delete({ where: { id: sid } }));
      else {
        const [receipt] = await tx.$queryRaw<{ id: string }[]>`SELECT diagnostic_prepare_source(${JSON.stringify(c)}::jsonb)::text id`;
        await tx.session.delete({ where: { id: sid } });
        await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${present(receipt).id}::uuid`;
      }
    });
    expect(await db.session.findUnique({ where: { id: sid } })).toBeNull();
    expect(await db.diagnosticContinuityRequest.findUnique({ where: { id: request.requestId } })).toBeNull();
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: report.id } })).toEqual({ ...report, continuityRequestId: null, continuityRequestSessionId: null });
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proof.id } })).toEqual(proof);
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: predecessor.id } })).toEqual(predecessor);
    await expect(proofs.executeRequest(actor,graph.b.id,request.requestId,input)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await db.diagnosticSourceCommand.count()).toBe(0);
  });

  it("deletes consumed proof/issue request while preserving B's report retry minimum and foreign snapshot", async () => {
    const a = await visit("sellerA"), b = await visit("sellerB"); await guards(false);
    const orderA = await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } });
    const draft = await reports.create(subject("technician"), a.id, { reportId: randomUUID(), expectedOrderVersion: orderA.version });
    const submitted = await reports.transition(subject("technician"), draft.id, { expectedVersion: draft.version, action: "submit" });
    const released = await reports.transition(subject("predecessorReviewer"), draft.id, { expectedVersion: submitted.version, action: "finalize" });
    const orderB = await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } });
    const issueRequest = await proofs.prepareRequest(subject("reviewer"), b.id, { kind: "issue" });
    const issue = D.DiagnosticContinuityRequestExecuteSchema.parse({ kind: "issue", command: { predecessorId: released.id, expectedPredecessorVersion: released.version, expectedOrderVersion: orderB.version,
      predecessorIdentityRecordId: a.rawId, candidateIdentityRecordId: b.rawId, linkingTechnicianId: suite.id("technician"), method: "comparative_attestation", rationale: "Explicit independent comparison of synthetic VIN stamp provenance", provenanceRecordIds: [a.provenanceId, b.provenanceId] } });
    await proofs.executeRequest(subject("reviewer"), b.id, issueRequest.requestId, issue);
    const proof = await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { requestId: issueRequest.requestId } });
    const consumeRequest = await proofs.prepareRequest(subject("technician"), b.id, { kind: "consume" });
    const consume = D.DiagnosticContinuityRequestExecuteSchema.parse({ kind: "consume", command: { proofId: proof.id, reportId: randomUUID(), expectedOrderVersion: orderB.version, reason: "Synthetic reinspection" } });
    await proofs.executeRequest(subject("technician"), b.id, consumeRequest.requestId, consume);
    const before = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { continuityRequestId: consumeRequest.requestId } });
    const snapshotA = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: released.id } });
    expect(await db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proof.id } })).toMatchObject({ consumedReportId: before.id });
    await guards(true); await db.$transaction(tx => revoke(tx, a, new Date()));
    expect(await db.diagnosticContinuityProof.findUnique({ where: { id: proof.id } })).toBeNull();
    expect(await db.diagnosticContinuityRequest.findUnique({ where: { id: issueRequest.requestId } })).toBeNull();
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(before).toMatchObject({ continuityProofId: proof.id, reinspectionOrderVersion: orderB.version, continuityRequestId: consumeRequest.requestId, continuityRequestSessionId: subject("technician").sessionId });
    expect(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: released.id } })).toEqual(snapshotA);
    // Exact B retry must not re-admit disposed A proof/material. Existing API
    // performs no source mutation on this path; guards remain enabled.
    expect(await proofs.executeRequest(subject("technician"), b.id, consumeRequest.requestId, consume)).toMatchObject({ state: "completed", result: { proofId: proof.id, reportId: before.id } });
    await expect(proofs.executeRequest(subject("outsider"), b.id, consumeRequest.requestId, consume)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    await expect(db.$executeRaw`UPDATE diagnostic_reports SET "continuityProofId"=${randomUUID()} WHERE id=${before.id}`).rejects.toThrow();
    await guards(false);
    const technician = suite.id("technician"), cutoff = new Date();
    await db.user.update({ where: { id: technician }, data: { deletionScheduledAt: new Date(cutoff.getTime() - 1) } });
    await guards(true);
    // Actual worker helper, loaded as source. It clears only current foreign
    // attribution, never the other customer's immutable released snapshot.
    const path = "../../../../../worker/src/jobs/diagnosticAccountErasure.ts";
    const module = await import(/* @vite-ignore */ path) as { diagnosticAccountErasureWrites(tx: Tx, uid: string, at: Date): Promise<unknown>[] };
    await db.$transaction(async tx => {
      const old = await source(tx, "users", technician);
      await withDiagnosticSourceCommand(tx, { operation: "account_purge", roots: [{ table: "users", key: { id: technician } }], rows: [{ table: "users", key: { id: technician }, verb: "update", expected: { source: old }, next: { ...old, phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null, displayName: null, avatarKey: null, avatarUploadId: null, avatarUrl: null, deletionScheduledAt: null } }], actorUserId: null, sessionId: null, cutoff, campaign: null }, async () => {
        await tx.$queryRaw`SELECT diagnostic_dispose_ownership(${technician}::text,${cutoff}::timestamp)`;
        for (const write of module.diagnosticAccountErasureWrites(tx, technician, cutoff)) await write;
        await tx.user.update({ where: { id: technician }, data: { phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null, displayName: null, avatarKey: null, avatarUploadId: null, avatarUrl: null, deletionScheduledAt: null } });
        await tx.session.deleteMany({ where: { userId: technician } });
      });
    });
    expect(await db.diagnosticContinuityRequest.findUnique({ where: { id: consumeRequest.requestId } })).toBeNull();
    const after = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({ continuityProofId: proof.id, reinspectionOrderVersion: before.reinspectionOrderVersion, continuityRequestId: null, continuityRequestSessionId: null, erasedAt: null, snapshot: before.snapshot });
    expect(after.state).toMatchObject({ authorId: null });
    expect((await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: released.id } })).snapshot).toEqual(snapshotA.snapshot);
    expect(await db.inspectionOrder.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ commissionerId: suite.id("sellerB"), erasedAt: null });
    await expect(proofs.executeRequest(subject("technician"), b.id, consumeRequest.requestId, consume)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");

  });

});
