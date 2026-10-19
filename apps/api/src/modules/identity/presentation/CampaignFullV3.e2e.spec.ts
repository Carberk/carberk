import "reflect-metadata";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { PrismaService } from "@auto-tm/db";
import { AuthSchemas } from "@auto-tm/contracts";
import { getQueueToken } from "@nestjs/bullmq";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test as NestTest } from "@nestjs/testing";
import { Worker, type Queue } from "bullmq";
import { generateSync } from "otplib";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { IdentityModule } from "../identity.module";
import { BullMqEmailCodeSenderAdapter } from "../infrastructure/BullMqEmailCodeSenderAdapter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

const root = resolve(__dirname, "../../../../../..");
const packageRoot = `${root}/packages/db`;
const localRequire = createRequire(`${root}/apps/api/package.json`);
const profile = "campaign897-full-v3";
const candidate = "a".repeat(40);
const aliases = ["buyer-a", "buyer-b", "owner", "sales-a", "sales-b", "coordinator", "support", "history-fulfiller", "payment-verifier", "reception-steward", "technician", "independent-reviewer", "private-reviewer", "aggregate-viewer", "investigator"];
const source = readFileSync(`${root}/scripts/staging-campaign.mjs`, "utf8").replaceAll("export function ", "function ").replaceAll("export async function ", "async function ") +
  readFileSync(`${root}/scripts/staging-remote.mjs`, "utf8").replace(/import \{[^}]+\} from '\.\/staging-campaign\.mjs';/, "").replace("export function remoteProgram", "function remoteProgram");
type Actor = { alias: string; user_id: string; email: string };
type Login = { accessToken: string; refreshToken: string; user: { id: string; role: string }; requestId: string };
type RecordKey = { table_name: string; row_key: Record<string, string> };
const tables = ["users", "sessions", "otp_requests", "totp_enrollments", "totp_backup_codes", "staff_grants", "audit_logs", "dealerships", "dealership_members", "dealership_invitations", "listings", "listing_drafts", "conversations", "conversation_participants", "messages", "business_enquiry_audits", "favorites", "verified_contact_phones", "owned_vehicles", "blocked_users", "notification_preferences", "content_reports"];

