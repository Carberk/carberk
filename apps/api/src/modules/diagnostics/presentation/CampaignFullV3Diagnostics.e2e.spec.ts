import "reflect-metadata";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { PrismaService } from "@auto-tm/db";
import { AuthSchemas, DiagnosticSchemas } from "@auto-tm/contracts";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test as nest } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { generateSync } from "otplib";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { IdentityModule } from "../../identity/identity.module";
import { DiagnosticsModule } from "../diagnostics.module";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const root = resolve(__dirname, "../../../../../..");
const packageRoot = `${root}/packages/db`;
const localRequire = createRequire(`${root}/apps/api/package.json`);
const profile = "campaign897-full-v3";
const candidate = "a".repeat(40);
const source = readFileSync(`${root}/scripts/staging-campaign.mjs`, "utf8").replaceAll("export function ", "function ").replaceAll("export async function ", "async function ") +
  readFileSync(`${root}/scripts/staging-remote.mjs`, "utf8").replace(/import \{[^}]+\} from '\.\/staging-campaign\.mjs';/, "").replace("export function remoteProgram", "function remoteProgram");
type Actor = { alias: string; user_id: string; email: string };
type Login = { accessToken: string; refreshToken: string; user: { id: string; role: string }; requestId: string };
type RecordKey = { table_name: string; row_key: Record<string, string> };
const reservation = "d901".repeat(8);
const uuid = (label: string) => {
  const hex = createHash("sha256").update(`${reservation}:${label}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const centerId = uuid(`campaign897:diagnostics:center:${reservation}:${candidate}`);
const centerCode = `campaign897-${reservation}-${candidate.slice(0, 12)}-diagnostics`;
const requestKey = uuid(`campaign897:diagnostics:intake:issue901-private-intake-v1:${candidate}`);
const diagnosticTables = ["diagnostic_centers", "diagnostic_center_assignments", "diagnostic_template_versions", "inspection_orders", "diagnostic_order_assignments", "diagnostic_audits"];
const text = { tk: "Synthetic", ru: "Synthetic", en: "Synthetic" };
const publication = DiagnosticSchemas.PublishDiagnosticTemplateSchema.parse({ expectedVersion: 0, synthetic: true, definition: {
  title: text, limitations: text, syntheticNotice: text,
  checks: [{ id: "visual", label: text, required: true, evidenceRequired: false, measurement: null }], panels: [],
} });

// Disposable transport only. Production auth, grants and diagnostic providers stay intact.
describe("full-v3 ordinary template publication, private intake and exact disposal", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let db: PrismaService;
  let queue: Queue;
  let priorTestMode: string | undefined;
  let priorCommitSha: string | undefined;
  let priorSmsDriver: string | undefined;

  beforeAll(async () => {
    priorTestMode = process.env["OTP_TEST_MODE"];
    priorCommitSha = process.env["AUTOTM_COMMIT_SHA"];
    priorSmsDriver = process.env["SMS_DRIVER"];
    if (!inject("apiTestDatabases")) throw new Error("Requires configured migrated disposable API PostgreSQL and Redis lane");
    delete process.env["OTP_TEST_MODE"];
    // The real adapter validates its serving candidate before taking the
    // namespace fence. Match the exact full-v3 fixture candidate and select
    // its existing mock sink. This is test transport configuration only.
    process.env["AUTOTM_COMMIT_SHA"] = candidate;
    process.env["SMS_DRIVER"] = "mock";
    const composition = { imports: [ConfigModule.forRoot({ isGlobal: true }), EventEmitterModule.forRoot(), bullTestRoot(), IdentityModule, DiagnosticsModule,
      JwtModule.register({ global: true, secret: "synthetic-full-v3-diagnostics-contract-901" })] };
    const module = await nest.createTestingModule(composition).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService);
    queue = app.get<Queue>(getQueueToken(AuthSchemas.EMAIL_CODE_QUEUE));
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });
  afterAll(async () => {
    try { await app?.close(); } finally {
      if (priorTestMode === undefined) delete process.env["OTP_TEST_MODE"];
      else process.env["OTP_TEST_MODE"] = priorTestMode;
      if (priorCommitSha === undefined) delete process.env["AUTOTM_COMMIT_SHA"];
      else process.env["AUTOTM_COMMIT_SHA"] = priorCommitSha;
      if (priorSmsDriver === undefined) delete process.env["SMS_DRIVER"];
      else process.env["SMS_DRIVER"] = priorSmsDriver;
    }
  });

  function execute(kind: "fixture" | "reset", id: string, options: { candidate?: string; loseReceipt?: boolean } = {}) {
    let code = 0;
    let receipt: { profile: string; candidate: string; state: string; identities: number; fixtures: string; tombstone: boolean; queueJobs?: number; sinkRecords?: number } | undefined;
    let sqlCalls = 0;
    const remoteProcess = { execPath: process.execPath, exitCode: 0, env: {
      STAGING_CAMPAIGN_PROFILE_ENABLED: profile,
      RAILWAY_PROJECT_ID: "v3-project", RAILWAY_ENVIRONMENT_ID: "v3-staging", RAILWAY_SERVICE_ID: "v3-api", RAILWAY_ENVIRONMENT_NAME: "staging",
      APP_ENV: "staging", SMS_DRIVER: "mock", AUTOTM_COMMIT_SHA: candidate,
      DATABASE_URL: "postgresql://fixture:synthetic@postgres.railway.internal:5432/railway", REDIS_URL: "redis://fixture:synthetic@redis.railway.internal:6379/0",
      MINIO_ENDPOINT: "http://minio.railway.internal:9000", MINIO_PUBLIC_URL: "https://media.example",
    } };
    const payload = { kind, id, namespace: `cf_${id}`, profile, candidate: options.candidate ?? candidate, target: candidate,
      redisOrigin: "redis://redis.railway.internal:6379/0", identity: { projectId: "v3-project", environmentId: "v3-staging", services: { api: "v3-api" },
        origins: { database: "postgresql://postgres.railway.internal:5432/railway", media: "http://minio.railway.internal:9000", publicMedia: "https://media.example" } } };
    const observe = <T extends { status: number | null; error?: Error; stderr?: string | null }>(result: T, transport: "sql" | "disposal") => {
      if (result.status !== 0 || result.error) console.error("[issue-901-cleanup]", JSON.stringify({ kind, transport, sqlCalls,
        failed: true }));
      return result;
    };
    const program = runInNewContext(`${source}; remoteProgram(payload)`, { payload });
    runInNewContext(program, { URL, process: remoteProcess, require: (name: string) => name === "node:child_process" ? {
      spawnSync: (binary: string, args: string[], spawnOptions: { input: string }) => {
        if (binary === process.execPath) return observe(spawnSync(binary, args, { ...spawnOptions, encoding: "utf8", timeout: 30000, cwd: `${root}/apps/api`, env: { ...process.env,
          // Disposable credentials from docker-compose.ci.yml, only in the existing local child bridge.
          ...(process.env["APP_ENV"] === "test" && ["localhost", "127.0.0.1"].includes(new URL(process.env["MINIO_ENDPOINT"] ?? "http://invalid").hostname)
            ? { MINIO_ACCESS_KEY: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin", MINIO_SECRET_KEY: process.env["MINIO_SECRET_KEY"] ?? "minioadmin" } : {}) } }), "disposal");
        sqlCalls += 1;
        return observe(spawnSync(process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
          input: spawnOptions.input, encoding: "utf8", timeout: 30000,
          env: { ...process.env, STAGING_CONTROL_TEST_DATABASE_URL: process.env["DATABASE_URL"], STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json` },
        }), "sql");
      },
    } : localRequire(name), console: { log: (value: string) => { if (!options.loseReceipt) receipt = JSON.parse(value); }, error: () => { console.error("[issue-901-cleanup]", JSON.stringify({ kind, transport: "operator-refusal", sqlCalls })); code = 1; } } });
    return { code: code || remoteProcess.exitCode, receipt, sqlCalls };
  }
  async function rows<T>(sql: string, ...values: unknown[]) { return db.$queryRawUnsafe<T[]>(sql, ...values); }
  async function seed(id: string) {
    expect(execute("fixture", id).code, "full-v3 supported explicit profile required").toBe(0);
    return rows<Actor>(`SELECT alias,user_id,email FROM "cf_${id}".campaign_entities ORDER BY alias`);
  }
  function actor(roster: Actor[], alias: string) {
    const found = roster.find(row => row.alias === alias);
    if (!found) throw new Error("Reserved actor missing");
    return found;
  }
  function processEmail(requestId: string) {
    return spawnSync(process.execPath, [`${root}/scripts/testing/process-campaign-email.cjs`], {
      input: JSON.stringify({ requestId }), encoding: "utf8", timeout: 30000,
      cwd: `${root}/apps/worker`, env: process.env,
    }).status;
  }
  // Runs after the case's acceptance assertions, including failed ones, and removes only job IDs the case created or learned.
  // A failed removal is recorded beside the original failure, never in its place. Queues are never enumerated or drained.
  async function withKnownJobs(body: (known: Set<string>) => Promise<void>) {
    const known = new Set<string>();
    try {
      await body(known);
    } finally {
      for (const jobId of known) {
        const failure = await queue.getJob(jobId).then(job => job?.remove()).then(() => undefined, (error: unknown) => error);
        expect.soft(failure === undefined, "exact known queue job cleanup").toBe(true);
      }
    }
  }
  // Records a returned request ID before any response assertion, so cleanup knows an unexpected successful enqueue.
  function learn(known: Set<string>, response: { body?: { requestId?: unknown } }) {
    const requestId = response.body?.requestId;
    if (typeof requestId === "string" && requestId.length > 0) known.add(requestId);
  }
  async function signIn(id: string, person: Actor, known: Set<string>): Promise<Login> {
    const issued = await request.post("/api/v1/auth/otp/request").send({ email: person.email });
    learn(known, issued);
    expect(issued.status).toBe(201);
    expect(issued.body.testCode === undefined).toBe(true);
    const requestId = issued.body.requestId as string;
    expect((await queue.getJob(requestId))?.data.to === person.email).toBe(true);
    expect(processEmail(requestId), "production worker must persist ordinary generated OTP in protected mock sink").toBe(0);
    const [sink] = await rows<{ message: { subject: string } }>(`SELECT message FROM "cf_${id}".campaign_delivery_sink WHERE request_id=$1 AND email=$2`, requestId, person.email);
    const code = sink?.message.subject.match(/\b\d{6}\b/)?.[0];
    expect(code).toBeDefined();
    const verified = await request.post("/api/v1/auth/otp/verify").send({ email: person.email, code }).expect(201);
    expect(verified.body.user.id).toBe(person.user_id);
    expect(await db.session.count({ where: { userId: person.user_id } })).toBe(1);
    return { ...verified.body, requestId } as Login;
  }
  const get = (path: string, login: Login) => request.get(path).set("authorization", `Bearer ${login.accessToken}`);
  const post = (path: string, login: Login, body: object) => request.post(path).set("authorization", `Bearer ${login.accessToken}`).send(body);
  async function elevate(login: Login) {
    const enrollment = await post("/api/v1/auth/staff/totp/enroll", login, {}).expect(201);
    // Authenticator derives a code ONLY from the secret returned by normal enrollment.
    const verified = await post("/api/v1/auth/staff/totp/verify", login, {
      code: generateSync({ secret: enrollment.body.secret, strategy: "totp", period: 30 }),
    }).expect(201);
    expect(Array.isArray(verified.body.backupCodes) ? verified.body.backupCodes.length : 0).toBe(10);
    expect((await get("/api/v1/staff/capabilities", login).expect(200)).body.elevated).toBe(true);
  }
  const grant = (login: Login, targetUserId: string, capability: string) => post("/api/v1/staff/grants", login,
    { targetUserId, capability, grant: true, reason: "Reservation-owned synthetic full-v3 acceptance" });

  async function owned() {
    return rows<RecordKey>(`SELECT table_name,row_key FROM "cf_${reservation}".campaign_records WHERE NOT deleted ORDER BY table_name,row_key::text`);
  }
  async function counts() {
    const [value] = await rows<{ records: number; events: number }>(`SELECT
      (SELECT count(*)::int FROM "cf_${reservation}".campaign_records) AS records,
      (SELECT count(*)::int FROM "cf_${reservation}".campaign_events) AS events`);
    return value;
  }
  // Hash public diagnostics and protected control state in SQL. No contacts,
  // credentials, raw rows, child output or server error messages leave this helper.
  async function snapshot() {
    const [journal] = await rows<{ hash: string }>(`SELECT md5(jsonb_build_object(
      'manifest',(SELECT jsonb_agg(to_jsonb(m)) FROM "cf_${reservation}".campaign_manifest m),
      'records',(SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name,row_key::text) FROM "cf_${reservation}".campaign_records r),
      'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY sequence) FROM "cf_${reservation}".campaign_events e))::text) AS hash`);
    const diagnostics = await Promise.all(diagnosticTables.map(async table => {
      const [value] = await rows<{ hash: string }>(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) AS hash FROM public.${table} t`);
      return value?.hash;
    }));
    return { journal: journal?.hash, diagnostics };
  }
  async function unchanged(before: Awaited<ReturnType<typeof snapshot>>) {
    expect(await snapshot()).toEqual(before);
  }
  async function assertDisposed(before: RecordKey[], deliveries: string[]) {
    expect(await rows(`SELECT state FROM "cf_${reservation}".campaign_manifest`)).toEqual([{ state: "disposed" }]);
    const retained = await owned();
    expect(retained).toEqual(before.filter(record => record.table_name === "audit_logs"));
    expect(retained).toHaveLength(4);
    for (const record of before) {
      // Journal keys remain historical after deletion. Never adopt or enumerate a queue.
      expect(/^[a-z_]+$/.test(record.table_name)).toBe(true);
      const values = await rows<{ value: { actorId: null; targetType: string; targetId: string; details: object } }>(
        `SELECT to_jsonb(t) AS value FROM public.${record.table_name} t WHERE to_jsonb(t) @> $1::jsonb`, JSON.stringify(record.row_key));
      if (record.table_name === "audit_logs") {
        expect(values).toHaveLength(1);
        expect(values[0]?.value).toMatchObject({ actorId: null, targetType: "SyntheticCampaign", targetId: reservation });
        expect(values[0]?.value.details).toEqual({ profile, disposition: "redacted-synthetic-audit" });
      } else expect(values, `owned ${record.table_name} key absent`).toEqual([]);
    }
    const redis = await queue.client;
    expect(await rows(`SELECT request_id FROM "cf_${reservation}".campaign_delivery_sink`)).toEqual([]);
    const ledger = await rows<{ request_id: string }>(`SELECT request_id FROM "cf_${reservation}".campaign_delivery_ledger ORDER BY request_id`);
    expect(ledger.map(row => row.request_id)).toEqual([...deliveries].sort());
    for (const requestId of deliveries) {
      expect(await queue.getJob(requestId)).toBeUndefined();
      const key = queue.toKey(`de:campaign-cf_${reservation}-${requestId}`);
      expect(await redis.get(key)).toBe(`disposed:cf_${reservation}:${candidate}:${requestId}`);
      expect(await redis.pttl(key)).toBe(-1);
    }
    const historical = await rows<RecordKey>(`SELECT table_name,row_key FROM "cf_${reservation}".campaign_records ORDER BY table_name,row_key::text`);
    expect(historical).toEqual(before);
    const after = await counts();
    expect(after?.records).toBe(64);
    expect(after?.events).toBeGreaterThan(74);
    expect(after?.events).toBeLessThanOrEqual(2048);
  }

  it("publishes v1, replays private intake, refuses foreign edges and retains only exact disposal receipts", () => withKnownJobs(async known => {
    try {
      const roster = await seed(reservation);
      const coordinator = await signIn(reservation, actor(roster, "coordinator"), known);
      const reception = await signIn(reservation, actor(roster, "reception-steward"), known);
      const buyer = await signIn(reservation, actor(roster, "buyer-a"), known);
      await elevate(coordinator);
      await grant(coordinator, reception.user.id, "diagnostics.reception").expect(204);
      await grant(coordinator, reception.user.id, "diagnostics.templates").expect(204);
      await elevate(reception);
      const templatesPath = `/api/v1/diagnostics/centers/${centerId}/templates`;
      const beforePublication = await snapshot();
      const published = await post(templatesPath, reception, publication);
      if (published.status !== 201) {
        // Preserve the failed positive assertion even if failure diagnostics cannot be read.
        try {
          const after = await snapshot();
          console.error("[issue-901-diagnostics-publication]", JSON.stringify({ status: published.status,
            code: published.body.code === "DIAGNOSTIC_NO_ACCESS" ? "DIAGNOSTIC_NO_ACCESS" : "unclassified",
            before: beforePublication, after, unchanged: JSON.stringify(beforePublication) === JSON.stringify(after) }));
          expect.soft(after).toEqual(beforePublication);
        } catch { console.error("[issue-901-diagnostics-publication]", JSON.stringify({ observation: "unavailable" })); }
      }
      // First predicted behavioral boundary, never refusal-as-success.
      expect(published.status, "ordinary template publication requires 201").toBe(201);
      const template = DiagnosticSchemas.DiagnosticTemplateSchema.parse(published.body);
      expect(template).toMatchObject({ centerId, version: 1, definition: publication.definition, synthetic: true });
      expect(await db.diagnosticCenter.findUnique({ where: { id: centerId } })).toMatchObject({ code: centerCode, planCode: "standard", operationalApproval: null });
      const qualifications = await db.diagnosticCenterAssignment.findMany({ where: { centerId }, orderBy: { capability: "asc" } });
      expect(qualifications.map(row => ({ id: row.id, userId: row.userId, capability: row.capability, revokedAt: row.revokedAt }))).toEqual(
        ["diagnostics.reception", "diagnostics.templates"].map(capability => ({
          id: uuid(`campaign897:diagnostics:qualification:reception-steward:${capability}:${candidate}`), userId: reception.user.id, capability, revokedAt: null,
        })));
      const [clock] = await rows<{ now: Date }>("SELECT clock_timestamp() AS now");
      const deadline = qualifications[0]?.qualifiedUntil;
      expect(deadline).toBeInstanceOf(Date);
      expect(qualifications[1]?.qualifiedUntil).toEqual(deadline);
      expect(deadline!.getTime()).toBeGreaterThan(clock!.now.getTime());
      expect(deadline!.getTime()).toBeLessThanOrEqual(clock!.now.getTime() + 2 * 60 * 60 * 1000);
      const bootstrapAudits = await db.diagnosticAudit.findMany({ where: { centerId, action: { in: ["CENTER_SYNTHETIC_BOOTSTRAPPED", "CENTER_QUALIFICATION_SYNTHETIC"] } } });
      expect(bootstrapAudits).toHaveLength(3);
      expect(bootstrapAudits.filter(row => row.action === "CENTER_SYNTHETIC_BOOTSTRAPPED")).toHaveLength(1);
      expect(bootstrapAudits.filter(row => row.action === "CENTER_QUALIFICATION_SYNTHETIC").sort((a, b) => String((a.details as Record<string, unknown>)["capability"]).localeCompare(String((b.details as Record<string, unknown>)["capability"]))).map(row => row.details)).toEqual(
        ["diagnostics.reception", "diagnostics.templates"].map(capability => ({ profile, provenance: "synthetic-test-only-v1", capability, userId: reception.user.id })));

      expect(bootstrapAudits.find(row => row.action === "CENTER_SYNTHETIC_BOOTSTRAPPED")?.details).toEqual({ profile, provenance: "synthetic-test-only-v1" });
      for (const audit of bootstrapAudits) expect(audit).toMatchObject({ actorId: null, orderId: null, centerId });
      const publishedState = await snapshot();
      // A lost fixture response replays existing ownership without extending qualification.
      expect(execute("fixture", reservation, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
      expect(execute("fixture", reservation).code).toBe(0);
      expect((await get(templatesPath, reception).expect(200)).body).toEqual([template]);
      await unchanged(publishedState);
      // Expected-version publication is not a request-key replay.
      await post(templatesPath, reception, publication).expect(409);
      await post(templatesPath, coordinator, publication).expect(403);
      await unchanged(publishedState);

      const intake = DiagnosticSchemas.DiagnosticCreateSchema.parse({ requestKey, centerId, templateVersionId: template.id, audience: "buyer_private", synthetic: true });
      const created = await post("/api/v1/diagnostics/orders", buyer, intake).expect(201);
      const order = DiagnosticSchemas.DiagnosticOrderSchema.parse(created.body);
      expect(order).toMatchObject({ centerId, templateVersionId: template.id, audience: "buyer_private", listingId: null, publicationAuthorization: null, synthetic: true });
      expect(await db.diagnosticOrderAssignment.findMany({ where: { orderId: order.id }, select: { userId: true, capability: true, revokedAt: true } })).toEqual([
        { userId: reception.user.id, capability: "diagnostics.reception", revokedAt: null },
      ]);
      expect((await get(`/api/v1/diagnostics/centers/${centerId}/queue`, reception).expect(200)).body.map((value: { id: string }) => value.id)).toEqual([order.id]);
      const intakeState = await snapshot();
      expect((await post("/api/v1/diagnostics/orders", buyer, intake).expect(201)).body).toEqual(order);
      const conflict = await post("/api/v1/diagnostics/orders", buyer, { ...intake, centerId: uuid("foreign-center") }).expect(409);
      expect(conflict.body.code).toBe("DIAGNOSTIC_IDEMPOTENCY_CONFLICT");
      await get(`/api/v1/diagnostics/orders/${order.id}`, coordinator).expect(403);
      await post("/api/v1/diagnostics/orders", buyer, { ...intake, requestKey: uuid("foreign-template-request"), templateVersionId: uuid("foreign-template") }).expect(400);
      await unchanged(intakeState);
      // A stale serving candidate cannot reuse an ordinary Session or reset authority.
      process.env["AUTOTM_COMMIT_SHA"] = "b".repeat(40);
      try { await get(templatesPath, reception).expect(403); }
      finally { process.env["AUTOTM_COMMIT_SHA"] = candidate; }
      expect(execute("reset", reservation, { candidate: "b".repeat(40) }).code).toBe(1);
      await unchanged(intakeState);

      const keys = await owned();
      expect(keys.filter(row => diagnosticTables.includes(row.table_name)).reduce<Record<string, number>>((counts, row) => {
        counts[row.table_name] = (counts[row.table_name] ?? 0) + 1; return counts;
      }, {})).toEqual({ diagnostic_centers: 1, diagnostic_center_assignments: 2, diagnostic_template_versions: 1,
        inspection_orders: 1, diagnostic_order_assignments: 1, diagnostic_audits: 5 });
      expect(await counts()).toEqual({ records: 64, events: 74 });
      expect(keys).toHaveLength(64);
      // A single exact external FK probe is control-only, never an adopted application row.
      // Integrity may refuse before FK preflight; preservation is required either way.
      await db.$executeRawUnsafe(`CREATE SCHEMA "df_${reservation}"`);
      try {
        await db.$executeRawUnsafe(`CREATE TABLE "df_${reservation}".foreign_edge(order_id text PRIMARY KEY REFERENCES public.inspection_orders(id) ON DELETE RESTRICT)`);
        await db.$executeRawUnsafe(`INSERT INTO "df_${reservation}".foreign_edge VALUES ($1)`, order.id);
        const foreignState = await snapshot();
        expect(execute("reset", reservation).code).toBe(1);
        await unchanged(foreignState);
        expect(await rows(`SELECT order_id FROM "df_${reservation}".foreign_edge`)).toEqual([{ order_id: order.id }]);
      } finally {
        const tableRemoved = await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "df_${reservation}".foreign_edge`).then(() => true, () => false);
        expect.soft(tableRemoved, "exact foreign-edge probe cleanup").toBe(true);
        const schemaRemoved = await db.$executeRawUnsafe(`DROP SCHEMA "df_${reservation}"`).then(() => true, () => false);
        expect.soft(schemaRemoved, "exact foreign schema cleanup").toBe(true);
      }
      await unchanged(intakeState);
      expect(execute("reset", reservation, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
      await assertDisposed(keys, [coordinator.requestId, reception.requestId, buyer.requestId]);
      const terminal = await snapshot();
      const terminalCounts = await counts();
      const retry = execute("reset", reservation);
      expect(retry.code).toBe(0);
      expect(retry.receipt).toMatchObject({ profile, candidate, state: "disposed" });
      await unchanged(terminal);
      expect(await counts()).toEqual(terminalCounts);
      // Lifecycle invalidation applies even while the original two-hour deadline is future.
      await get(templatesPath, reception).expect(403);
      expect(execute("fixture", reservation).code).toBe(1);
      await unchanged(terminal);
      console.info("[issue-901-diagnostics-ledger]", JSON.stringify({ preReset: { records: 64, events: 74, deliveries: 3 }, terminal: terminalCounts, recordCap: 128, eventCap: 2048, completeFit: "UNKNOWN" }));
    } finally {
      // A refused exact cleanup is additional evidence, never a replacement for 201 failure.
      let cleaned = false;
      try { cleaned = execute("reset", reservation).code === 0; }
      catch { console.error("[issue-901-diagnostics-cleanup]", JSON.stringify({ refused: true })); }
      expect.soft(cleaned, "exact reservation cleanup").toBe(true);
    }
  }));
});
