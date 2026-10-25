import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { PrismaService, withCampaignPreparation, withDiagnosticSourceCommand, } from "@auto-tm/db";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import { defineE2eSuite, seedSuiteCatalog } from "../../../../test/helpers/e2eSuite";
import { DiagnosticsModule } from "../diagnostics.module";
import { DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME, type DiagnosticIntakePort } from "../domain/ports/DiagnosticIntakePort";
import { diagnosticPlannedRow, diagnosticReceiptPrefix } from "./DiagnosticPreparedIntake";

/** AUTHORED ONLY. Never imported/executed during R3 implementation.
 * Every diagnostics action below calls the production intake port directly.
 * Test-owned receipts exist only for opposing source mutations and deliberate
 * SQL attacks, never around an unconverted intake/grant/observation caller. */
const suite = defineE2eSuite("diagnostic-prepared-intake-r3");
const localized = { en: "Synthetic", ru: "Synthetic", tk: "Synthetic" };
const definition = { title: localized, limitations: localized, syntheticNotice: localized,
  checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] };
const vin = "WVWZZZ1JZXW000001";
const people = ["seller", "reception", "technician", "other"] as const;
type Person = typeof people[number];

describe("real prepared intake, ownership collection and first capture", () => {
  let module: TestingModule, db: PrismaService, pool: Pool, intake: DiagnosticIntakePort;
  let sequence = 0, centerId: string, listingId: string;
  const allowed = new Set<string>(), userIds: string[] = [], centers: string[] = [], namespaces: string[] = [];
  const id = (alias: string) => suite.id(`${sequence}-${alias}`);
  const subject = (who: Person) => ({ userId: id(who), sessionId: id(`${who}-session`) });
  const rights = (): D.DiagnosticIdentityRights => ({ category: "vehicle_observation", purpose: "Restricted visit comparison", basis: "Authenticated seller declaration",
    provenance: "Seller supplies visit-specific authority", identifiability: "personal", use: ["service"], supplierRestrictions: "Comparison only", hold: null,
    schedule: { kind: "until", until: new Date(Date.now() + 3600_000).toISOString(), reason: "Seller-declared end" } });
  async function guards(enabled: boolean) {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate'`);
    for (const row of rows.rows) await pool.query(`ALTER TABLE public."${row.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${row.name}"`);
  }
  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [() => ({ DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private" })] }),
      EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule, JwtModule.register({ global: true, secret: "diagnostic-r3-authored-test" })] })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => new Date(), id: randomUUID, publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => allowed.has(userId) }).compile();
    db = module.get(PrismaService); intake = module.get<DiagnosticIntakePort>(DIAGNOSTIC_INTAKE_PORT);
    pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  });
  beforeEach(async () => {
    await guards(false); sequence++; allowed.clear();
    await seedSuiteCatalog(db, suite);
    for (const who of people) {
      allowed.add(id(who)); userIds.push(id(who));
      await db.user.create({ data: { id: id(who), email: `${id(who)}@r3.invalid`, emailVerifiedAt: new Date() } });
      await db.session.create({ data: { id: id(`${who}-session`), userId: id(who), refreshTokenHash: id(`${who}-refresh`), expiresAt: new Date(Date.now() + 86400_000), adminTotpExpiresAt: new Date(Date.now() + 86400_000) } });
    }
    centerId = id("center"); listingId = id("listing"); centers.push(centerId);
    await db.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: localized } });
    for (const [who, capability] of [["reception", "diagnostics.reception"], ["reception", "diagnostics.templates"], ["technician", "diagnostics.technician"]] as const) {
      await db.staffGrant.create({ data: { userId: id(who), capability } });
      await db.diagnosticCenterAssignment.create({ data: { centerId, userId: id(who), capability, qualifiedUntil: new Date(Date.now() + 86400_000) } });
    }
    await db.listing.create({ data: { id: listingId, sellerId: id("seller"), brandId: suite.catalog.brandId, modelId: suite.catalog.modelId, cityId: suite.catalog.cityId,
      vin, status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
    await guards(true);
    expect((await db.$queryRaw<{ ready: boolean }[]>`SELECT diagnostic_source_guards_ready() AS ready`)[0]?.ready).toBe(true);
  });
  afterAll(async () => {
    if (pool) {
      await guards(false);
      for (const ns of namespaces) await pool.query(`DROP SCHEMA "${ns}" CASCADE`);
      const orders = await db.inspectionOrder.findMany({ where: { centerId: { in: centers } }, select: { id: true } });
      const orderIds = orders.map(order => order.id);
      await db.diagnosticOwnershipComponent.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.diagnosticIdentityRecord.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.diagnosticOwnershipGrant.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.diagnosticAudit.deleteMany({ where: { centerId: { in: centers } } });
      await db.inspectionOrder.deleteMany({ where: { id: { in: orderIds } } });
      await db.diagnosticTemplateVersion.deleteMany({ where: { centerId: { in: centers } } });
      await db.diagnosticCenterAssignment.deleteMany({ where: { centerId: { in: centers } } });
      await db.diagnosticCenter.deleteMany({ where: { id: { in: centers } } });
      await db.listing.deleteMany({ where: { sellerId: { in: userIds } } });
      await db.dealershipMember.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await pool.end();
    }
    await module?.close();
  });
  async function readyVisit() {
    const template = await intake.publishTemplate(subject("reception"), centerId, { expectedVersion: 0, definition, synthetic: true });
    let order = await intake.create(subject("seller"), { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience: "listing_public", listingId, synthetic: true });
    order = await intake.assign(subject("reception"), order.id, { expectedVersion: order.version, userId: id("technician"), capability: "diagnostics.technician", active: true });
    for (const kind of ["physical", "publication"] as const) order = await intake.authorize(subject("reception"), order.id, { expectedVersion: order.version, kind, authorityReference: `Actual test seller request for ${kind}` });
    for (const state of ["confirmed", "arrived"] as const) order = await intake.appointment(subject("reception"), order.id, { expectedVersion: order.version, state });
    return order;
  }
  const observe = (order: D.DiagnosticOrder, grantId?: string) => intake.observeVehicle(subject("technician"), order.id, {
    expectedVersion: order.version, method: "vin", vin, manualReference: null, mileageKm: 120000, observedAt: new Date(Date.now() - 1000).toISOString(), ...(grantId ? { ownershipGrantId: grantId } : {}),
  });
  const anchor = async (orderId: string) => (await db.$queryRaw<{ state: string; firstRecordId: string | null }[]>`SELECT state,"firstRecordId" FROM diagnostic_source_anchors WHERE "orderId"=${orderId}`)[0];
  async function listingChange(nextVin: string, hold?: () => Promise<void>) {
    return db.$transaction(async tx => {
      const data = { vin: nextVin, updatedAt: new Date() };
      const plan = await diagnosticPlannedRow(tx, { table: "listings", key: { id: listingId } }, data);
      return withDiagnosticSourceCommand(tx, { operation: "listing_change", roots: [{ table: "listings", key: { id: listingId } }], rows: [plan], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, async () => {
        if (hold) await hold();
        await tx.listing.update({ where: { id: listingId }, data });
      });
    }, { timeout: 15000 });
  }
  it("actual first grants and captures independently seal A and B unchanged", async () => {
    const a = await readyVisit();
    const template = await db.diagnosticTemplateVersion.findFirstOrThrow({ where: { centerId } });
    let b = await intake.create(subject("seller"), { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience: "listing_public", listingId, synthetic: true });
    b = await intake.assign(subject("reception"), b.id, { expectedVersion: b.version, userId: id("technician"), capability: "diagnostics.technician", active: true });
    for (const kind of ["physical", "publication"] as const) b = await intake.authorize(subject("reception"), b.id, { expectedVersion: b.version, kind, authorityReference: `Seller B ${kind}` });
    for (const state of ["confirmed", "arrived"] as const) b = await intake.appointment(subject("reception"), b.id, { expectedVersion: b.version, state });
    for (const visit of [a, b]) {
      const grant = await intake.grantOwnership(subject("seller"), visit.id, { rights: rights() });
      await observe(visit, grant.id);
      expect(await anchor(visit.id)).toMatchObject({ state: "unchanged", firstRecordId: expect.any(String) });
      expect(await intake.identityRecords(subject("technician"), visit.id)).toHaveLength(1);
    }
  });
  it("no-grant first observation succeeds unavailable and late grant/reobservation cannot repair it", async () => {
    const visit = await readyVisit();
    const next = await observe(visit);
    const first = await anchor(visit.id); expect(first?.state).toBe("unavailable");
    await expect(intake.grantOwnership(subject("seller"), visit.id, { rights: rights() })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    await observe(next);
    expect(await anchor(visit.id)).toEqual(first);
  });
  it("wrong/foreign/revoked grants and invalid Sessions roll back raw, component, audit and first claim", async () => {
    const visit = await readyVisit();
    await expect(intake.grantOwnership(subject("other"), visit.id, { rights: rights() })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    await expect(intake.grantOwnership({ ...subject("seller"), sessionId: id("other-session") }, visit.id, { rights: rights() })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    await expect(intake.grantOwnership(subject("seller"), visit.id, { rights: { ...rights(), schedule: { kind: "until", until: new Date(Date.now() - 1).toISOString(), reason: "Expired" } } })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    const template = await db.diagnosticTemplateVersion.findFirstOrThrow({ where: { centerId } });
    const foreign = await intake.create(subject("seller"), { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience: "listing_public", listingId, synthetic: true });
    const foreignGrant = await intake.grantOwnership(subject("seller"), foreign.id, { rights: rights() });
    await expect(observe(visit, foreignGrant.id)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    const grant = await intake.grantOwnership(subject("seller"), visit.id, { rights: rights() });
    await intake.revokeOwnership(subject("seller"), visit.id, grant.id);
    const audits = await db.diagnosticAudit.count({ where: { orderId: visit.id } });
    for (const reference of [randomUUID(), grant.id]) await expect(observe(visit, reference)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    expect(await db.diagnosticIdentityRecord.count({ where: { orderId: visit.id } })).toBe(0);
    expect(await db.diagnosticOwnershipComponent.count({ where: { orderId: visit.id } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId: visit.id } })).toBe(audits);
    expect((await anchor(visit.id))?.firstRecordId).toBeNull();
  });
  it("failure while sealing the real first capture rolls back raw, component, audit and slot together", async () => {
    const visit = await readyVisit(), grant = await intake.grantOwnership(subject("seller"), visit.id, { rights: rights() });
    const audits = await db.diagnosticAudit.count({ where: { orderId: visit.id } });
    await pool.query(`CREATE FUNCTION diagnostic_r3_fail_seal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'r3_rollback_seal'; END $$;
      CREATE TRIGGER diagnostic_r3_fail_seal AFTER UPDATE ON diagnostic_source_anchors FOR EACH ROW EXECUTE FUNCTION diagnostic_r3_fail_seal()`);
    try { await expect(observe(visit, grant.id)).rejects.toThrow(); }
    finally { await pool.query("DROP TRIGGER diagnostic_r3_fail_seal ON diagnostic_source_anchors; DROP FUNCTION diagnostic_r3_fail_seal()"); }
    expect(await db.diagnosticIdentityRecord.count({ where: { orderId: visit.id } })).toBe(0);
    expect(await db.diagnosticOwnershipComponent.count({ where: { orderId: visit.id } })).toBe(0);
    expect(await db.diagnosticAudit.count({ where: { orderId: visit.id } })).toBe(audits);
    expect(await anchor(visit.id)).toMatchObject({ state: "pending", firstRecordId: null });
  });
  it("Listing mutate-restore before first capture stays changed even though its value equals the grant again", async () => {
    const visit = await readyVisit(), grant = await intake.grantOwnership(subject("seller"), visit.id, { rights: rights() });
    await listingChange("WVWZZZ1JZXW000002"); await listingChange(vin);
    await observe(visit, grant.id);
    expect((await anchor(visit.id))?.state).toBe("changed");
  });
  it.each(["source", "observation"] as const)("actual observation serializes with Listing change when %s owns the prefix first", async first => {
    const visit = await readyVisit(), grant = await intake.grantOwnership(subject("seller"), visit.id, { rights: rights() });
    let release: () => void = () => undefined, entered: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    if (first === "source") {
      const source = listingChange("WVWZZZ1JZXW000002", async () => { entered(); await gate; });
      await ready;
      const capture = observe(visit, grant.id).catch((error: unknown) => error);
      try {
        const deadline = Date.now() + 5000; let blocked = false;
        while (Date.now() < deadline) {
          const rows = await pool.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%diagnostic_prepare_source%') blocked");
          if (rows.rows[0]?.blocked) { blocked = true; break; }
        }
        expect(blocked).toBe(true);
      } finally { release(); }
      await source; expect(await capture).toBeInstanceOf(Error);
      expect(await db.diagnosticIdentityRecord.count({ where: { orderId: visit.id } })).toBe(0);
    } else {
      // A test-only raw INSERT gate holds the REAL caller after it owns the full
      // source prefix. The opposing source transaction must wait for that caller.
      const blocker = await pool.connect();
      await blocker.query("SELECT pg_advisory_lock(1897,hashtext($1))", [visit.id]);
      await pool.query(`CREATE FUNCTION public.diagnostic_r3_raw_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(1897,hashtext(NEW."orderId")); RETURN NEW; END $$;
        CREATE TRIGGER diagnostic_r3_raw_gate BEFORE INSERT ON diagnostic_identity_records FOR EACH ROW EXECUTE FUNCTION diagnostic_r3_raw_gate()`);
      const capture = observe(visit, grant.id);
      try {
        const deadline = Date.now() + 5000; let blocked = false;
        while (Date.now() < deadline) {
          const rows = await pool.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%INSERT%diagnostic_identity_records%') blocked");
          if (rows.rows[0]?.blocked) { blocked = true; break; }
        }
        expect(blocked).toBe(true);
        const source = listingChange("WVWZZZ1JZXW000002");
        const sourceDeadline = Date.now() + 5000; let sourceBlocked = false;
        while (Date.now() < sourceDeadline) {
          const rows = await pool.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%diagnostic_prepare_source%') blocked");
          if (rows.rows[0]?.blocked) { sourceBlocked = true; break; }
        }
        expect(sourceBlocked).toBe(true);
        await blocker.query("SELECT pg_advisory_unlock(1897,hashtext($1))", [visit.id]);
        await capture; await source;
        expect((await anchor(visit.id))?.state).toBe("changed");
        expect(await db.diagnosticIdentityRecord.count({ where: { orderId: visit.id } })).toBe(1);
      } finally {
        await blocker.query("SELECT pg_advisory_unlock_all()"); blocker.release();
        await pool.query("DROP TRIGGER diagnostic_r3_raw_gate ON diagnostic_identity_records; DROP FUNCTION diagnostic_r3_raw_gate()");
      }
    }
  });
  it("real receipt adoption rejects another backend, a finished transaction and a different operation", async () => {
    const visit = await readyVisit();
    const receipt = await db.$transaction(async tx => {
      const row = await diagnosticPlannedRow(tx, { table: "inspection_orders", key: { id: visit.id } }, {});
      return withDiagnosticSourceCommand(tx, { operation: "order_change", roots: [], rows: [row], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, async prepared => {
        await expect(db.$transaction(other => diagnosticReceiptPrefix(other, prepared, "order_change"))).rejects.toThrow("diagnostic_source_receipt");
        // Keep this operation check on the actual receipt backend. Recover only
        // the intentional assertion failure; no diagnostic caller is wrapped.
        await tx.$executeRawUnsafe("SAVEPOINT r3_wrong_operation");
        await expect(diagnosticReceiptPrefix(tx, prepared, "observation_append")).rejects.toThrow("diagnostic_source_receipt");
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT r3_wrong_operation");
        return prepared;
      });
    });
    await expect(db.$transaction(tx => diagnosticReceiptPrefix(tx, receipt, "order_change"))).rejects.toThrow("diagnostic_source_receipt");
  });
  it("assigns exactly the runtime-selected reception subset, independently of other qualified staff", async () => {
    await guards(false);
    await db.staffGrant.create({ data: { userId: id("other"), capability: "diagnostics.reception" } });
    await db.diagnosticCenterAssignment.create({ data: { centerId, userId: id("other"), capability: "diagnostics.reception", qualifiedUntil: new Date(Date.now() + 86400_000) } });
    await guards(true); allowed.delete(id("other"));
    const template = await intake.publishTemplate(subject("reception"), centerId, { expectedVersion: 0, definition, synthetic: true });
    const order = await intake.create(subject("seller"), { requestKey: randomUUID(), centerId, templateVersionId: template.id, audience: "buyer_private", synthetic: true });
    expect(await db.diagnosticOrderAssignment.findMany({ where: { orderId: order.id }, select: { userId: true, capability: true } })).toEqual([{ userId: id("reception"), capability: "diagnostics.reception" }]);
    await expect(intake.read(subject("other"), order.id)).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  it("OWNER membership identity removal/restoration before first capture never repairs the original witness", async () => {
    await guards(false);
    const businessId = id("business"), memberId = id("owner-member");
    await db.dealership.create({ data: { id: businessId, slug: businessId, name: "R3 owned fixture", status: "active" } });
    await db.dealershipMember.create({ data: { id: memberId, userId: id("seller"), dealershipId: businessId, role: "owner" } });
    await db.listing.update({ where: { id: listingId }, data: { businessId } });
    await guards(true);
    const visit = await readyVisit(), grant = await intake.grantOwnership(subject("seller"), visit.id, { rights: rights() });
    await db.$transaction(async tx => {
      const plan = await diagnosticPlannedRow(tx, { table: "dealership_members", key: { id: memberId } }, null);
      await withDiagnosticSourceCommand(tx, { operation: "member_remove", roots: [{ table: "dealership_members", key: { id: memberId } }], rows: [plan], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, () => tx.dealershipMember.delete({ where: { id: memberId } }));
    });
    await db.$transaction(async tx => {
      const data = { id: memberId, userId: id("seller"), dealershipId: businessId, role: "owner" as const, status: "active" };
      const plan = await diagnosticPlannedRow(tx, { table: "dealership_members", key: { id: memberId } }, data, true);
      await withDiagnosticSourceCommand(tx, { operation: "member_create", roots: [{ table: "users", key: { id: id("seller") } }], rows: [plan], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, () => tx.dealershipMember.create({ data }));
    });
    await observe(visit, grant.id); expect((await anchor(visit.id))?.state).toBe("changed");
  });
  it("real first/repeat campaign template admission preserves the hashed bootstrap deadline; public intake stays refused", async () => {
    const reservation = randomUUID().replaceAll("-", ""), candidate = "c".repeat(40), ns = `cf_${reservation}`; namespaces.push(ns);
    await guards(false);
    const setup = execFileSync(process.execPath, ["scripts/testing/campaign-preparation-fixture.mjs", "campaign897-full-v3", reservation, candidate], { cwd: resolve(__dirname, "../../../../../.."), encoding: "utf8" });
    await pool.query(setup); await guards(true);
    const actor = (await pool.query<{ user_id: string }>(`SELECT user_id FROM "${ns}".campaign_entities WHERE alias='reception-steward'`)).rows[0]?.user_id;
    if (!actor) throw new Error("missing campaign actor");
    module.get(ConfigService).set("AUTOTM_COMMIT_SHA", candidate);
    const sessionId = randomUUID();
    await db.$transaction(tx => withCampaignPreparation(tx, [{ table: "sessions", key: { id: sessionId }, verb: "insert", next: { userId: actor } }], () => tx.session.create({ data: { id: sessionId, userId: actor, refreshTokenHash: sessionId, expiresAt: new Date(Date.now() + 3600_000), adminTotpExpiresAt: new Date(Date.now() + 3600_000) } })));
    const [center] = await db.$queryRaw<{ id: string }[]>`SELECT diagnostic_intake_uuid(${`${reservation}:campaign897:diagnostics:center:${reservation}:${candidate}`}) id`;
    if (!center) throw new Error("missing derived center"); centers.push(center.id);
    const campaignSubject = { userId: actor, sessionId };
    // Hold the first real authority INSERT after its prepared absent center and
    // unique slots. The competing real publication must wait, then reject stale
    // discovery/version rather than duplicate the first bootstrap.
    const blocker = await pool.connect();
    await blocker.query("SELECT pg_advisory_lock(1898,hashtext($1))", [center.id]);
    await pool.query(`CREATE FUNCTION diagnostic_r3_center_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(1898,hashtext(NEW.id)); RETURN NEW; END $$;
      CREATE TRIGGER diagnostic_r3_center_gate BEFORE INSERT ON diagnostic_centers FOR EACH ROW EXECUTE FUNCTION diagnostic_r3_center_gate()`);
    let template: D.DiagnosticTemplate;
    try {
      const first = intake.publishTemplate(campaignSubject, center.id, { expectedVersion: 0, definition, synthetic: true });
      const deadline = Date.now() + 5000; let blocked = false;
      while (Date.now() < deadline) {
        const result = await pool.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%campaign_diagnostic_authority%') blocked");
        if (result.rows[0]?.blocked) { blocked = true; break; }
      }
      expect(blocked).toBe(true);
      const second = intake.publishTemplate(campaignSubject, center.id, { expectedVersion: 0, definition, synthetic: true });
      const results = Promise.allSettled([first, second]);
      const contenderDeadline = Date.now() + 5000; let contenderBlocked = false;
      while (Date.now() < contenderDeadline) {
        const result = await pool.query<{ blocked: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%diagnostic_prepare_source%') blocked");
        if (result.rows[0]?.blocked) { contenderBlocked = true; break; }
      }
      expect(contenderBlocked).toBe(true);
      await blocker.query("SELECT pg_advisory_unlock(1898,hashtext($1))", [center.id]);
      const settled = await results;
      expect(settled.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const winner = settled.find(result => result.status === "fulfilled");
      if (!winner || winner.status !== "fulfilled") throw new Error("no first publication");
      template = winner.value;
    } finally {
      await blocker.query("SELECT pg_advisory_unlock_all()"); blocker.release();
      await pool.query("DROP TRIGGER diagnostic_r3_center_gate ON diagnostic_centers; DROP FUNCTION diagnostic_r3_center_gate()");
    }
    const binding = (await pool.query(`SELECT * FROM "${ns}".campaign_diagnostic_binding`)).rows[0];
    expect(await db.diagnosticCenterAssignment.count({ where: { centerId: center.id } })).toBe(2);
    expect(await db.diagnosticAudit.count({ where: { centerId: center.id, action: { in: ["CENTER_SYNTHETIC_BOOTSTRAPPED", "CENTER_QUALIFICATION_SYNTHETIC"] } } })).toBe(3);
    await intake.templates(campaignSubject, center.id);
    await intake.publishTemplate(campaignSubject, center.id, { expectedVersion: 1, definition, synthetic: true });
    expect((await pool.query(`SELECT * FROM "${ns}".campaign_diagnostic_binding`)).rows[0]).toEqual(binding);
    await expect(intake.create(campaignSubject, { centerId: center.id, templateVersionId: template.id, requestKey: randomUUID(), audience: "listing_public", listingId, synthetic: true })).rejects.toThrow("DIAGNOSTIC_NO_ACCESS");
    const before = await db.diagnosticTemplateVersion.count({ where: { centerId: center.id } });
    for (const badSubject of [{ userId: actor, sessionId: randomUUID() }, subject("other")]) {
      await expect(intake.publishTemplate(badSubject, center.id, { expectedVersion: 2, definition, synthetic: true })).rejects.toThrow();
    }
    await expect(intake.publishTemplate(campaignSubject, randomUUID(), { expectedVersion: 0, definition, synthetic: true })).rejects.toThrow();
    for (const mode of ["extra-row", "extra-intent", "missing-session", "wrong-session", "naked-delete"] as const) {
      await expect(db.$transaction(async tx => {
        const target = randomUUID();
        const row = await diagnosticPlannedRow(tx, { table: "diagnostic_template_versions", key: { id: target } }, { id: target, centerId: center.id, version: 3, definition, synthetic: true, publishedById: actor, publishedAt: new Date() }, true);
        const command = { operation: "template_publish", roots: [{ table: "diagnostic_centers", key: { id: center.id } }], rows: mode === "extra-row" ? [row, row] : [row],
          actorUserId: actor, sessionId: mode === "missing-session" ? null : mode === "wrong-session" ? randomUUID() : sessionId, cutoff: null, campaign: null,
          intent: { campaignAdmission: true, ...(mode === "extra-intent" ? { effects: [] } : {}) } };
        const [receipt] = await tx.$queryRaw<{ receipt: string }[]>`SELECT diagnostic_prepare_source(${JSON.stringify(command)}::jsonb)::text receipt`;
        if (!receipt) throw new Error("missing attack receipt");
        await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receipt}::uuid`;
      })).rejects.toThrow();
    }
    for (const completion of ["finish", "delete"] as const) for (const change of ["hash", "candidate", "dependency"] as const) {
      await expect(db.$transaction(async tx => {
        const target = randomUUID();
        const [clock] = await tx.$queryRaw<{ at: Date; auditId: string }[]>`SELECT transaction_timestamp()::timestamp(3) at, diagnostic_intake_uuid(${'diagnostic-source:template_publish:' + target}) AS "auditId"`;
        if (!clock) throw new Error("missing clock");
        const data = { id: target, centerId: center.id, version: 3, definition, synthetic: true, publishedById: actor, publishedAt: clock.at };
        const row = await diagnosticPlannedRow(tx, { table: "diagnostic_template_versions", key: { id: target } }, data, true);
        const command = { operation: "template_publish", roots: [], rows: [row], actorUserId: actor, sessionId, cutoff: null, campaign: null, intent: { campaignAdmission: true } };
        const [prepared] = await tx.$queryRaw<{ receipt: string }[]>`SELECT diagnostic_prepare_source(${JSON.stringify(command)}::jsonb)::text receipt`;
        if (!prepared) throw new Error("missing completion receipt");
        await tx.$queryRawUnsafe(`SELECT "${ns}".campaign_diagnostic_authority($1,$2,$3,NULL,NULL,NULL,$4)`, actor, sessionId, center.id, candidate);
        await tx.diagnosticTemplateVersion.create({ data });
        await tx.diagnosticAudit.create({ data: { id: clock.auditId, centerId: center.id, actorId: actor, action: "TEMPLATE_PUBLISHED", details: { templateVersionId: target, version: 3, synthetic: true }, createdAt: clock.at } });
        // All declared writes exist. Completion must still reject a changed
        // original authority hash/candidate or retained protected dependency.
        if (change === "hash") await tx.$executeRawUnsafe(`UPDATE "${ns}".campaign_manifest SET diagnostic_contract_hash='stale'`);
        else if (change === "candidate") await tx.$executeRawUnsafe(`UPDATE "${ns}".campaign_manifest SET candidate=repeat('0',40)`);
        else await tx.$executeRaw`UPDATE sessions SET "expiresAt"=transaction_timestamp()-interval '1 minute' WHERE id=${sessionId}`;
        if (completion === "finish") await tx.$queryRaw`SELECT diagnostic_finish_source(${prepared.receipt}::uuid)`;
        else await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${prepared.receipt}::uuid`;
      })).rejects.toThrow();
    }
    expect(await db.diagnosticTemplateVersion.count({ where: { centerId: center.id } })).toBe(before);
    // This refusal is a preserved negative; it is not the automatic public 201 proof.
  });
});