// No application provider overrides, JWT signing, auth inserts or elevated-session writes.
// The remote process adapter changes only transport to the disposable worker SQL/Redis.
describe("default-closed full-v3 ordinary authentication joins reservation-owned business disposal", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let db: PrismaService;
  let queue: Queue;
  const priorTestMode = process.env["OTP_TEST_MODE"];

  beforeAll(async () => {
    if (!inject("apiTestDatabases")) throw new Error("Requires configured migrated disposable API PostgreSQL and Redis lane");
    delete process.env["OTP_TEST_MODE"];
    const module = await NestTest.createTestingModule({ imports: [bullTestRoot(), IdentityModule,
      JwtModule.register({ global: true, secret: "synthetic-full-v3-http-contract-901" })] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    db = app.get(PrismaService);
    queue = app.get<Queue>(getQueueToken(AuthSchemas.EMAIL_CODE_QUEUE));
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });
  afterAll(async () => {
    await app?.close();
    if (priorTestMode === undefined) delete process.env["OTP_TEST_MODE"];
    else process.env["OTP_TEST_MODE"] = priorTestMode;
  });

  function execute(kind: "fixture" | "reset", id: string, options: { enabled?: string; candidate?: string; selectedProfile?: string; loseReceipt?: boolean } = {}) {
    let code = 0;
    let receipt: { profile: string; candidate: string; state: string; identities: number; fixtures: string; tombstone: boolean; queueJobs?: number; sinkRecords?: number } | undefined;
    let sqlCalls = 0;
    const selectedProfile = options.selectedProfile ?? profile;
    const remoteProcess = { execPath: process.execPath, exitCode: 0, env: {
      STAGING_CAMPAIGN_PROFILE_ENABLED: options.enabled ?? profile,
      RAILWAY_PROJECT_ID: "v3-project", RAILWAY_ENVIRONMENT_ID: "v3-staging", RAILWAY_SERVICE_ID: "v3-api", RAILWAY_ENVIRONMENT_NAME: "staging",
      APP_ENV: "staging", SMS_DRIVER: "mock", AUTOTM_COMMIT_SHA: candidate,
      DATABASE_URL: "postgresql://fixture:synthetic@postgres.railway.internal:5432/railway", REDIS_URL: "redis://fixture:synthetic@redis.railway.internal:6379/0",
      MINIO_ENDPOINT: "http://minio.railway.internal:9000", MINIO_PUBLIC_URL: "https://media.example",
    } };
    const payload = { kind, id, namespace: `cf_${id}`, profile: selectedProfile, candidate: options.candidate ?? candidate, target: candidate,
      redisOrigin: "redis://redis.railway.internal:6379/0", identity: { projectId: "v3-project", environmentId: "v3-staging", services: { api: "v3-api" },
        origins: { database: "postgresql://postgres.railway.internal:5432/railway", media: "http://minio.railway.internal:9000", publicMedia: "https://media.example" } } };
    const program = runInNewContext(`${source}; remoteProgram(payload)`, { payload });
    runInNewContext(program, { URL, process: remoteProcess, require: (name: string) => name === "node:child_process" ? {
      spawnSync: (binary: string, args: string[], spawnOptions: { input: string }) => {
        if (binary === process.execPath) return spawnSync(binary, args, { ...spawnOptions, encoding: "utf8", timeout: 30000, cwd: `${root}/apps/api`, env: process.env });
        sqlCalls += 1;
        return spawnSync(process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
          input: spawnOptions.input, encoding: "utf8", timeout: 30000,
          env: { ...process.env, STAGING_CONTROL_TEST_DATABASE_URL: process.env["DATABASE_URL"], STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json` },
        });
      },
    } : localRequire(name), console: { log: (value: string) => { if (!options.loseReceipt) receipt = JSON.parse(value); }, error: () => { code = 1; } } });
    return { code: code || remoteProcess.exitCode, receipt, sqlCalls };
  }
  const email = (id: string, alias: string) => `${alias}.${id}.${candidate.slice(0, 12)}@campaign897.invalid`;
  async function rows<T>(sql: string, ...values: unknown[]) { return db.$queryRawUnsafe<T[]>(sql, ...values); }
  async function seed(id: string) {
    // FIRST BEHAVIORAL BARRIER. On the supplied base this fails 1 vs 0 before SQL.
    // No nested HTTP, ownership or disposal assertion has been reached at that point.
    expect(execute("fixture", id).code, "full-v3 supported explicit profile required").toBe(0);
    return rows<Actor>(`SELECT alias,user_id,email FROM "cf_${id}".campaign_entities ORDER BY alias`);
  }
  function actor(roster: Actor[], alias: string) {
    const found = roster.find(row => row.alias === alias);
    if (!found) throw new Error("Reserved actor missing");
    return found;
  }
  function processEmail(requestId: string, lateDelivery?: object) {
    return spawnSync(process.execPath, [`${root}/scripts/testing/process-campaign-email.cjs`], {
      input: JSON.stringify({ requestId, ...(lateDelivery ? { lateDelivery } : {}) }), encoding: "utf8", timeout: 30000,
      cwd: `${root}/apps/worker`, env: process.env,
    }).status;
  }
  async function signIn(id: string, person: Actor): Promise<Login> {
    const issued = await request.post("/api/v1/auth/otp/request").send({ email: person.email }).expect(201);
    expect(issued.body.testCode).toBeUndefined();
    const requestId = issued.body.requestId as string;
    expect((await queue.getJob(requestId))?.data.to).toBe(person.email);
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
    expect(verified.body.backupCodes).toHaveLength(10);
    expect((await get("/api/v1/staff/capabilities", login).expect(200)).body.elevated).toBe(true);
  }
  const grant = (login: Login, targetUserId: string, capability: string, enabled = true) => post("/api/v1/staff/grants", login,
    { targetUserId, capability, grant: enabled, reason: "Reservation-owned synthetic full-v3 acceptance" });
  async function digest(id: string) {
    const [snapshot] = await rows<{ hash: string }>(`SELECT md5(jsonb_build_object('manifest',(SELECT jsonb_agg(to_jsonb(m)) FROM "cf_${id}".campaign_manifest m),'records',(SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name,row_key::text) FROM "cf_${id}".campaign_records r),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY sequence) FROM "cf_${id}".campaign_events e))::text) AS hash`);
    return snapshot?.hash;
  }
  async function owned(id: string) {
    return rows<RecordKey>(`SELECT table_name,row_key FROM "cf_${id}".campaign_records WHERE NOT deleted ORDER BY table_name,row_key::text`);
  }
  async function assertDisposed(id: string, before: RecordKey[]) {
    expect((await rows<{ state: string }>(`SELECT state FROM "cf_${id}".campaign_manifest`))).toEqual([{ state: "disposed" }]);
    const remaining = await owned(id);
    expect(remaining.filter(row => row.table_name !== "audit_logs")).toEqual([]);
    expect(remaining).toEqual(before.filter(row => row.table_name === "audit_logs"));
    for (const record of before) {
      expect(tables).toContain(record.table_name);
      const values = await rows<{ value: { actorId: string | null; targetType: string; targetId: string; details: object } }>(`SELECT to_jsonb(t) AS value FROM public.${record.table_name} t WHERE to_jsonb(t) @> $1::jsonb`, JSON.stringify(record.row_key));
      if (record.table_name === "audit_logs") {
        expect(values).toHaveLength(1);
        expect(values[0]?.value).toMatchObject({ actorId: null, targetType: "SyntheticCampaign", targetId: id,
          details: { profile, disposition: "redacted-synthetic-audit" } });
        expect(values[0]?.value.details).toEqual({ profile, disposition: "redacted-synthetic-audit" });
      } else expect(values, `exact owned ${record.table_name} row must be absent`).toEqual([]);
    }
    const deliveries = await rows<{ request_id: string }>(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`);
    const redis = await queue.client;
    for (const delivery of deliveries) {
      expect(await queue.getJob(delivery.request_id)).toBeUndefined();
      const key = queue.toKey(`de:campaign-cf_${id}-${delivery.request_id}`);
      expect(await redis.get(key)).toBe(`disposed:cf_${id}:${candidate}:${delivery.request_id}`);
      expect(await redis.pttl(key)).toBe(-1);
    }
    expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_sink`)).toEqual([]);
  }

  it("supports the explicit v3 profile with a fixed roster and bounded bootstrap, without authenticating it", async () => {
    const id = "a1".repeat(16), roster = await seed(id);
    expect(roster.map(row => row.alias).sort()).toEqual([...aliases].sort());
    expect(new Set(roster.map(row => row.user_id)).size).toBe(15);
    expect(await rows(`SELECT reservation_id,candidate,profile,state,delivery_version FROM "cf_${id}".campaign_manifest`)).toEqual([
      { reservation_id: id, candidate, profile, state: "identities", delivery_version: 3 },
    ]);
    const ids = roster.map(row => row.user_id);
    expect(await db.session.count({ where: { userId: { in: ids } } })).toBe(0);
    expect(await db.totpEnrollment.count({ where: { userId: { in: ids } } })).toBe(0);
    expect(await db.staffGrant.findMany({ where: { userId: { in: ids } }, select: { userId: true, capability: true }, orderBy: { capability: "asc" } })).toEqual([
      { userId: actor(roster, "coordinator").user_id, capability: "founder.control" },
      { userId: actor(roster, "coordinator").user_id, capability: "staff.manage" },
    ]);
    const [counts] = await rows<{ records: number; events: number }>(`SELECT (SELECT count(*)::int FROM "cf_${id}".campaign_records) AS records,(SELECT count(*)::int FROM "cf_${id}".campaign_events) AS events`);
    expect(counts?.records).toBeLessThanOrEqual(128);
    expect(counts?.events).toBeLessThan(2048);
    expect(execute("reset", id).code).toBe(0);
  });

  it("refuses absent enablement and unknown versions before SQL without changing application rows", async () => {
    const before = await db.user.count();
    expect(execute("fixture", "a2".repeat(16), { enabled: "" })).toMatchObject({ code: 1, sqlCalls: 0, receipt: undefined });
    expect(execute("fixture", "a3".repeat(16), { selectedProfile: "campaign897-full-v4" })).toMatchObject({ code: 1, sqlCalls: 0, receipt: undefined });
    expect(await db.user.count()).toBe(before);
  });

  it("signs in normally, elevates distinct staff, admits and redeems ownership, edits content and exactly disposes with lost-response retry", async () => {
    const id = "a4".repeat(16), roster = await seed(id);
    const coordinator = await signIn(id, actor(roster, "coordinator"));
    const admissionStaff = await signIn(id, actor(roster, "support"));
    const owner = await signIn(id, actor(roster, "buyer-a"));
    const outsider = await signIn(id, actor(roster, "sales-b"));
    const target = actor(roster, "support").user_id;
    await grant(coordinator, target, "founder.admission").expect(403);
    await elevate(coordinator);
    await grant(coordinator, actor(roster, "coordinator").user_id, "founder.admission").expect(403);
    await grant(coordinator, target, "founder.admission").expect(204);
    const admission = { name: "Synthetic v3 admitted business", slug: `campaign897-${id}-${candidate.slice(0, 12)}-admitted`, ownerUserId: owner.user.id,
      mode: "synthetic", evidence: "Fictional reservation-owned business only", reason: "Disposable full-v3 ordinary HTTP proof" };
    await post("/api/v1/business/admission", admissionStaff, admission).expect(403);
    await elevate(admissionStaff);
    const admitted = (await post("/api/v1/business/admission", admissionStaff, admission).expect(201)).body as { businessId: string; invitationId: string; token: string };
    expect(await db.dealership.findUnique({ where: { id: admitted.businessId }, select: { status: true, admissionMode: true } })).toEqual({ status: "recovery", admissionMode: "synthetic" });
    await post(`/api/v1/business/${admitted.businessId}/settings`, owner, { name: "Before redemption refused" }).expect(403);
    await post("/api/v1/business/invitations/redeem", outsider, { token: admitted.token }).expect(409);
    await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201);
    await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(409);
    await post(`/api/v1/business/${admitted.businessId}/settings`, owner, { name: "Ordinary owner saved synthetic content" }).expect(201);
    expect((await get("/api/v1/business/current", owner).expect(200)).body.workspace).toMatchObject({ business: { id: admitted.businessId, status: "active", admissionMode: "synthetic", name: "Ordinary owner saved synthetic content" }, membership: { role: "owner" } });
    await post(`/api/v1/business/${admitted.businessId}/settings`, outsider, { name: "Foreign edit refused" }).expect(403);
    await grant(coordinator, target, "founder.admission", false).expect(204);
    await post("/api/v1/business/admission", admissionStaff, { ...admission, slug: `${admission.slug}-revoked` }).expect(403);
    const audit = await db.auditLog.findFirstOrThrow({ where: { targetId: admitted.businessId, action: "BUSINESS_ADMITTED" } });
    expect(audit.actorId).toBe(target);
    expect(audit.details).toMatchObject({ mode: "synthetic", verifiedScope: "Synthetic fixture; no real business verified" });
    expect(JSON.stringify(audit.details).includes(admitted.token)).toBe(false);
    const before = await owned(id);
    for (const table of ["users", "sessions", "otp_requests", "totp_enrollments", "totp_backup_codes", "staff_grants", "dealerships", "dealership_members", "dealership_invitations", "audit_logs"]) expect(before.some(row => row.table_name === table), table).toBe(true);
    expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
    await assertDisposed(id, before);
    const terminal = await digest(id);
    expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
    expect(await digest(id)).toBe(terminal);
    await assertDisposed(id, before);
    await get("/api/v1/business/current", owner).expect(403);
    await request.post("/api/v1/auth/refresh").send({ refreshToken: owner.refreshToken }).expect(401);
    expect(execute("fixture", id).code).toBe(1);
  });

  it("refuses foreign alias collision atomically and preserves the foreign identity", async () => {
    const id = "a5".repeat(16), controlId = "b5".repeat(16), foreignId = randomUUID();
    await seed(controlId);
    // Collision fixture only. This is never used as admission or authentication proof.
    const foreign = await db.user.create({ data: { id: foreignId, email: email(id, "buyer-a"), displayName: "Foreign collision must survive" } });
    expect(execute("fixture", id).code).toBe(1);
    expect(await db.user.findUnique({ where: { id: foreignId } })).toEqual(foreign);
    expect(await rows(`SELECT schema_name FROM information_schema.schemata WHERE schema_name=$1`, `cf_${id}`)).toEqual([]);
    await db.user.delete({ where: { id: foreignId } });
    expect(execute("reset", controlId).code).toBe(0);
  });

  it("preserves another reservation and exact foreign queue content while blocking late enqueue and mock delivery", async () => {
    const id = "a6".repeat(16), otherId = "a7".repeat(16);
    const roster = await seed(id);
    await seed(otherId);
    const other = await digest(otherId);
    const issued = await request.post("/api/v1/auth/otp/request").send({ email: actor(roster, "sales-b").email }).expect(201);
    const requestId = issued.body.requestId as string;
    const pending = await queue.getJob(requestId);
    expect(pending).toBeDefined();
    const data = pending!.data as { to: string; code: string; locale: "ru"; purpose: "sign-in" };
    const foreignId = randomUUID();
    const foreignData = { to: "foreign@example.invalid", code: "654321", locale: "en", purpose: "sign-in" };
    await queue.add(AuthSchemas.EMAIL_CODE_JOB_NAME, foreignData, { jobId: foreignId });
    const before = await owned(id);
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
    expect(await digest(otherId)).toBe(other);
    expect((await queue.getJob(foreignId))?.data).toEqual(foreignData);
    await expect(app.get(BullMqEmailCodeSenderAdapter).enqueue({ requestId, email: data.to, code: data.code, locale: data.locale, purpose: data.purpose })).rejects.toThrow();
    expect(processEmail(requestId, { ...data, to: data.to })).toBe(1);
    await request.post("/api/v1/auth/otp/request").send({ email: data.to }).expect(500);
    await request.post("/api/v1/auth/otp/verify").send({ email: data.to, code: data.code }).expect(400);
    expect(await db.session.count({ where: { userId: actor(roster, "sales-b").user_id } })).toBe(0);
    await assertDisposed(id, before);
    expect(await digest(otherId)).toBe(other);
    await (await queue.getJob(foreignId))?.remove();
    expect(execute("reset", otherId).code).toBe(0);
  });

  it("rolls back row and event budget overflow while retaining room for exact cleanup", async () => {
    const id = "a9".repeat(16), roster = await seed(id);
    const original = await digest(id);
    // Storage-boundary fault probes, separate from the ordinary HTTP content proof.
    // A single failed transaction must leave the entire tracked inventory unchanged.
    await expect(db.$transaction(Array.from({ length: 129 }, () => db.listingDraft.create({ data: {
      userId: actor(roster, "buyer-a").user_id, payload: { description: "Synthetic row budget probe", media: [] },
    } })))).rejects.toThrow(/Campaign.*limit/);
    expect(await digest(id)).toBe(original);
    const business = await db.dealership.findUniqueOrThrow({ where: { slug: `campaign897-${id}-${candidate.slice(0, 12)}` } });
    // No authority/active-status write. Repeat a permitted storage content edit.
    await expect(db.$executeRawUnsafe(`DO $probe$ BEGIN FOR i IN 1..2049 LOOP UPDATE public.dealerships SET name='Synthetic event budget probe' WHERE id='${business.id}'; END LOOP; END $probe$`)).rejects.toThrow(/Campaign.*(limit|budget)/);
    expect(await digest(id)).toBe(original);
    const before = await owned(id);
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
  });

  it("keeps cleaning ownership after an active exact delivery, then resumes the same reset", async () => {
    const id = "aa".repeat(16), roster = await seed(id);
    const issued = await request.post("/api/v1/auth/otp/request").send({ email: actor(roster, "buyer-a").email }).expect(201);
    const requestId = issued.body.requestId as string;
    const before = await owned(id);
    // A real BullMQ lock provides an explicit barrier. Never enumerate queue jobs.
    const worker = new Worker(AuthSchemas.EMAIL_CODE_QUEUE, async () => {}, {
      connection: { url: process.env["REDIS_URL"]! }, autorun: false,
    });
    const token = randomUUID();
    const job = await worker.getNextJob(token, { block: false });
    try {
      expect(job?.id, "exact disposable delivery claim required before reset proof").toBe(requestId);
      expect(await job!.getState()).toBe("active");
      expect(execute("reset", id).code).toBe(1);
      expect(await rows(`SELECT state FROM "cf_${id}".campaign_manifest`)).toEqual([{ state: "cleaning" }]);
      expect((await queue.getJob(requestId))?.data.to).toBe(actor(roster, "buyer-a").email);
      await request.post("/api/v1/auth/otp/request").send({ email: actor(roster, "sales-b").email }).expect(500);
    } finally {
      try { await job?.moveToWait(token); } finally { await worker.close(); }
    }
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
  });

  it("refuses a changed candidate without altering live ownership or ordinary sessions", async () => {
    const id = "a8".repeat(16), roster = await seed(id);
    const login = await signIn(id, actor(roster, "buyer-a"));
    const before = await digest(id);
    expect(execute("reset", id, { candidate: "b".repeat(40) })).toMatchObject({ code: 1, receipt: undefined });
    expect(await digest(id)).toBe(before);
    await get("/api/v1/business/current", login).expect(200);
    expect(execute("reset", id).code).toBe(0);
  });
});
