import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { withCampaignPreparation, withDiagnosticSourceCommand, type DiagnosticSourceCommand, type DiagnosticSourceTuple, type Prisma } from "../src/index";

const root = fileURLToPath(new URL("..", import.meta.url));
const names = { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" };
function uuid(label: string) {
  const h = createHash("sha256").update(label).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function present<T>(v: T | undefined): T { if (v === undefined) throw new Error("missing real SQL result"); return v; }
type Tx = Prisma.TransactionClient;
/** Authored only. Actual campaign SQL generator/hashed authority, real PostgreSQL
 * and exported entry/Prisma transactions. No operator command or local SQL run. */
describe("finite diagnostic intake/bootstrap effects", () => {
  let container: StartedPostgreSqlContainer, pool: Pool, db: PrismaClient;
  let userId: string, sessionId: string;
  async function guards(enabled: boolean) {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate'`);
    for (const r of rows.rows) await pool.query(`ALTER TABLE public."${r.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${r.name}"`);
  }
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start(); const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url }); db = new PrismaClient({ adapter: new PrismaPg(pool) });
    userId = randomUUID(); sessionId = randomUUID();
    await db.user.create({ data: { id: userId, email: `${userId}@intake.invalid`, emailVerifiedAt: new Date() } });
    await db.session.create({ data: { id: sessionId, userId, refreshTokenHash: sessionId, expiresAt: new Date(Date.now() + 3600_000), adminTotpExpiresAt: new Date(Date.now() + 3600_000) } });
    await db.staffGrant.create({ data: { userId, capability: "diagnostics.templates" } });
    await guards(true);
  });
  afterAll(async () => { await db?.$disconnect(); await pool?.end(); await container?.stop(); });
  function bootstrap(centerId: string, qualificationId: string): DiagnosticSourceCommand {
    return { operation: "center_bootstrap", roots: [{ table: "diagnostic_centers", key: { id: centerId } }], rows: [], actorUserId: null, sessionId: null, cutoff: null, campaign: null,
      intent: { code: `synthetic-${centerId}`, userId, capability: "diagnostics.templates", qualificationId } };
  }
  async function operatorWrites(tx: Tx, centerId: string, qualificationId: string, omitAudit = false) {
    await tx.diagnosticCenter.create({ data: { id: centerId, code: `synthetic-${centerId}`, names, planCode: "standard" } });
    await tx.diagnosticAudit.create({ data: { id: uuid(`diagnostic-source:center_bootstrap:${centerId}`), centerId, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", details: { command: "diagnostics:bootstrap-synthetic" } } });
    await tx.$executeRaw`INSERT INTO diagnostic_center_assignments(id,"centerId","userId",capability,"qualifiedUntil","assignedAt") VALUES(${qualificationId},${centerId},${userId},'diagnostics.templates',now()+interval '2 hours',now())`;
    if (!omitAudit) await tx.diagnosticAudit.create({ data: { id: uuid(`diagnostic-source:center_bootstrap:${qualificationId}`), centerId, action: "CENTER_QUALIFICATION_SYNTHETIC", details: { command: "diagnostics:bootstrap-synthetic", capability: "diagnostics.templates", userId } } });
  }
  it.each(["finish", "delete"] as const)("%s requires the exact operator center/qualification/audits and rolls back an omitted audit", async mode => {
    const centerId = randomUUID(), qualificationId = randomUUID(), c = bootstrap(centerId, qualificationId);
    await expect(db.$transaction(async tx => withDiagnosticSourceCommand(tx, c, async receipt => {
      await operatorWrites(tx, centerId, qualificationId, true);
      if (mode === "delete") await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
    }))).rejects.toThrow("diagnostic_source_final_effect");
    expect(await db.diagnosticCenter.findUnique({ where: { id: centerId } })).toBeNull();
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, c, async () => operatorWrites(tx, centerId, qualificationId)));
    const q = await db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { id: qualificationId } });
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, c, async () => undefined));
    expect(await db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { id: qualificationId } })).toEqual(q);
    expect(await db.diagnosticAudit.count({ where: { centerId } })).toBe(2);
  });
  it.each(["left", "right"] as const)("%s bootstrap wins the absent center/qualification slots before the opposing writer", async winner => {
    const centerId = randomUUID(), left = randomUUID(), right = randomUUID();
    const chosen = winner === "left" ? left : right, opposing = winner === "left" ? right : left;
    let release: () => void = () => { throw new Error("missing release barrier"); };
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let entered: () => void = () => { throw new Error("missing entry barrier"); };
    const ready = new Promise<void>(resolve => { entered = resolve; });
    let secondStarted: () => void = () => { throw new Error("missing second barrier"); };
    const started = new Promise<void>(resolve => { secondStarted = resolve; });
    let firstPid = 0, secondPid = 0;
    const first = db.$transaction(async tx => {
      firstPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      await withDiagnosticSourceCommand(tx, bootstrap(centerId, chosen), async () => {
        entered(); await barrier; await operatorWrites(tx, centerId, chosen);
      });
    }, { timeout: 15000 });
    await ready;
    const second = db.$transaction(async tx => {
      secondPid = present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() pid`)[0]).pid;
      secondStarted();
      await withDiagnosticSourceCommand(tx, bootstrap(centerId, opposing), async () => {
        throw new Error("opposing absent intent must not reach writes");
      });
    }, { timeout: 15000 }).catch((error: unknown) => error);
    await started;
    try {
      const deadline = Date.now() + 5000; let observed = false;
      while (Date.now() < deadline) {
        const result = await pool.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked", [secondPid, firstPid]);
        if (present(result.rows[0]).blocked) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(observed).toBe(true);
    } finally { release(); }
    await first;
    const error = await second;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/diagnostic_(source_graph_changed|intake_operator_qualification)/);
    expect(await db.diagnosticCenterAssignment.findUnique({ where: { id: opposing } })).toBeNull();
    expect(await db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { id: chosen } })).toMatchObject({ centerId, userId });
    expect(await db.diagnosticAudit.count({ where: { centerId } })).toBe(2);
  }, 20000);
  it("publication derives its audit, fences absent version keys, refuses a forged audit and enforces direct DELETE", async () => {
    const centerId = randomUUID(), qualificationId = randomUUID();
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, bootstrap(centerId, qualificationId), async () => operatorWrites(tx, centerId, qualificationId)));
    const id = randomUUID(), publishedAt = new Date(), definition = { title: names, limitations: names, syntheticNotice: names, checks: [{ id: "brakes", label: names, required: false, evidenceRequired: false, measurement: null }], panels: [] };
    const data = { id, centerId, version: 1, definition, synthetic: true, publishedById: userId, publishedAt };
    async function command(tx: Tx): Promise<DiagnosticSourceCommand> {
      const [r] = await tx.$queryRaw<{ row: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_normalize('diagnostic_template_versions',${JSON.stringify(data)}::jsonb) AS row`;
      return { operation: "template_publish", roots: [{ table: "diagnostic_centers", key: { id: centerId } }], rows: [{ table: "diagnostic_template_versions", key: { id }, verb: "insert", expected: "absent", next: present(r).row }], actorUserId: userId, sessionId: sessionId, cutoff: null, campaign: null };
    }
    await expect(db.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async receipt => {
      await tx.diagnosticTemplateVersion.create({ data }); await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
    }))).rejects.toThrow("diagnostic_source_final_effect");
    await expect(db.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await tx.diagnosticAudit.create({ data: { id: uuid(`diagnostic-source:template_publish:${id}`), centerId, actorId: userId, action: "TEMPLATE_PUBLISHED", details: { templateVersionId: id, version: 999, synthetic: true } } });
    }))).rejects.toThrow("diagnostic_source_effect_mismatch");
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, await command(tx), async () => {
      await tx.diagnosticTemplateVersion.create({ data });
      await tx.diagnosticAudit.create({ data: { id: uuid(`diagnostic-source:template_publish:${id}`), centerId, actorId: userId, action: "TEMPLATE_PUBLISHED", details: { templateVersionId: id, version: 1, synthetic: true } } });
    }));
    expect(await db.diagnosticTemplateVersion.findUniqueOrThrow({ where: { id } })).toMatchObject(data);
  });
  it.each(["finish", "delete"] as const)("%s requires the staff operator audit and preserves an active replay", async mode => {
    const capability = "support.operations", reason = "Explicit synthetic operator scenario";
    async function command(tx: Tx): Promise<DiagnosticSourceCommand> {
      const [stamp] = await tx.$queryRaw<{ row: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_normalize('staff_grants',jsonb_build_object('userId',${userId},'capability',${capability},'grantedAt',date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC'),'revokedAt',NULL)) AS row`;
      const next = present(stamp).row;
      return { operation: "staff_bootstrap", roots: [{ table: "users", key: { id: userId } }], rows: [{ table: "staff_grants", key: { userId, capability }, verb: "insert", expected: "absent", next }], actorUserId: null, sessionId: null, cutoff: null, campaign: null, intent: { reason } };
    }
    // Each parameter owns a different target, so no seeded or renewed grant.
    const target = randomUUID();
    await guards(false);
    await db.user.create({ data: { id: target, email: `${target}@staff.invalid`, emailVerifiedAt: new Date() } });
    await guards(true);
    async function targetCommand(tx: Tx) {
      const c = await command(tx), r = present(c.rows[0]);
      return { ...c, roots: [{ table: "users", key: { id: target } }], rows: [{ ...r, key: { userId: target, capability }, next: { ...r.next, userId: target } }] } as DiagnosticSourceCommand;
    }
    await expect(db.$transaction(async tx => withDiagnosticSourceCommand(tx, await targetCommand(tx), async receipt => {
      await tx.staffGrant.create({ data: { userId: target, capability } });
      if (mode === "delete") await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
    }))).rejects.toThrow("diagnostic_source_final_effect");
    expect(await db.staffGrant.findUnique({ where: { userId_capability: { userId: target, capability } } })).toBeNull();
    await db.$transaction(async tx => {
      const c = await targetCommand(tx), next = present(c.rows[0]).next;
      await withDiagnosticSourceCommand(tx, c, async () => {
        const [audit] = await tx.$queryRaw<{ id: string }[]>`SELECT diagnostic_intake_uuid('diagnostic-source:staff-bootstrap:' || ${target} || ':' || ${capability} || ':' || ${String(next?.["grantedAt"])}) AS id`;
        await tx.staffGrant.create({ data: { userId: target, capability, grantedAt: new Date(String(next?.["grantedAt"])) } });
        await tx.auditLog.create({ data: { id: present(audit).id, actorId: null, action: "STAFF_CAPABILITY_BOOTSTRAP", targetType: "User", targetId: target, details: { capability, reason } } });
      });
    });
    const grant = await db.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: target, capability } } });
    const count = await db.auditLog.count({ where: { targetId: target } });
    await db.$transaction(async tx => {
      const [r] = await tx.$queryRaw<{ row: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_normalize('staff_grants',to_jsonb(g)) AS row FROM staff_grants g WHERE "userId"=${target} AND capability=${capability}`;
      const source = present(r).row;
      await withDiagnosticSourceCommand(tx, { operation: "staff_bootstrap", roots: [{ table: "users", key: { id: target } }], rows: [{ table: "staff_grants", key: { userId: target, capability }, verb: "update", expected: { source }, next: source }], actorUserId: null, sessionId: null, cutoff: null, campaign: null, intent: { reason } }, async () => undefined);
    });
    expect(await db.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: target, capability } } })).toEqual(grant);
    expect(await db.auditLog.count({ where: { targetId: target } })).toBe(count);
  });
  it("actual campaign first admission derives center/two qualifications/three audits and never renews its hashed authority", async () => {
    const reservation = "e".repeat(32), candidate = "c".repeat(40), ns = `cf_${reservation}`;
    await guards(false);
    const setup = execFileSync(process.execPath, ["scripts/testing/campaign-preparation-fixture.mjs", "campaign897-full-v3", reservation, candidate], { cwd: fileURLToPath(new URL("../../..", import.meta.url)), encoding: "utf8" });
    await pool.query(setup); await guards(true);
    const actor = present((await pool.query<{ user_id: string }>(`SELECT user_id FROM "${ns}".campaign_entities WHERE alias='reception-steward'`)).rows[0]).user_id;
    const session = randomUUID();
    // The actual fixture creates identities, not Sessions. Normal Session
    // insertion goes through the exported ordinary campaign entry and tracker.
    await db.$transaction(tx => withCampaignPreparation(tx, [{ table: "sessions", key: { id: session }, verb: "insert", next: { userId: actor } }],
      () => tx.session.create({ data: { id: session, userId: actor, refreshTokenHash: session, expiresAt: new Date(Date.now() + 3600_000) } })));
    const centerId = uuid(`${reservation}:campaign897:diagnostics:center:${reservation}:${candidate}`);
    const c: DiagnosticSourceCommand = { operation: "campaign_admit", roots: [{ table: "diagnostic_centers", key: { id: centerId } }], rows: [], actorUserId: actor, sessionId: session, cutoff: null, campaign: null, intent: {} };
    const signature = `"${ns}".campaign_diagnostic_authority(text,text,text,text,text,text,text)`;
    const before = present((await pool.query<{ hash: string }>("SELECT md5(pg_get_functiondef(to_regprocedure($1))) AS hash", [signature])).rows[0]).hash;
    await expect(db.$transaction(async tx => withDiagnosticSourceCommand(tx, c, async receipt => {
      await tx.$executeRaw`DELETE FROM diagnostic_source_commands WHERE id=${receipt.receiptId}::uuid`;
    }))).rejects.toThrow(/diagnostic_(source_final_effect|intake_campaign_unadmitted)/);
    const admit = (tx: Tx) => tx.$queryRawUnsafe<{ admitted: boolean }[]>(`SELECT "${ns}".campaign_diagnostic_authority($1,$2,$3,NULL,NULL,NULL,$4) admitted`, actor, session, centerId, candidate);
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, c, async () => { expect(present((await admit(tx))[0]).admitted).toBe(true); }));
    const binding = present((await pool.query<{ issued_at: Date; qualification_deadline: Date }>(`SELECT * FROM "${ns}".campaign_diagnostic_binding`)).rows[0]);
    expect(binding.qualification_deadline.getTime() - binding.issued_at.getTime()).toBe(2 * 3600_000);
    expect(await db.diagnosticCenterAssignment.count({ where: { centerId, qualifiedUntil: binding.qualification_deadline } })).toBe(2);
    expect(await db.diagnosticAudit.count({ where: { centerId } })).toBe(3);
    await db.$transaction(async tx => withDiagnosticSourceCommand(tx, c, async () => { expect(present((await admit(tx))[0]).admitted).toBe(true); }));
    expect((await pool.query(`SELECT * FROM "${ns}".campaign_diagnostic_binding`)).rows[0]).toEqual(binding);
    expect(present((await pool.query<{ hash: string }>("SELECT md5(pg_get_functiondef(to_regprocedure($1))) AS hash", [signature])).rows[0]).hash).toBe(before);
  });
});
