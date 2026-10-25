import { createHash, randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExpireMeasurement } from "./ExpireMeasurement";
import { PrismaMeasurementRetentionLedger } from "./PrismaMeasurementRetentionLedger";
import { PurgeExpiredAccounts } from "./PurgeExpiredAccounts";
import { PrismaMeasurementCollector } from "./measurementOutbox";
import { MeasurementRetentionPostgresFixture, retentionConnection, retentionStore } from "./application/testing/MeasurementRetentionPostgresFixture";

const DAY = 86400000;
const now = new Date("1980-05-01T00:00:00Z");
const purgeDueAt = new Date(now.getTime() - DAY);
const oldVisit = new Date(now.getTime() - 90 * DAY);
const fresh = new Date(now.getTime() + DAY);
const collectorLock = (sql: string) => sql.includes('FROM "measurement_state"') && sql.includes("FOR UPDATE");

/** Direct PostgreSQL suite; test:unit excludes this file. Exact run receipts
 * distinguish executed cases from the still-failing purge dependency gates.
 * Missing hosted disposable isolation fails explicitly, never silently skips.
 * Purge opponent is exactly dependency 311637ca, not a source-command facsimile.
 * Intended post-preparation outcomes stay asserted even when an earlier
 * dependency defect prevents reaching the lock barrier. No erased-source
 * command is written by a test to substitute for this production opponent. */
