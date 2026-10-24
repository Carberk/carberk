import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client/client";
import { withCampaignPreparation, withDiagnosticSourceCommand, type CampaignMutation, type DiagnosticSourceCommand, type DiagnosticSourceTuple, type Prisma } from "../src/index";

const root = fileURLToPath(new URL("..", import.meta.url));
const candidate = "c".repeat(40);
function uuid(reservation: string, label: string) {
  const h = createHash("sha256").update(`${reservation}:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function signal() {
  let release: () => void = () => { throw new Error("uninitialized barrier"); };
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

function present<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("expected SQL fixture result");
  return value;
}
type SqlTx = Prisma.TransactionClient;
/** Authored for hosted disposable PostgreSQL only. No local SQL execution.
 * Existing campaignMain creates the actual roster/journals/hashes/tracking;
 * no ownership grants, authority substitutions, reset or synthetic consent. */
describe("campaign preparation with existing campaign authority", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let prisma: PrismaClient;
  let businessPrelude: string;
  let admittedBusinessId: string;
  const clients: PoolClient[] = [];
  const reservations = ["a".repeat(32), "b".repeat(32)];
  const businessReservation = "d".repeat(32);
  const businessNamespace = `cf_${businessReservation}`;
  const businessId = uuid(businessReservation, `campaign897-business:${candidate}:campaign897-full-v3:${businessReservation}:root`);
  const businessUser = (alias: string) => uuid(businessReservation, `campaign897-business:${candidate}:campaign897-full-v3:${businessReservation}:${alias}`);
  const ns = reservations.map(id => `cf_${id}`);
  const users = reservations.map(id => uuid(id, `campaign897:${candidate}:buyer-a`));

  async function client() { const c = await pool.connect(); clients.push(c); return c; }
  async function enable() {
    const rows = await pool.query<{ table: string; name: string }>(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate'`);
    for (const r of rows.rows) await pool.query(`ALTER TABLE public."${r.table}" ENABLE TRIGGER "${r.name}"`);
  }
  const scalar = (id = present(users[0]), next = "prepared scalar"): CampaignMutation[] => [{ table: "users", key: { id }, verb: "update", next: { displayName: next } }];
  const session = (id: string, userId = present(users[0])): CampaignMutation[] => [{ table: "sessions", key: { id }, verb: "insert", next: { userId } }];
  async function prepare(c: PoolClient, mutations: readonly CampaignMutation[]) {
    return present((await c.query<{ id: string }>("SELECT campaign_prepare($1::jsonb) AS id", [JSON.stringify(mutations)])).rows[0]).id;
  }
  async function sourceCommand(tx: SqlTx): Promise<DiagnosticSourceCommand> {
    const [r] = await tx.$queryRaw<{ source: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(to_jsonb(u),diagnostic_source_meta('users')->'fields') AS source FROM users u WHERE id=${users[0]}`;
    if (!r) throw new Error("campaign fixture User missing");
    return { operation: "account_restore", roots: [{ table: "users", key: { id: present(users[0]) } }], rows: [{ table: "users", key: { id: present(users[0]) }, verb: "update", expected: { source: r.source }, next: r.source }], actorUserId: null, sessionId: null, cutoff: null, campaign: null };
  }
  async function blocked(waiter: number, blocker: number) {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      if ((await pool.query<{ blocked: boolean }>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked", [waiter, blocker])).rows[0]?.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("expected PostgreSQL blocker barrier within 5s");
  }
  async function pid(tx: SqlTx) { return present((await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]).pid; }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    // The operational generator is only used to produce its existing fixture SQL.
    // No operational reset/bootstrap command or external environment is invoked.
    for (const id of [...reservations, businessReservation]) {
      const profile = id === businessReservation ? "campaign897-full-v3" : "campaign897-identities-v1";
      const setup = execFileSync(process.execPath, ["scripts/testing/campaign-preparation-fixture.mjs", profile, id, candidate],
        { cwd: fileURLToPath(new URL("../../..", import.meta.url)), encoding: "utf8" });
      if (id === businessReservation) {
        // The generator emits the reset table/FK prefix plus one setup-only
        // measurement table lock. Remove only that documented setup addition.
        businessPrelude = setup.slice(0, setup.indexOf("CREATE SCHEMA"))
          .replace(/^BEGIN;/, "")
          .replace("LOCK TABLE public.measurement_state IN SHARE ROW EXCLUSIVE MODE;", "");
      }
      await pool.query(setup);
    }
    // Genuine preactivation business fixture through existing owner repositories.
    // The original tracker, authority, hashes and admission slot stay installed.
    const load = async (file: string) => import(/* @vite-ignore */ fileURLToPath(new URL("../../../apps/api/src/modules/identity/infrastructure/"+file, import.meta.url))) as Promise<Record<string, new (...args: unknown[]) => unknown>>;
    const Totp = present((await load("PrismaTotpEnrollmentRepository.ts"))["PrismaTotpEnrollmentRepository"]);
    const Staff = present((await load("PrismaStaffAuthority.ts"))["PrismaStaffAuthority"]);
    const Business = present((await load("PrismaBusinessRepository.ts"))["PrismaBusinessRepository"]);
    const totp = new Totp(prisma) as {
      createPending(userId: string, secret: string): Promise<{ id: string }>;
      completeFirstVerification(input: { userId: string; enrollmentId: string; verifiedAt: Date; codeHashes: string[]; sessionId: string; adminTotpExpiresAt: Date }): Promise<void>;
    };
    const staff = new Staff(prisma) as { change(input: { userId: string; sessionId: string; targetUserId: string; capability: string; grant: boolean; reason: string }, now: Date): Promise<void> };
    const business = new Business(prisma) as {
      admit(input: { userId: string; sessionId: string; name: string; slug: string; ownerUserId: string; mode: string; evidence: string; reason: string; tokenHash: string; expiresAt: Date }, now: Date): Promise<{ businessId: string }>;
      redeem(input: { userId: string; sessionId: string; tokenHash: string }, now: Date): Promise<unknown>;
    };
    const coordinator = businessUser("coordinator"), founder = businessUser("support"), owner = businessUser("buyer-a");
    const sessions = new Map<string,string>();
    for (const userId of [coordinator,founder,owner]) {
      const id = randomUUID(); sessions.set(userId,id);
      await prisma.session.create({ data: { id,userId,refreshTokenHash: id,expiresAt: new Date(Date.now()+3600_000) } });
    }
    async function elevate(userId: string) {
      const enrollment = await totp.createPending(userId,"encrypted-synthetic-preactivation-secret");
      await totp.completeFirstVerification({ userId,enrollmentId: enrollment.id,verifiedAt: new Date(),codeHashes: Array.from({ length: 10 },() => randomUUID()),sessionId: present(sessions.get(userId)),adminTotpExpiresAt: new Date(Date.now()+3600_000) });
    }
    await elevate(coordinator);
    await staff.change({ userId: coordinator,sessionId: present(sessions.get(coordinator)),targetUserId: founder,capability: "founder.admission",grant: true,reason: "Explicit synthetic campaign business fixture" },new Date());
    await elevate(founder);
    const tokenHash = randomUUID();
    const admitted = await business.admit({ userId: founder,sessionId: present(sessions.get(founder)),name: "Synthetic admitted media business",slug: `campaign897-${businessReservation}-${candidate.slice(0,12)}-admitted`,ownerUserId: owner,mode: "synthetic",evidence: "Fictional reservation-owned business only",reason: "Authored finite preparation fixture",tokenHash,expiresAt: new Date(Date.now()+3600_000) },new Date());
    admittedBusinessId=admitted.businessId;
    await business.redeem({ userId: owner,sessionId: present(sessions.get(owner)),tokenHash },new Date());
    await enable();
    // The barrier is AFTER the row and FK effects, before campaign AFTER tracking.
    // Its advisory class is outside production rank and campaign key spaces.
    await pool.query(`CREATE FUNCTION public.campaign_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('test.campaign_barrier',true)=NEW.id THEN
          PERFORM pg_advisory_xact_lock(197897,hashtext(NEW.id));
        END IF;
        RETURN NULL;
      END $$;
      CREATE TRIGGER a_campaign_test_gate AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.campaign_test_gate();
      CREATE TRIGGER a_campaign_test_gate AFTER INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.campaign_test_gate();`);
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) { await c.query("ROLLBACK"); c.release(); }
    expect((await pool.query("SELECT * FROM campaign_preparations")).rowCount).toBe(0);
  });
  afterAll(async () => { await prisma?.$disconnect(); await pool?.end(); await container?.stop(); });

  for (const operation of ["scalar", "session"] as const) for (const ordinaryFirst of [true, false]) {
    it(`${operation} ordinary/source ordering ${ordinaryFirst ? "ordinary first" : "source first"} waits at the namespace before mutation`, async () => {
      const release = signal(), entered = signal(), waiting = signal();
      let firstPid = 0, secondPid = 0;
      const beforeUser = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } });
      const beforeOrders = await prisma.inspectionOrder.findMany({ where: { commissionerId: users[0] }, orderBy: { id: "asc" } });
      const insertedId = randomUUID();
      const gateId = operation === "scalar" ? present(users[0]) : insertedId;
      const gate = await client();
      const gatePid = present((await gate.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
      if (ordinaryFirst) await gate.query("SELECT pg_advisory_lock(197897,hashtext($1))", [gateId]);
      const ordinary = (first: boolean) => prisma.$transaction(async tx => {
        if (!first) { await entered.promise; secondPid = await pid(tx); waiting.release(); }
        return withCampaignPreparation(tx, operation === "scalar" ? scalar() : session(insertedId), async () => {
          if (first) {
            firstPid = await pid(tx);
            await tx.$queryRaw`SELECT set_config('test.campaign_barrier',${gateId},true)`;
            entered.release();
          }
          if (operation === "scalar") await tx.user.update({ where: { id: users[0] }, data: { displayName: "prepared scalar" } });
          else await tx.session.create({ data: { id: insertedId, userId: present(users[0]), refreshTokenHash: insertedId, expiresAt: new Date(Date.now() + 60_000) } });
        });
      });
      const source = (first: boolean) => prisma.$transaction(async tx => {
        if (!first) { await entered.promise; secondPid = await pid(tx); waiting.release(); }
        return withDiagnosticSourceCommand(tx, await sourceCommand(tx), async () => {
          if (first) { firstPid = await pid(tx); entered.release(); await release.promise; }
          await tx.$executeRaw`UPDATE users SET email=email WHERE id=${users[0]}`;
        });
      });
      const first = ordinaryFirst ? ordinary(true) : source(true);
      const second = ordinaryFirst ? source(false) : ordinary(false);
      try {
        await waiting.promise;
        if (ordinaryFirst) await blocked(firstPid, gatePid);
        await blocked(secondPid, firstPid);
      } finally {
        if (ordinaryFirst) await gate.query("SELECT pg_advisory_unlock(197897,hashtext($1))", [gateId]);
        release.release();
      }
      const results = await Promise.allSettled([first, second]);
      expect(results[0].status).toBe("fulfilled");
      if (ordinaryFirst) {
        expect(results[1].status).toBe("rejected");
        if (results[1].status === "rejected") expect(String(results[1].reason)).toContain("diagnostic_source_graph_changed");
      } else expect(results[1].status).toBe("fulfilled");
      if (operation === "session") {
        expect(await prisma.session.findUnique({ where: { id: insertedId } })).toMatchObject({ userId: users[0], refreshTokenHash: insertedId });
        expect(await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })).toEqual(beforeUser);
      } else expect(await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })).toEqual({ ...beforeUser, displayName: "prepared scalar", updatedAt: expect.any(Date) });
      expect(await prisma.inspectionOrder.findMany({ where: { commissionerId: users[0] }, orderBy: { id: "asc" } })).toEqual(beforeOrders);
      expect(await prisma.diagnosticSourceCommand.count()).toBe(0);
    });
  }

  it("ordinary v3 settings and invitations use the fence without an ownership receipt", async () => {
    const invitation = randomUUID(), recipient = businessUser("sales-a");
    await prisma.$transaction(tx => withCampaignPreparation(tx, [
      { table: "dealerships", key: { id: businessId }, verb: "update", next: { name: "Prepared root settings" } },
      { table: "dealership_invitations", key: { id: invitation }, verb: "insert", next: { dealershipId: businessId, recipientUserId: recipient } },
    ], async () => {
      await tx.dealership.update({ where: { id: businessId }, data: { name: "Prepared root settings" } });
      await tx.dealershipInvitation.create({ data: { id: invitation, dealershipId: businessId, recipientUserId: recipient, role: "sales", tokenHash: "e".repeat(64), expiresAt: new Date(Date.now() + 60_000) } });
    }));
    expect((await prisma.dealership.findUniqueOrThrow({ where: { id: businessId } })).name).toBe("Prepared root settings");
    expect((await prisma.dealershipInvitation.findUniqueOrThrow({ where: { id: invitation } })).recipientUserId).toBe(recipient);
  });

  it("campaign preparation does not authorize private diagnostic or unsupported media admission", async () => {
    await prisma.$transaction(tx => withCampaignPreparation(tx, scalar(businessUser("buyer-a")), async () => {
      const [row] = await tx.$queryRawUnsafe<{ admitted: boolean }[]>(`SELECT "${businessNamespace}".campaign_diagnostic_authority($1,NULL,NULL,NULL,NULL,NULL,$2) AS admitted`, businessUser("buyer-a"), candidate);
      expect(present(row).admitted).toBe(false);
    }));
    const id = randomUUID();
    await expect(prisma.$transaction(tx => withCampaignPreparation(tx, [{ table: "media_uploads", key: { id }, verb: "insert", next: { userId: businessUser("owner"), businessId } }],
      () => tx.mediaUpload.create({ data: { id, userId: businessUser("owner"), businessId, key: `pending/${id}/original.webp`, kind: "image", contentType: "image/webp", sizeBytes: 1 } })))).rejects.toThrow("Unsupported campaign media");
    expect(await prisma.mediaUpload.findUnique({ where: { id } })).toBeNull();
  });

  it("ordinary rollback restores the User and campaign journal and leaves no preparation payload", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } });
    const journal = await pool.query(`SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY table_name,row_key)::text) AS hash FROM "${ns[0]}".campaign_records r`);
    await expect(prisma.$transaction(tx => withCampaignPreparation(tx, scalar(), async () => {
      await tx.user.update({ where: { id: users[0] }, data: { displayName: "rolled back" } });
      throw new Error("deliberate campaign rollback");
    }))).rejects.toThrow("deliberate campaign rollback");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })).displayName).toBe(before.displayName);
    expect((await pool.query(`SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY table_name,row_key)::text) AS hash FROM "${ns[0]}".campaign_records r`)).rows).toEqual(journal.rows);
  });

  it("ordinary non-campaign scalar writes need no source or campaign receipt", async () => {
    const u = await prisma.user.create({ data: { email: `${randomUUID()}@ordinary.invalid` } });
    await prisma.user.update({ where: { id: u.id }, data: { displayName: "ordinary" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).displayName).toBe("ordinary");
  });

  it("missing preparation rejects a campaign scalar atomically", async () => {
    const prior = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } });
    await expect(prisma.user.update({ where: { id: users[0] }, data: { displayName: "unprepared" } })).rejects.toThrow("campaign_preparation_missing");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })).displayName).toBe(prior.displayName);
  });

  it("OLD and proposed NEW references resolve both namespaces, while a missed NEW namespace is rejected before insert", async () => {
    const c = await client(); await c.query("BEGIN");
    const id = randomUUID();
    await prepare(c, session(id));
    await expect(c.query('INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES($1,$2,$1,now()+interval \'1 hour\')', [id, users[1]])).rejects.toThrow("campaign_preparation_uncovered");
    await c.query("ROLLBACK");
    expect((await pool.query("SELECT id FROM sessions WHERE id=$1", [id])).rowCount).toBe(0);
    await c.query("BEGIN");
    const receipt = await prepare(c, [...session(id), ...session(randomUUID(), present(users[1]))]);
    const scope = present((await c.query<{ scope: { namespaces: string[] } }>("SELECT scope FROM campaign_preparations WHERE id=$1", [receipt])).rows[0]).scope;
    expect(scope.namespaces).toEqual(ns);
    await c.query("SELECT campaign_finish($1)", [receipt]); await c.query("COMMIT");
  });

  for (const preparationFirst of [true, false]) {
    it(`reset table prelude opposition ${preparationFirst ? "preparation first" : "table first"} serializes before the namespace`, async () => {
      const a = await client(), b = await client();
      await a.query("BEGIN"); await b.query("BEGIN");
      const ap = present((await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
      const bp = present((await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
      if (preparationFirst) await prepare(a, scalar(businessUser("buyer-a")));
      else await a.query(businessPrelude);
      const waiter = preparationFirst ? b.query(businessPrelude) : prepare(b, scalar(businessUser("buyer-a")));
      try { await blocked(bp, ap); }
      finally { await a.query("ROLLBACK"); }
      await waiter; await b.query("ROLLBACK");
    });
  }

  it("legacy v1 reset order contention refuses before namespace acquisition without retry", async () => {
    const a = await client(), b = await client(); await a.query("BEGIN"); await b.query("BEGIN");
    // The existing legacy reset starts with users instead of sorted audit_logs.
    await a.query("LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE");
    await expect(prepare(b, scalar())).rejects.toThrow("campaign_preparation_legacy_reset_busy");
    await b.query("ROLLBACK"); await a.query("ROLLBACK");
  });

  it("reverse multi-namespace inputs acquire the same sorted complete set", async () => {
    const a = await client(), b = await client(); await a.query("BEGIN"); await b.query("BEGIN");
    const plans = [...scalar(present(users[1])), ...scalar(present(users[0]))];
    const first = await prepare(a, plans);
    const scope = present((await a.query<{ scope: { namespaces: string[]; tracked: string[] } }>("SELECT scope FROM campaign_preparations WHERE id=$1", [first])).rows[0]).scope;
    expect(scope.namespaces).toEqual(ns);
    expect(scope.tracked).toEqual(["audit_logs", "otp_requests", "sessions", "staff_grants", "totp_backup_codes", "totp_enrollments", "users"]);
    const ap = present((await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
    const bp = present((await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]).pid;
    const waiter = prepare(b, [...plans].reverse());
    try { await blocked(bp, ap); } finally { await a.query("ROLLBACK"); }
    const second = await waiter;
    expect(present((await b.query<{ scope: unknown }>("SELECT scope FROM campaign_preparations WHERE id=$1", [second])).rows[0]).scope).toEqual(scope);
    await b.query("ROLLBACK");
  });

  it("a moved Session reference discovers OLD and NEW namespaces and retains the existing transfer refusal", async () => {
    const id = randomUUID();
    await prisma.$transaction(tx => withCampaignPreparation(tx, session(id), () => tx.session.create({ data: { id, userId: present(users[0]), refreshTokenHash: id, expiresAt: new Date(Date.now() + 60_000) } })));
    const c = await client(); await c.query("BEGIN");
    const receipt = await prepare(c, [{ table: "sessions", key: { id }, verb: "update", next: { userId: present(users[1]) } }]);
    expect(present((await c.query<{ scope: { namespaces: string[] } }>("SELECT scope FROM campaign_preparations WHERE id=$1", [receipt])).rows[0]).scope.namespaces).toEqual(ns);
    await c.query("ROLLBACK");
    await expect(prisma.$transaction(async tx => {
      const row = present((await tx.$queryRaw<{ source: DiagnosticSourceTuple }[]>`SELECT diagnostic_source_project(to_jsonb(s),diagnostic_source_meta('sessions')->'fields') AS source FROM sessions s WHERE id=${id}`)[0]).source;
      return withDiagnosticSourceCommand(tx, { operation: "session_change", roots: [{ table: "sessions", key: { id } }], rows: [{ table: "sessions", key: { id }, verb: "update", expected: { source: row }, next: { ...row, userId: present(users[1]) } }], actorUserId: null, sessionId: null, cutoff: null, campaign: null }, () => tx.session.update({ where: { id }, data: { userId: present(users[1]) } }));
    })).rejects.toThrow("Campaign reference transfer refused");
    expect((await prisma.session.findUniqueOrThrow({ where: { id } })).userId).toBe(users[0]);
  });

  it("forged GUC, copied foreign receipt, preheld campaign lock and nested source entry cannot prepare", async () => {
    const a = await client(), b = await client(); await a.query("BEGIN"); await b.query("BEGIN");
    const receipt = await prepare(a, scalar());
    await b.query("SELECT set_config('autotm.campaign_prepared',$1,true)", [receipt]);
    await expect(b.query("SELECT campaign_finish($1)", [receipt])).rejects.toThrow("campaign_preparation_receipt");
    await b.query("ROLLBACK"); await b.query("BEGIN");
    await b.query("SELECT set_config('autotm.campaign_prepared',$1,true)", [receipt]);
    await expect(b.query(`UPDATE users SET "displayName"='forged' WHERE id=$1`, [users[0]])).rejects.toThrow("campaign_preparation_missing");
    await b.query("ROLLBACK"); await a.query("ROLLBACK");
    await b.query("BEGIN"); await b.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [ns[0]]);
    await expect(prepare(b, scalar())).rejects.toThrow("campaign_preparation_preheld_lock"); await b.query("ROLLBACK");
    await b.query("BEGIN"); await b.query("SELECT pg_advisory_xact_lock(897100,123)");
    await expect(prepare(b, scalar())).rejects.toThrow("campaign_preparation_preheld_lock"); await b.query("ROLLBACK");
    await expect(prisma.$transaction(tx => withCampaignPreparation(tx, scalar(), async () => withDiagnosticSourceCommand(tx, await sourceCommand(tx), async () => undefined)))).rejects.toThrow("campaign_preparation_nested");
  });

  for (const table of ["users", "sessions", "inspection_orders", "diagnostic_centers", "diagnostic_template_versions", "service_conversations", "service_erasure_fences", "video_upload_sessions", "media_uploads", "measurement_state", "totp_enrollments"]) {
    it(`refuses late preparation after a ${table} dependency table lock`, async () => {
      const c = await client(); await c.query("BEGIN");
      await c.query(`LOCK TABLE public.${table} IN ROW SHARE MODE`);
      await expect(prepare(c, scalar())).rejects.toThrow("campaign_preparation_preheld_lock");
    });
  }

  it("preheld campaign metadata locks refuse entry and a fence receipt cannot authorize protected source DML", async () => {
    const c = await client(); await c.query("BEGIN");
    await c.query(`LOCK TABLE "${ns[0]}".campaign_manifest IN ROW SHARE MODE`);
    await expect(prepare(c, scalar())).rejects.toThrow("campaign_preparation_preheld_lock");
    await c.query("ROLLBACK");
    await expect(prisma.$transaction(tx => withCampaignPreparation(tx, scalar(), () => tx.user.update({ where: { id: users[0] }, data: { suspendedAt: new Date() } })))).rejects.toThrow("diagnostic_source_unprepared");
  });

  it("direct INSERT cannot forge scope or backend identity, UPDATE cannot extend it, and rollback leaves no payload", async () => {
    const c = await client(); await c.query("BEGIN");
    const forged = randomUUID();
    const r = await c.query<{ id: string; backend_pid: number; scope: { namespaces: string[] } }>("INSERT INTO campaign_preparations(id,backend_pid,full_transaction_id,mutations,scope) VALUES($1,-1,'forged',$2,'{}') RETURNING *", [forged, JSON.stringify(scalar())]);
    expect(present(r.rows[0]).id).not.toBe(forged); expect(present(r.rows[0]).backend_pid).toBeGreaterThan(0); expect(present(r.rows[0]).scope.namespaces).toEqual([ns[0]]);
    await expect(c.query("UPDATE campaign_preparations SET scope='{}' WHERE id=$1", [present(r.rows[0]).id])).rejects.toThrow("campaign_preparation_immutable");
    await c.query("ROLLBACK");
  });

  it("TRUNCATE cannot bypass campaign journaling or transient-state completion", async () => {
    const c = await client(); await c.query("BEGIN");
    await expect(c.query("TRUNCATE campaign_preparations")).rejects.toThrow("campaign_preparation_immutable");
    await c.query("ROLLBACK"); await c.query("BEGIN");
    await expect(c.query("TRUNCATE dealership_invitations CASCADE")).rejects.toThrow("campaign_preparation_truncate");
  });

  it("unfinished preparation fails commit and a forged receipt cannot finish another transaction", async () => {
    const c = await client(); await c.query("BEGIN"); await prepare(c, scalar());
    await expect(c.query("COMMIT")).rejects.toThrow("campaign_preparation_unfinished");
    await c.query("BEGIN");
    await expect(c.query("SELECT campaign_finish($1)", [randomUUID()])).rejects.toThrow("campaign_preparation_receipt");
  });
  it("admitted-business foreign media references retain the original tracker and the cleaning ledger fence", async () => {
    const id=randomUUID(), directory=`pending/${id}/`, key=directory+"original.webp";
    const objectKeys=[key,...["thumbnail","list","detail","fullscreen"].map(name => directory+name+".webp")];
    const owner=businessUser("buyer-a"), outsider=randomUUID(), draft=randomUUID();
    const [manifest] = (await pool.query<{ tracking_hash: string }>(`SELECT tracking_hash FROM "${businessNamespace}".campaign_manifest`)).rows;
    await prisma.$transaction(tx => withCampaignPreparation(tx,[{ table: "media_uploads",key: { id },verb: "insert",next: { userId: owner,businessId: admittedBusinessId,key,objectKeys } }],
      () => tx.mediaUpload.create({ data: { id,userId: owner,businessId: admittedBusinessId,key,objectKeys,kind: "image",contentType: "image/webp",sizeBytes: 64,writeProtocol: "conditional-v1",state: "AVAILABLE" } })));
    const [owned] = (await pool.query<{ row_hash: string; actual: string }>(`SELECT r.row_hash,md5(to_jsonb(u)::text) actual FROM "${businessNamespace}".campaign_records r JOIN media_uploads u ON r.row_key=jsonb_build_object('id',u.id) WHERE r.table_name='media_uploads' AND u.id=$1`,[id])).rows;
    expect(present(owned).row_hash).toBe(present(owned).actual);
    await prisma.user.create({ data: { id: outsider,email: `${outsider}@foreign-media.invalid` } });
    await prisma.listingDraft.create({ data: { id: draft,userId: outsider,payload: {} } });
    const foreignMutations: CampaignMutation[] = [
      { table: "users",key: { id: outsider },verb: "update",next: { avatarUploadId: id,avatarKey: key } },
      { table: "listing_drafts",key: { id: draft },verb: "update",next: { payload: { uploadId: id,key } } },
    ];
    await prisma.$transaction(tx => withCampaignPreparation(tx,foreignMutations,async () => {
      const [receipt]=await tx.$queryRaw<{ namespaces: string[] }[]>`SELECT scope->'namespaces' namespaces FROM campaign_preparations WHERE backend_pid=pg_backend_pid()`;
      expect(present(receipt).namespaces).toEqual([businessNamespace]);
      await tx.user.update({ where: { id: outsider },data: { avatarUploadId: id,avatarKey: key } });
      await tx.listingDraft.update({ where: { id: draft },data: { payload: { uploadId: id,key } } });
    }));
    expect((await pool.query(`SELECT 1 FROM "${businessNamespace}".campaign_records WHERE (table_name='users' AND row_key=jsonb_build_object('id',$1::text)) OR (table_name='listing_drafts' AND row_key=jsonb_build_object('id',$2::text))`,[outsider,draft])).rowCount).toBe(0);
    await prisma.$transaction(tx => withCampaignPreparation(tx,[
      { table: "users",key: { id: outsider },verb: "update",next: { avatarUploadId: null,avatarKey: null } },
      { table: "listing_drafts",key: { id: draft },verb: "update",next: { payload: {} } },
    ],async () => {
      await tx.user.update({ where: { id: outsider },data: { avatarUploadId: null,avatarKey: null } });
      await tx.listingDraft.update({ where: { id: draft },data: { payload: {} } });
    }));
    // Model the preactivation interrupted-cleaning graph with the original
    // reset table/FK/namespace prefix and original ledger/hash expression.
    // No reset command, storage/queue action or guard exemption is tested here.
    // The tested foreign writes below run only after every guard is restored.
    const triggers=await pool.query<{ table: string; name: string }>("SELECT c.relname table,t.tgname name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate'");
    try {
      for (const trigger of triggers.rows) await pool.query(`ALTER TABLE public."${trigger.table}" DISABLE TRIGGER "${trigger.name}"`);
      await pool.query(`BEGIN; ${businessPrelude}
        INSERT INTO "${businessNamespace}".campaign_object_ledger(object_key,upload_id,bucket) SELECT unnest("objectKeys"),id,'listing-photos' FROM media_uploads WHERE id='${id}';
        UPDATE "${businessNamespace}".campaign_manifest SET object_hash=(SELECT md5(coalesce(jsonb_agg(jsonb_build_object('object_key',l.object_key,'upload_id',l.upload_id,'bucket',l.bucket) ORDER BY l.object_key),'[]'::jsonb)::text) FROM "${businessNamespace}".campaign_object_ledger l),state='cleaning';
        DELETE FROM media_uploads WHERE id='${id}'; COMMIT;`);
    } finally { await enable(); }
    const foreignBefore=await prisma.user.findUniqueOrThrow({ where: { id: outsider } });
    const draftBefore=await prisma.listingDraft.findUniqueOrThrow({ where: { id: draft } });
    const before=(await pool.query(`SELECT to_jsonb(m) manifest,(SELECT jsonb_agg(to_jsonb(l) ORDER BY object_key) FROM "${businessNamespace}".campaign_object_ledger l) ledger FROM "${businessNamespace}".campaign_manifest m`)).rows;
    for (const mutation of foreignMutations) await expect(prisma.$transaction(tx => withCampaignPreparation(tx,[mutation],async () => {
      if (mutation.table === "users") await tx.user.update({ where: { id: outsider },data: { avatarKey: key } });
      else await tx.listingDraft.update({ where: { id: draft },data: { payload: { uploadId: id,key } } });
    }))).rejects.toThrow("Campaign media reference fenced");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: outsider } })).toEqual(foreignBefore);
    expect(await prisma.listingDraft.findUniqueOrThrow({ where: { id: draft } })).toEqual(draftBefore);
    expect(await prisma.mediaUpload.findUnique({ where: { id } })).toBeNull();
    expect((await pool.query(`SELECT to_jsonb(m) manifest,(SELECT jsonb_agg(to_jsonb(l) ORDER BY object_key) FROM "${businessNamespace}".campaign_object_ledger l) ledger FROM "${businessNamespace}".campaign_manifest m`)).rows).toEqual(before);
    const [current]=(await pool.query<{ intact: boolean }>(`SELECT tracking_hash=$1 AND tracking_hash=md5(pg_get_functiondef('"${businessNamespace}".track_business()'::regprocedure)) intact FROM "${businessNamespace}".campaign_manifest`,[present(manifest).tracking_hash])).rows;
    expect(present(current).intact).toBe(true);
    expect((await pool.query(`SELECT count(*)::int count FROM "${businessNamespace}".campaign_object_ledger`)).rows).toEqual([{ count: 5 }]);
  });

});
