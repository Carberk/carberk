import { describe, expect, it } from "vitest";

import { Prisma, type PrismaClient } from "../generated/prisma/client/client";

import { bootstrapStaff, bootstrapSyntheticCenter, runSyntheticCenterBootstrap } from "./bootstrap-command";

const userId = "11111111-1111-4111-a111-111111111111";
const centerId = "22222222-2222-4222-a222-222222222222";
const qualificationId = "33333333-3333-4333-a333-333333333333";
const stamp = new Date("2026-10-25T12:00:00.000Z");
const capability = "diagnostics.templates";
const input = { targetUserId: userId, capability, reason: "operator request" };
const values = { "user-id": userId, "center-code": "synthetic-offline", capability };
const source = { userId, capability, grantedAt: "2026-10-01T00:00:00.000", revokedAt: "2026-10-02T00:00:00.000" };
const next = { ...source, grantedAt: "2026-10-25T12:00:00.000", revokedAt: null };
const audit = { id: "44444444-4444-4444-a444-444444444444", actorId: null, action: "STAFF_CAPABILITY_BOOTSTRAP", targetType: "User", targetId: userId, details: { capability, reason: input.reason }, createdAt: stamp.toISOString() };

// Database boundary only. Real source prepare/assert/finish functions execute;
// this fake records committed rows and refuses pre-prefix locks or writes.
function database(options: { failure?: unknown; failAt?: "prepare" | "assert" | "write" | "finish"; active?: boolean; dryAbsent?: boolean; invalidUser?: boolean; missingGrant?: boolean; finish?: boolean; write?: boolean; changed?: boolean; existingAssignment?: boolean; expired?: boolean; revoked?: boolean; conflict?: boolean; approved?: boolean } = {}) {
  const state = { prepared: false, committed: [] as unknown[], pending: [] as unknown[], command: null as Record<string, unknown> | null, locks: [] as string[] };
  const grant = options.dryAbsent ? null : { ...source, revokedAt: options.active ? null : source.revokedAt };
  const center = options.existingAssignment || options.conflict || options.approved ? { id: centerId, code: values["center-code"], planCode: "standard", names: { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" }, operationalApproval: options.approved ? {} : null } : null;
  const assignment = options.existingAssignment ? { id: qualificationId, centerId, userId, capability, assignedAt: stamp, qualifiedUntil: new Date("2026-10-25T14:00:00Z"), revokedAt: options.revoked ? stamp : null } : null;
  const effects = [
    { table: "diagnostic_centers", verb: "insert", next: { id: centerId, code: values["center-code"], planCode: "standard", names: { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" }, operationalApproval: null, createdAt: stamp.toISOString() } },
    { table: "diagnostic_center_assignments", verb: "insert", next: { id: qualificationId, centerId, userId, capability, assignedAt: stamp.toISOString(), qualifiedUntil: "2026-10-25T14:00:00.000Z", revokedAt: null } },
    ...["CENTER_SYNTHETIC_BOOTSTRAPPED", "CENTER_QUALIFICATION_SYNTHETIC"].map((action, n) => ({ table: "diagnostic_audits", verb: "insert", next: { id: `55555555-5555-4555-a555-55555555555${n}`, centerId, orderId: null, actorId: null, action, details: action === "CENTER_SYNTHETIC_BOOTSTRAPPED" ? { command: "diagnostics:bootstrap-synthetic" } : { command: "diagnostics:bootstrap-synthetic", capability, userId }, createdAt: stamp.toISOString() } })),
  ];
  const write = async (data: unknown) => {
    if (!state.prepared) throw new Error("write before preparation");
    if (options.failAt === "write") throw options.failure;
    state.pending.push(data); return data;
  };
  const raw = async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("diagnostic_prepare_source")) {
      if (state.locks.length) throw new Error("preheld lock");
      if (options.failAt === "prepare") throw options.failure;
      if (options.changed) throw new Error("diagnostic_source_graph_changed");
      state.command = JSON.parse(params[0] as string); state.prepared = true; return [{ receipt: "owned-receipt" }];
    }
    if (sql.includes("diagnostic_assert_source")) { if (options.failAt === "assert") throw options.failure; if (!state.prepared || params[0] !== "owned-receipt") throw new Error("diagnostic_source_receipt"); return []; }
    if (sql.includes("diagnostic_finish_source")) { if (options.failAt === "finish") throw options.failure; if (options.finish) throw new Error("diagnostic_source_final_effect"); return []; }
    if (sql.includes("diagnostic_source_commands")) return [{ effects: state.command?.["operation"] === "staff_bootstrap" ? [{ table: "audit_logs", verb: "insert", next: audit }] : effects }];
    if (sql.includes("diagnostic_source_normalize")) return [{ source: grant, next, timestamp: stamp }];
    if (sql.includes("FOR UPDATE") || sql.includes("pg_advisory")) { if (!state.prepared) throw new Error("lock before preparation"); state.locks.push(sql); }
    if (sql.includes('FROM "users"')) return options.invalidUser ? [] : [{ id: userId, phoneVerifiedAt: stamp, emailVerifiedAt: null, suspendedAt: null, deletionScheduledAt: null }];
    if (sql.includes('"qualifiedUntil" > clock_timestamp()')) return [{ active: !options.expired }];
    if (sql.includes('operationalApproval')) return [{ unapproved: !options.approved }];
    if (sql.includes("clock_timestamp")) return [{ timestamp: stamp }];
    return [];
  };
  const tx = {
    $queryRaw: raw, $executeRaw: async () => write({ assignment: true }),
    staffGrant: { findUnique: async () => options.missingGrant ? null : grant, upsert: async (a: { create: unknown; update: unknown }) => write(a), create: async (a: unknown) => write(a), update: async (a: unknown) => write(a) },
    auditLog: { create: async (a: unknown) => write(a) },
    diagnosticCenter: { findUnique: async () => center, create: async (a: unknown) => { await write(a); return { id: centerId }; } },
    diagnosticCenterAssignment: { findUnique: async () => assignment, create: async (a: unknown) => { if (options.write) throw new Error("bootstrap_assignment_write_sentinel"); return write(a); } },
    diagnosticAudit: { findMany: async (a: { where: { action: string } }) => options.conflict ? [] : [{ details: a.where.action === "CENTER_SYNTHETIC_BOOTSTRAPPED" ? { command: "diagnostics:bootstrap-synthetic" } : { command: "diagnostics:bootstrap-synthetic", userId, capability } }], create: async (a: unknown) => write(a) },
  } as unknown as Prisma.TransactionClient;
  return { state, tx, async run(work: () => Promise<string>) { try { const result = await work(); state.committed = [...state.pending]; return result; } catch (error) { state.pending = []; throw error; } } };
}

describe("operator bootstrap source preparation", () => {
  it("grants only the named slot after preparation and writes the exact server audit", async () => {
    const h = database();
    expect(await h.run(() => bootstrapStaff(h.tx, input))).toBe("Named capability granted with bootstrap audit");
    expect(h.state.command).toMatchObject({ operation: "staff_bootstrap", actorUserId: null, sessionId: null, cutoff: null, campaign: null, intent: { reason: "operator request" }, rows: [{ table: "staff_grants", key: { userId, capability }, verb: "update", expected: { source }, next }] });
    expect(h.state.committed).toContainEqual({ data: { ...audit, createdAt: stamp } });
  });
  it("reserves the missing composite grant slot", async () => {
    const h = database({ dryAbsent: true });
    await h.run(() => bootstrapStaff(h.tx, input));
    expect(h.state.command).toMatchObject({ rows: [{ table: "staff_grants", key: { userId, capability }, verb: "insert", expected: "absent" }] });
  });
  it("keeps active grants and dry runs free of receipts, writes and locks", async () => {
    for (const options of [{ active: true }, { dryAbsent: true }]) {
      const h = database(options);
      expect(await h.run(() => bootstrapStaff(h.tx, input, true))).toBe(options.active ? "Already granted; no change" : "Dry run; would grant the named capability and write bootstrap audit");
      expect(h.state).toMatchObject({ command: null, committed: [], locks: [] });
    }
  });
  it("creates the exact center, two-hour assignment and audits under one source owner", async () => {
    const h = database({ active: true });
    expect(await h.run(() => bootstrapSyntheticCenter(h.tx, values, { centerId, qualificationId }))).toBe("Synthetic center and qualification created");
    expect(h.state.command).toMatchObject({ operation: "center_bootstrap", roots: [{ table: "diagnostic_centers", key: { id: centerId } }], rows: [], intent: { code: "synthetic-offline", userId, capability, qualificationId } });
    expect(h.state.committed).toContainEqual({ data: { id: qualificationId, centerId, userId, capability, assignedAt: stamp, qualifiedUntil: new Date("2026-10-25T14:00:00Z"), revokedAt: null } });
    expect(h.state.committed).toHaveLength(4);
  });
  it("preserves center no-renewal and dry-run reads without fabricated write intents", async () => {
    for (const existingAssignment of [false, true]) {
      const h = database({ active: true, existingAssignment });
      expect(await h.run(() => bootstrapSyntheticCenter(h.tx, { ...values, "dry-run": true }))).toBe(existingAssignment ? "Already bootstrapped; no change" : "Dry run; would create the synthetic center and qualification");
      expect(h.state).toMatchObject({ command: null, committed: [], locks: [] });
    }
  });
  it.each(["finish", "write", "changed"] as const)("rolls back all caller writes on %s refusal", async failure => {
    const h = database({ active: true, [failure]: true });
    await expect(h.run(() => bootstrapSyntheticCenter(h.tx, values, { centerId, qualificationId }))).rejects.toThrow(failure === "finish" ? "diagnostic_source_final_effect" : failure === "write" ? "bootstrap_assignment_write_sentinel" : "diagnostic_source_graph_changed");
    expect(h.state.committed).toEqual([]);
  });
  it.each([
    [{ invalidUser: true }, "user"], [{ missingGrant: true }, "grant"], [{ approved: true }, "center-approved"], [{ conflict: true }, "center-conflict"],
    [{ existingAssignment: true, revoked: true }, "qualification-revoked"], [{ existingAssignment: true, expired: true }, "qualification-expired"],
  ] as const)("refuses invalid authority or provenance without writes: %s", async (options, reason) => {
    const h = database({ active: true, ...options });
    await expect(h.run(() => bootstrapSyntheticCenter(h.tx, values, { centerId, qualificationId }))).rejects.toThrow(`Refused: ${reason}`);
    expect(h.state.committed).toEqual([]);
  });
});


// The installed adapter-pg/client raw-query boundary carries PostgreSQL RAISE
// EXCEPTION as P2010 with driverAdapterError.cause originalCode/originalMessage.
function preparationError(message = "diagnostic_source_graph_changed", sqlState = "P0001") {
  return new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`${sqlState}\`. Message: \`${message}\``, {
    code: "P2010", clientVersion: "7.8.0", meta: { driverAdapterError: { cause: { originalCode: sqlState, originalMessage: message } } },
  });
}
function commandDatabase(first: ReturnType<typeof database>, second = database({ active: true, existingAssignment: true }), commitError?: unknown) {
  const events: string[] = [];
  let attempts = 0;
  const db = { $transaction: async (work: (tx: Prisma.TransactionClient) => Promise<string>, options?: { isolationLevel: string }) => {
    const index = attempts++; const h = index === 0 ? first : second;
    events.push(index === 0 ? "write-tx" : `read-tx:${options?.isolationLevel}`);
    if (index > 1) throw new Error("second write attempt");
    const tx = new Proxy(h.tx, { get(target, prop) {
      if (prop === "$executeRaw") return async (strings: TemplateStringsArray) => {
        if (index !== 1 || strings.join("") !== "SET TRANSACTION READ ONLY") throw new Error("unexpected transaction command");
        events.push("read-only"); return 0;
      };
      if (index === 1 && prop === "$queryRaw") return async (strings: TemplateStringsArray, ...params: unknown[]) => {
        if (strings.join("").includes("diagnostic_") && !strings.join("").includes("diagnostic_center_assignments")) throw new Error("reconciliation prepared or locked");
        if (!events.includes("read-only")) throw new Error("data before read-only");
        return target.$queryRaw(strings, ...params);
      };
      return Reflect.get(target, prop);
    } });
    try {
      const result = await h.run(() => work(tx));
      if (index === 0 && commitError) throw commitError;
      events.push(index === 0 ? "commit-write" : "commit-read"); return result;
    } catch (error) { events.push(index === 0 ? "rollback-write" : "rollback-read"); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { db, events, first, second };
}

describe("post-rollback synthetic no-op recognition", () => {
  it.each(["diagnostic_source_graph_changed", "diagnostic_intake_operator_center", "diagnostic_intake_operator_qualification"])("recognizes a completed winner after only %s preparation refusal", async message => {
    const h = commandDatabase(database({ active: true, failAt: "prepare", failure: preparationError(message) }));
    expect(await runSyntheticCenterBootstrap(h.db, values)).toBe("Already bootstrapped; no change");
    expect(h.events).toEqual(["write-tx", "rollback-write", "read-tx:RepeatableRead", "read-only", "commit-read"]);
    expect(h.first.state.committed).toEqual([]);
    expect(h.second.state).toMatchObject({ command: null, committed: [], locks: [] });
  });
  it.each(["assert", "write", "finish"] as const)("never masks a lookalike %s error after callback entry", async failAt => {
    const failure = preparationError();
    const h = commandDatabase(database({ active: true, failAt, failure }));
    await expect(runSyntheticCenterBootstrap(h.db, values)).rejects.toBe(failure);
    expect(h.events).toEqual(["write-tx", "rollback-write"]);
  });
  it("never recognizes after commit failure", async () => {
    const failure = preparationError();
    const h = commandDatabase(database({ active: true }), undefined, failure);
    await expect(runSyntheticCenterBootstrap(h.db, values)).rejects.toBe(failure);
    expect(h.events).toEqual(["write-tx", "rollback-write"]);
  });
  it.each([
    new Error("diagnostic_source_graph_changed"), preparationError("diagnostic_intake_operator_authority"), preparationError("diagnostic_source_receipt"),
    preparationError("diagnostic_source_final_effect"), preparationError("diagnostic_source_graph_changed extra"), preparationError("diagnostic_source_graph_changed", "23505"),
    new Prisma.PrismaClientKnownRequestError("diagnostic_source_graph_changed", { code: "P2002", clientVersion: "7.8.0" }),
  ])("preserves non-classified database errors: %s", async failure => {
    const h = commandDatabase(database({ active: true, failAt: "prepare", failure }));
    await expect(runSyntheticCenterBootstrap(h.db, values)).rejects.toBe(failure);
    expect(h.events).toEqual(["write-tx", "rollback-write"]);
  });
  it.each([
    { active: true, invalidUser: true }, { active: true, missingGrant: true }, { active: false, existingAssignment: true },
    { active: true, approved: true }, { active: true, conflict: true }, { active: true, existingAssignment: true, expired: true },
    { active: true, existingAssignment: true, revoked: true }, { active: true },
  ])("preserves the original cause if the snapshot cannot prove the complete no-op: %s", async options => {
    const failure = preparationError();
    const h = commandDatabase(database({ active: true, failAt: "prepare", failure }), database(options));
    await expect(runSyntheticCenterBootstrap(h.db, values)).rejects.toBe(failure);
    expect(h.first.state.committed).toEqual([]);
    expect(h.second.state).toMatchObject({ command: null, committed: [], locks: [] });
    expect(h.events).toEqual(["write-tx", "rollback-write", "read-tx:RepeatableRead", "read-only", "rollback-read"]);
  });
});