describe("G1 adjacent measurement retention on real PostgreSQL", () => {
 let f: MeasurementRetentionPostgresFixture;
 beforeEach(async () => { f = new MeasurementRetentionPostgresFixture(now); await f.open(); });
 afterEach(async () => { if (f) await f.close(); });

 const ledger = () => new PrismaMeasurementRetentionLedger(f.db);
 async function rollup(expiresAt = now) {
  return f.db.measurementRollup.create({ data: { key: randomUUID(), version: 1, epoch: f.epoch, environment: "test", population: "synthetic",
   windowFrom: now, windowTo: now, completeThrough: now, inputDigest: "synthetic", metrics: {}, generatedAt: now, expiresAt } });
 }
 async function artifact(expiresAt = now) {
  const session = await f.db.session.create({ data: { userId: f.user, refreshTokenHash: createHash("sha256").update(randomUUID()).digest("hex"), expiresAt: fresh } });
  const audit = await f.db.auditLog.create({ data: { actorId: f.user, action: "measurement.investigation.export", targetType: "measurement", targetId: session.id } });
  f.auditIds.push(audit.id);
  return f.db.measurementInvestigationExport.create({ data: { id: randomUUID(), actorId: f.user, sessionId: session.id, epoch: f.epoch,
   reason: "Synthetic retention ordering fixture", auditId: audit.id, scope: {}, evidence: {}, expiresAt } });
 }
 async function dueAccount() {
  const account = await f.account(f.user, oldVisit);
  const raw = await f.raw(account.principal.id, account.visit);
  const queued = await f.outbox(account.principal.id);
  await f.db.user.update({ where: { id: f.user }, data: { deletionScheduledAt: purgeDueAt } });
  return { ...account, raw, queued };
 }
 async function collect(db = f.db, event = f.event(), account?: Awaited<ReturnType<typeof f.account>>) {
  const principal = account?.principal ?? (await f.account()).principal;
  return new PrismaMeasurementCollector(db).appendIfEligible({ event, principalId: principal.id, generation: principal.generation,
   epoch: principal.epoch, environment: "test", population: "synthetic", conversionEligible: false });
 }
 async function refusedPurge(task: Promise<unknown>, reason = "diagnostic_source_final_effect") {
  // Static expectation once the accepted caller can reach preparation. Its
  // unrecognized intent currently refuses earlier; keep the later gate visible.
  await expect(task).rejects.toThrow(reason);
  expect(await f.db.user.findUniqueOrThrow({ where: { id: f.user }, select: { displayName: true, deletionScheduledAt: true } }))
   .toEqual({ displayName: "Synthetic due account", deletionScheduledAt: purgeDueAt });
 }

 it("keeps six independent limits, inclusive boundaries, cascade counts and backlog", async () => {
  const old = await f.account(f.user, oldVisit);
  const guest = await f.guest(oldVisit);
  const account = await f.account();
  const dueRaw = await Promise.all([f.raw(account.principal.id, account.visit), f.raw(account.principal.id, account.visit)]);
  const dueOutbox = await Promise.all([f.outbox(account.principal.id), f.outbox(account.principal.id)]);
  const freshRaw = await f.raw(account.principal.id, account.visit, fresh);
  const freshOutbox = await f.outbox(account.principal.id, fresh);
  const freshRollup = await rollup(fresh), freshArtifact = await artifact(fresh);
  await rollup(); await rollup(); await artifact(); await artifact();
  await f.guards(true);
  const result = await new ExpireMeasurement(ledger()).execute(now, { batchSize: 1, maxBatches: 1 });
  expect(result).toEqual({ deleted: 6, oldestOverdueAt: now, overdueMs: 0, healthy: true });
  expect(await f.db.measurementRecord.count({ where: { id: { in: dueRaw.map(row => row.id) } } })).toBe(1);
  expect(await f.db.measurementOutbox.count({ where: { id: { in: dueOutbox.map(row => row.id) } } })).toBe(1);
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: guest.principal.id } })).toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: guest.visit } })).toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: old.visit } })).toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: account.visit } })).not.toBeNull();
  expect((await new ExpireMeasurement(ledger()).execute(now, { batchSize: 1 })).deleted).toBe(4);
  expect(await ledger().oldestExpired(now)).toBeNull();
  expect(await f.db.measurementRecord.findUnique({ where: { id: freshRaw.id } })).not.toBeNull();
  expect(await f.db.measurementOutbox.findUnique({ where: { id: freshOutbox.id } })).not.toBeNull();
  expect(await f.db.measurementRollup.findUnique({ where: { key: freshRollup.key } })).not.toBeNull();
  expect(await f.db.measurementInvestigationExport.findUnique({ where: { id: freshArtifact.id } })).not.toBeNull();
  expect(await f.db.user.findUnique({ where: { id: f.user } })).not.toBeNull();
 });

 it("refuses absent collector before facts and leaves bootstrap and delivery closed", async () => {
  const account = await f.account(), raw = await f.raw(account.principal.id, null);
  await f.db.measurementState.delete({ where: { key: "collector" } });
  const store = await retentionStore(f.db, f.epoch, now);
  expect(await store.bootstrap({})).toBeNull();
  expect(await store.bootstrap({ authenticatedUserId: f.user })).toBeNull();
  expect(await collect(f.db, f.event(), account)).toBe("revoked");
  await expect(new ExpireMeasurement(ledger()).execute(now)).rejects.toThrow("Measurement retention unavailable");
  expect(await f.db.measurementRecord.findUnique({ where: { id: raw.id } })).not.toBeNull();
  expect(await f.db.measurementState.findUnique({ where: { key: "collector" } })).toBeNull();
  expect(await ledger().oldestExpired(now)).toEqual(now);
 });

 it("uses the actual current epoch fence while expiring restored older-epoch due facts", async () => {
  const account = await f.account();
  await f.db.measurementPrincipal.update({ where: { id: account.principal.id }, data: { epoch: "previous-restored-epoch" } });
  const raw = await f.raw(account.principal.id, null);
  expect(await collect(f.db, f.event(), account)).toBe("revoked");
  expect(await ledger().deleteExpired(now, 1)).toBe(1);
  expect(await f.db.measurementRecord.findUnique({ where: { id: raw.id } })).toBeNull();
  expect((await f.db.measurementState.findUniqueOrThrow({ where: { key: "collector" } })).epoch).toBe(f.epoch);
 });

 it("SKIP LOCKED leaves a locked due record and reports its exact lag", async () => {
  const account = await f.account();
  const due = new Date(now.getTime() - 2 * DAY);
  const locked = await f.raw(account.principal.id, null, due), other = await f.raw(account.principal.id, null);
  const held = f.gate(), release = f.gate();
  const holder = f.start(f.db.$transaction(async tx => {
   await tx.$queryRaw`SELECT id FROM measurement_records WHERE id=${locked.id} FOR UPDATE`;
   held.release(); await release.promise;
  }, { timeout: 10000 }));
  try {
   await f.reached(held, holder);
   expect(await new ExpireMeasurement(ledger()).execute(now, { batchSize: 1, maxBatches: 1 }))
    .toEqual({ deleted: 1, oldestOverdueAt: due, overdueMs: 2 * DAY, healthy: false });
   expect(await f.db.measurementRecord.findUnique({ where: { id: locked.id } })).not.toBeNull();
   expect(await f.db.measurementRecord.findUnique({ where: { id: other.id } })).toBeNull();
  } finally { release.release(); await Promise.allSettled([holder]); }
  expect(await ledger().deleteExpired(now, 1)).toBe(1);
 });

 it("times out at a busy collector before deleting any raw, outbox or parent", async () => {
  const account = await dueAccount(), held = f.gate(), release = f.gate();
  const holder = f.start(f.db.$transaction(async tx => {
   await tx.$queryRaw`SELECT epoch FROM measurement_state WHERE key='collector' FOR SHARE`;
   held.release(); await release.promise;
  }, { timeout: 10000 }));
  try {
   await f.reached(held, holder);
   await expect(new ExpireMeasurement(ledger()).execute(now)).rejects.toThrow("Measurement retention unavailable");
   expect(await f.db.measurementRecord.findUnique({ where: { id: account.raw.id } })).not.toBeNull();
   expect(await f.db.measurementOutbox.findUnique({ where: { id: account.queued.id } })).not.toBeNull();
   expect(await f.db.measurementVisit.findUnique({ where: { id: account.visit } })).not.toBeNull();
  } finally { release.release(); await Promise.allSettled([holder]); }
  expect(await ledger().deleteExpired(now, 1)).toBe(3);
 });

 it.each(["measurement_records", "measurement_outbox", "measurement_principals", "measurement_visits", "measurement_rollups", "measurement_investigation_exports"])
 ("rolls the entire sweep back after the real %s delete", async table => {
  const account = await dueAccount(), guest = await f.guest(oldVisit);
  const snapshot = await rollup(), exported = await artifact();
  await f.guards(true);
  const failing = retentionConnection(f.db, "retention-rollback", async sql => {
   if (sql.includes(`DELETE FROM "${table}"`)) throw new Error(`retention_fixture_rollback_${table}`);
  });
  await expect(new ExpireMeasurement(new PrismaMeasurementRetentionLedger(failing)).execute(now)).rejects.toThrow("Measurement retention unavailable");
  expect(await f.db.measurementRecord.findUnique({ where: { id: account.raw.id } })).not.toBeNull();
  expect(await f.db.measurementOutbox.findUnique({ where: { id: account.queued.id } })).not.toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: account.visit } })).not.toBeNull();
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: guest.principal.id } })).not.toBeNull();
  expect(await f.db.measurementRollup.findUnique({ where: { key: snapshot.key } })).not.toBeNull();
  expect(await f.db.measurementInvestigationExport.findUnique({ where: { id: exported.id } })).not.toBeNull();
  expect(await ledger().deleteExpired(now, 10)).toBe(6);
 });

 it.each(["collector-first", "retention-first"])("serializes actual collector append and retention in %s order", async order => {
  const account = await f.account(), old = await f.raw(account.principal.id, null), event = f.event();
  const held = f.gate(), release = f.gate();
  const db = retentionConnection(f.db, "first", async sql => {
   if (order === "collector-first" ? sql.includes('FROM "measurement_state"') : collectorLock(sql)) { held.release(); await release.promise; }
  });
  const first = f.start<unknown>(order === "collector-first" ? collect(db, event, account) : new PrismaMeasurementRetentionLedger(db).deleteExpired(now, 1));
  let second: Promise<unknown> | undefined;
  try {
   await f.reached(held, first);
   const next = retentionConnection(f.db, "second");
   second = f.start<unknown>(order === "collector-first" ? new PrismaMeasurementRetentionLedger(next).deleteExpired(now, 1) : collect(next, event, account));
   await f.blocked("second", "first");
  } finally { release.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await first).toBe(order === "collector-first" ? "accepted" : 1);
  expect(await second).toBe(order === "collector-first" ? 1 : "accepted");
  expect(await f.db.measurementRecord.findUnique({ where: { id: old.id } })).toBeNull();
  expect(await f.db.measurementRecord.count({ where: { id: event.eventId } })).toBe(1);
  expect(await collect(f.db, event, account)).toBe("duplicate");
 });

 it.each(["purge-first", "retention-first"])("orders the exact production purge dependency and retention in %s order, retaining purge refusal rollback", async order => {
  const account = await dueAccount(), foreign = await f.guest();
  const foreignRaw = await f.raw(foreign.principal.id, foreign.visit, fresh);
  await f.guards(true);
  const held = f.gate(), release = f.gate();
  const db = retentionConnection(f.db, "first", async sql => {
   if (order === "purge-first" ? sql.includes("diagnostic_prepare_source") : collectorLock(sql)) { held.release(); await release.promise; }
  });
  const first = f.start<unknown>(order === "purge-first" ? new PurgeExpiredAccounts(db).execute({ now }) : new PrismaMeasurementRetentionLedger(db).deleteExpired(now, 1));
  let second: Promise<unknown> | undefined;
  try {
   await f.reached(held, first);
   const next = retentionConnection(f.db, "second");
   second = f.start<unknown>(order === "purge-first" ? new PrismaMeasurementRetentionLedger(next).deleteExpired(now, 1) : new PurgeExpiredAccounts(next).execute({ now }));
   await f.blocked("second", "first");
  } finally { release.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  if (!second) throw new Error("Missing actual production opponent");
  await refusedPurge(order === "purge-first" ? first : second, order === "purge-first" ? "diagnostic_source_final_effect" : "diagnostic_source_graph_changed");
  expect(await (order === "purge-first" ? second : first)).toBe(3);
  expect(await f.db.measurementRecord.findUnique({ where: { id: account.raw.id } })).toBeNull();
  expect(await f.db.measurementOutbox.findUnique({ where: { id: account.queued.id } })).toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: account.visit } })).toBeNull();
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: account.principal.id } })).not.toBeNull();
  expect(await f.db.measurementRecord.findUnique({ where: { id: foreignRaw.id } })).not.toBeNull();
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: foreign.principal.id } })).not.toBeNull();
 });

 it("drains actual collector, purge and retention overlap with specific committed and refused outcomes", async () => {
  await dueAccount(); const foreign = await f.account(f.foreignUser);
  await f.guards(true);
  const held = f.gate(), release = f.gate();
  const first = retentionConnection(f.db, "collector", async sql => {
   if (sql.includes('FROM "measurement_state"')) { held.release(); await release.promise; }
  });
  const event = f.event(), collector = f.start(collect(first, event, foreign));
  let purge: Promise<unknown> | undefined, sweep: Promise<unknown> | undefined;
  try {
   await f.reached(held, collector);
   purge = f.start(new PurgeExpiredAccounts(retentionConnection(f.db, "purge")).execute({ now }));
   await f.blocked("purge", "collector");
   sweep = f.start(new PrismaMeasurementRetentionLedger(retentionConnection(f.db, "retention")).deleteExpired(now, 1));
   await f.blocked("retention", "collector");
  } finally { release.release(); await Promise.allSettled([collector, ...(purge ? [purge] : []), ...(sweep ? [sweep] : [])]); }
  if (!purge || !sweep) throw new Error("Missing three-way production opposition");
  expect(await collector).toBe("accepted"); await refusedPurge(purge); expect(await sweep).toBe(3);
  expect(await f.db.measurementRecord.findUnique({ where: { id: event.eventId } })).not.toBeNull();
  expect(await ledger().oldestExpired(now)).toBeNull();
 });

 it("serializes overlapping real sweeps without double-counting", async () => {
  const account = await f.account(); await f.raw(account.principal.id, null); await f.raw(account.principal.id, null);
  const held = f.gate(), release = f.gate();
  const first = f.start(new PrismaMeasurementRetentionLedger(retentionConnection(f.db, "sweep-1", async sql => {
   if (collectorLock(sql)) { held.release(); await release.promise; }
  })).deleteExpired(now, 1));
  let second: Promise<number> | undefined;
  try {
   await f.reached(held, first);
   second = f.start(new PrismaMeasurementRetentionLedger(retentionConnection(f.db, "sweep-2")).deleteExpired(now, 1));
   await f.blocked("sweep-2", "sweep-1");
  } finally { release.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await first).toBe(1); expect(await second).toBe(1);
  expect(await f.db.measurementRecord.count()).toBe(0); expect(await ledger().oldestExpired(now)).toBeNull();
 });

 it("allows the real prepared purge to complete for an already-erased measurement account beside foreign retention", async () => {
  const foreign = await f.account(f.foreignUser), raw = await f.raw(foreign.principal.id, null);
  await f.db.user.update({ where: { id: f.user }, data: { deletionScheduledAt: purgeDueAt } });
  await f.guards(true);
  expect(await new PurgeExpiredAccounts(f.db).execute({ now })).toEqual({ purgedCount: 1 });
  expect(await ledger().deleteExpired(now, 1)).toBe(1);
  expect(await f.db.user.findUniqueOrThrow({ where: { id: f.user }, select: { displayName: true, deletionScheduledAt: true } }))
   .toEqual({ displayName: null, deletionScheduledAt: null });
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: foreign.principal.id } })).not.toBeNull();
  expect(await f.db.measurementRecord.findUnique({ where: { id: raw.id } })).toBeNull();
 });

 it("records current production purge intent refusal with atomic preservation before the ordering gate", async () => {
  const account = await dueAccount(), foreign = await f.guest();
  const retained = await f.raw(foreign.principal.id, foreign.visit, fresh);
  await f.guards(true);
  // A diagnosis of exact311637ca, not acceptance of this caller's behavior.
  await expect(new PurgeExpiredAccounts(f.db).execute({ now })).rejects.toThrow("diagnostic_source_command");
  expect(await f.db.user.findUniqueOrThrow({ where: { id: f.user }, select: { displayName: true, deletionScheduledAt: true } }))
   .toEqual({ displayName: "Synthetic due account", deletionScheduledAt: purgeDueAt });
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: account.principal.id } })).not.toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: account.visit } })).not.toBeNull();
  expect(await f.db.measurementRecord.findUnique({ where: { id: account.raw.id } })).not.toBeNull();
  expect(await f.db.measurementOutbox.findUnique({ where: { id: account.queued.id } })).not.toBeNull();
  expect(await f.db.measurementRecord.findUnique({ where: { id: retained.id } })).not.toBeNull();
  expect(await f.db.diagnosticSourceCommand.count()).toBe(0);
 });

 it.each(["guest-first", "retention-first"])("preserves foreign guest data during actual guest erasure in %s order", async order => {
  const guest = await f.guest(oldVisit), foreign = await f.guest();
  const ownRaw = await f.raw(guest.principal.id, guest.visit), ownOutbox = await f.outbox(guest.principal.id);
  const retained = await f.raw(foreign.principal.id, foreign.visit, fresh);
  const held = f.gate(), release = f.gate();
  const db = retentionConnection(f.db, "first", async sql => {
   if (collectorLock(sql)) { held.release(); await release.promise; }
  });
  const store = await retentionStore(db, f.epoch, now);
  const first = f.start<unknown>(order === "guest-first" ? store.eraseGuest(guest.capability) : new PrismaMeasurementRetentionLedger(db).deleteExpired(now, 10));
  let second: Promise<unknown> | undefined;
  try {
   await f.reached(held, first);
   const next = retentionConnection(f.db, "second");
   second = f.start<unknown>(order === "guest-first" ? new PrismaMeasurementRetentionLedger(next).deleteExpired(now, 10)
    : (await retentionStore(next, f.epoch, now)).eraseGuest(guest.capability));
   await f.blocked("second", "first");
  } finally { release.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await first).toBe(order === "guest-first" ? undefined : 3);
  expect(await second).toBe(order === "guest-first" ? 0 : undefined);
  expect(await f.db.measurementRecord.findUnique({ where: { id: ownRaw.id } })).toBeNull();
  expect(await f.db.measurementOutbox.findUnique({ where: { id: ownOutbox.id } })).toBeNull();
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: guest.principal.id } })).toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: guest.visit } })).toBeNull();
  expect(await f.db.measurementRecord.findUnique({ where: { id: retained.id } })).not.toBeNull();
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: foreign.principal.id } })).not.toBeNull();
 });

 it.each(["restore-first", "retention-first"])("serializes actual restore rotation and retention in %s order", async order => {
  const account = await f.account(f.user, oldVisit);
  const raw = await f.raw(account.principal.id, account.visit), queued = await f.outbox(account.principal.id);
  const snapshot = await rollup();
  const held = f.gate(), release = f.gate();
  const db = retentionConnection(f.db, "first", async sql => {
   if (collectorLock(sql)) { held.release(); await release.promise; }
  });
  const store = await retentionStore(db, f.epoch, now);
  const first = f.start<unknown>(order === "restore-first" ? store.rotateRestoreEpoch(f.nextEpoch) : new PrismaMeasurementRetentionLedger(db).deleteExpired(now, 10));
  let second: Promise<unknown> | undefined;
  try {
   await f.reached(held, first);
   const next = retentionConnection(f.db, "second");
   second = f.start<unknown>(order === "restore-first" ? new PrismaMeasurementRetentionLedger(next).deleteExpired(now, 10)
    : (await retentionStore(next, f.epoch, now)).rotateRestoreEpoch(f.nextEpoch));
   await f.blocked("second", "first");
  } finally { release.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  expect(await first).toBe(order === "restore-first" ? undefined : 4);
  expect(await second).toBe(order === "restore-first" ? 1 : undefined);
  expect((await f.db.measurementState.findUniqueOrThrow({ where: { key: "collector" } })).epoch).toBe(f.nextEpoch);
  expect(await collect(f.db, f.event(), account)).toBe("revoked");
  expect(await f.db.measurementRecord.findUnique({ where: { id: raw.id } })).toBeNull();
  expect(await f.db.measurementOutbox.findUnique({ where: { id: queued.id } })).toBeNull();
  expect(await f.db.measurementVisit.findUnique({ where: { id: account.visit } })).toBeNull();
  expect(await f.db.measurementPrincipal.findUnique({ where: { id: account.principal.id } })).toBeNull();
  expect(await f.db.measurementRollup.findUnique({ where: { key: snapshot.key } })).toBeNull();
 });

 it.each(["bootstrap-first", "retention-first"])("allows actual authenticated bootstrap without a late User lock in %s order", async order => {
  const account = await f.account(), raw = await f.raw(account.principal.id, null);
  const held = f.gate(), release = f.gate();
  const db = retentionConnection(f.db, "first", async sql => {
   if (sql.includes('FROM "measurement_state"')) { held.release(); await release.promise; }
  });
  const store = await retentionStore(db, f.epoch, now);
  const first = f.start<unknown>(order === "bootstrap-first" ? store.bootstrap({ authenticatedUserId: f.user }) : new PrismaMeasurementRetentionLedger(db).deleteExpired(now, 10));
  let second: Promise<unknown> | undefined;
  try {
   await f.reached(held, first);
   const next = retentionConnection(f.db, "second");
   second = f.start<unknown>(order === "bootstrap-first" ? new PrismaMeasurementRetentionLedger(next).deleteExpired(now, 10)
    : (await retentionStore(next, f.epoch, now)).bootstrap({ authenticatedUserId: f.user }));
   await f.blocked("second", "first");
  } finally { release.release(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
  const boot = await (order === "bootstrap-first" ? first : second) as { visitId: string; generation: string };
  expect(boot.generation).toBe(account.principal.generation);
  expect(await (order === "bootstrap-first" ? second : first)).toBe(1);
  expect(await f.db.measurementRecord.findUnique({ where: { id: raw.id } })).toBeNull();
  expect(await f.db.measurementVisit.findUniqueOrThrow({ where: { id: boot.visitId }, select: { principalId: true } }))
   .toEqual({ principalId: account.principal.id });
 });
});
