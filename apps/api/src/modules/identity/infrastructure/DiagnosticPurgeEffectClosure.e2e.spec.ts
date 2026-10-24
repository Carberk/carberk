import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { Prisma, PrismaService, sealDiagnosticFirstObservation, withDiagnosticSourceCommand, type DiagnosticSourceCommand, type DiagnosticSourceTuple } from "@auto-tm/db";
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
import type { DiagnosticSubject } from "../../diagnostics/domain/ports/DiagnosticIntakePort";

const suite = defineE2eSuite("b1-purge-effect-closure");
const people = ["sellerA", "sellerB", "technician", "reviewer", "reception", "outsider"] as const;
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
    for (const [who, capability] of [["reception", "diagnostics.reception"], ["reception", "diagnostics.templates"], ["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"]] as const) {
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

  async function visit(who: "sellerA" | "sellerB") {
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
    for (const [actor, capability] of [["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"]] as const) order = await intake.assign(subject("reception"), id, { expectedVersion: order.version, userId: suite.id(actor), capability, active: true });
    for (const kind of ["physical", "publication"] as const) order = await intake.authorize(subject("reception"), id, { expectedVersion: order.version, kind, authorityReference: `Explicit SYNTHETIC ${kind} declaration` });
    for (const state of ["confirmed", "arrived"] as const) order = await intake.appointment(subject("reception"), id, { expectedVersion: order.version, state });
    // The actual public grant entry checks the acting current Session and actual
    // personal seller policy. No direct ownership grant INSERT is used.
    await expect(intake.grantOwnership(subject("technician"), id, { rights })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    const granted = await intake.grantOwnership(subject(who), id, { rights });
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
        await DiagnosticOwnershipCapture.append(tx, row, rawId, version, suite.id("technician"), now, { rights }, grant.id);
        await sealDiagnosticFirstObservation(tx, receipt, id, rawId);
      });
    });
    expect(await db.diagnosticSourceAnchor.findUniqueOrThrow({ where: { orderId: id } })).toMatchObject({ state: "unchanged", firstRecordId: rawId });
    await guards(false);
    const p = randomUUID(); const current = await db.inspectionOrder.findUniqueOrThrow({ where: { id } });
    await evidence.stage(subject("technician"), id, { id: p, expectedOrderVersion: current.version, contentType: "image/png", sizeBytes: png.length, rights });
    await evidence.upload(subject("technician"), id, p, { expectedOrderVersion: current.version, mime: "image/png", bytes: png });
    const provenance = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: p } });
    if (provenance.objectKey) keys.add(provenance.objectKey);
    await evidence.append(subject("technician"), id, { id: randomUUID(), expectedOrderVersion: current.version, identityRecordId: rawId, identifiers: [{ kind: "vin_stamp", location: "Synthetic chassis", value: observation.vin, provenanceIds: [p] }], rights, correction: null });
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

  it("deletes consumed proof/issue request while preserving B's report retry minimum and foreign snapshot", async () => {
    const a = await visit("sellerA"), b = await visit("sellerB"); await guards(false);
    const orderA = await db.inspectionOrder.findUniqueOrThrow({ where: { id: a.id } });
    const draft = await reports.create(subject("technician"), a.id, { reportId: randomUUID(), expectedOrderVersion: orderA.version });
    const submitted = await reports.transition(subject("technician"), draft.id, { expectedVersion: draft.version, action: "submit" });
    const released = await reports.transition(subject("reviewer"), draft.id, { expectedVersion: submitted.version, action: "finalize" });
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
