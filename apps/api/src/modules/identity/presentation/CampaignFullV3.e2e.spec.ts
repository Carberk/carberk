import "reflect-metadata";
import { Worker as NodeWorker } from "node:worker_threads";
import { Logger } from "@nestjs/common";
import { HttpOtpSenderAdapter } from "../infrastructure/HttpOtpSenderAdapter";
import { PrismaOtpRequestRepository } from "../infrastructure/PrismaOtpRequestRepository";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";
import { OtpCode } from "../domain/OtpCode";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import type { OtpSms } from "../domain/ports/OtpSenderPort";
import { execFile, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { promisify } from "node:util";
import { PrismaService } from "@auto-tm/db";
import { AuthSchemas, Enums } from "@auto-tm/contracts";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test as NestTest } from "@nestjs/testing";
import { Worker, type Queue } from "bullmq";
import { generateSync } from "otplib";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
// eslint-disable-next-line no-restricted-imports -- HTTP integration composition needs the real contact controller and production providers.
import { ListingsModule } from "../../listings/listings.module";
import { ServiceMessagingModule } from "../../service-messaging/service-messaging.module";
import { IdentityModule } from "../identity.module";
import { BullMqEmailCodeSenderAdapter } from "../infrastructure/BullMqEmailCodeSenderAdapter";
import { AdminController } from "../../admin/presentation/admin.controller";
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
  let priorTestMode: string | undefined;
  let priorCommitSha: string | undefined;
  let priorSmsDriver: string | undefined;

  beforeAll(async () => {
    if (!inject("apiTestDatabases")) throw new Error("Requires configured migrated disposable API PostgreSQL and Redis lane");
    priorTestMode = process.env["OTP_TEST_MODE"];
    priorCommitSha = process.env["AUTOTM_COMMIT_SHA"];
    priorSmsDriver = process.env["SMS_DRIVER"];
    delete process.env["OTP_TEST_MODE"];
    // The real adapter validates its serving candidate before taking the
    // namespace fence. Match the exact full-v3 fixture candidate and select
    // its existing mock sink. This is test transport configuration only.
    process.env["AUTOTM_COMMIT_SHA"] = candidate;
    process.env["SMS_DRIVER"] = "mock";
    const module = await NestTest.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), EventEmitterModule.forRoot(), bullTestRoot(), IdentityModule, ListingsModule, ServiceMessagingModule,
      JwtModule.register({ global: true, secret: "synthetic-full-v3-http-contract-901" })],
      controllers: [AdminController] }).compile();
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
    if (priorCommitSha === undefined) delete process.env["AUTOTM_COMMIT_SHA"];
    else process.env["AUTOTM_COMMIT_SHA"] = priorCommitSha;
    if (priorSmsDriver === undefined) delete process.env["SMS_DRIVER"];
    else process.env["SMS_DRIVER"] = priorSmsDriver;
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
  // Runs after the case's acceptance assertions, including failed ones, and removes only job IDs the case created or learned.
  // A failed removal is recorded beside the original failure, never in its place. Queues are never enumerated or drained.
  async function withKnownJobs(body: (known: Set<string>) => Promise<void>) {
    const known = new Set<string>();
    try {
      await body(known);
    } finally {
      for (const jobId of known) {
        const failure = await queue.getJob(jobId).then(job => job?.remove()).then(() => undefined, (error: unknown) => error);
        expect.soft(failure, `exact known queue job cleanup ${jobId}`).toBeUndefined();
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
  // Admission-slice setup: the coordinator grants support the named capabilities and both elevate normally.
  async function elevatedStaff(id: string, roster: Actor[], known: Set<string>, capabilities: string[]) {
    const coordinator = await signIn(id, actor(roster, "coordinator"), known);
    const staff = await signIn(id, actor(roster, "support"), known);
    await elevate(coordinator);
    for (const capability of capabilities) await grant(coordinator, actor(roster, "support").user_id, capability).expect(204);
    await elevate(staff);
    return { coordinator, staff };
  }
  const admissionFor = (id: string, ownerUserId: string, slug = `campaign897-${id}-${candidate.slice(0, 12)}-admitted`) => ({ name: "Synthetic v3 admitted business", slug, ownerUserId,
    mode: "synthetic", evidence: "Fictional reservation-owned business only", reason: "Disposable full-v3 ordinary HTTP proof" });
  const recoveryFor = (ownerUserId: string) => ({ ownerUserId, evidence: "Synthetic foreign recovery probe", reason: "Disposable full-v3 adoption refusal proof" });
  // Resets each named reservation after the case, including a failed one, so its sign-in codes stop counting
  // against the shared loopback issuance budget. A refused reset is recorded beside the original failure.
  async function resetAfter(ids: string[], body: () => Promise<void>) {
    try { await body(); } finally { for (const id of ids) expect.soft(execute("reset", id).code, `exact reset ${id}`).toBe(0); }
  }
  async function businessState(businessId: string) {
    return { business: await db.dealership.findUnique({ where: { id: businessId } }),
      invitations: await db.dealershipInvitation.findMany({ where: { dealershipId: businessId }, orderBy: { id: "asc" } }),
      members: await db.dealershipMember.findMany({ where: { dealershipId: businessId }, orderBy: { id: "asc" } }),
      audits: await db.auditLog.findMany({ where: { targetType: "Dealership", targetId: businessId }, orderBy: { id: "asc" } }) };
  }
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

  it("signs in normally, elevates distinct staff, admits and redeems ownership, edits content and exactly disposes with lost-response retry", () => withKnownJobs(async known => {
    const id = "a4".repeat(16), roster = await seed(id);
    const coordinator = await signIn(id, actor(roster, "coordinator"), known);
    const admissionStaff = await signIn(id, actor(roster, "support"), known);
    const owner = await signIn(id, actor(roster, "buyer-a"), known);
    const outsider = await signIn(id, actor(roster, "sales-b"), known);
    const target = actor(roster, "support").user_id;
    await grant(coordinator, target, "founder.admission").expect(403);
    await elevate(coordinator);
    await grant(coordinator, actor(roster, "coordinator").user_id, "founder.admission").expect(403);
    await grant(coordinator, target, "founder.admission").expect(204);
    const admission = { name: "Synthetic v3 admitted business", slug: `campaign897-${id}-${candidate.slice(0, 12)}-admitted`, ownerUserId: owner.user.id,
      mode: "synthetic", evidence: "Fictional reservation-owned business only", reason: "Disposable full-v3 ordinary HTTP proof" };
    // Each refused step below must leave the whole reservation journal untouched.
    let unchanged = await digest(id);
    await post("/api/v1/business/admission", admissionStaff, admission).expect(403);
    expect(await digest(id), "pre-elevation admission refusal writes nothing").toBe(unchanged);
    await elevate(admissionStaff);
    const admitted = (await post("/api/v1/business/admission", admissionStaff, admission).expect(201)).body as { businessId: string; invitationId: string; token: string };
    expect(await db.dealership.findUnique({ where: { id: admitted.businessId }, select: { status: true, admissionMode: true } })).toEqual({ status: "recovery", admissionMode: "synthetic" });
    expect(await owned(id)).toEqual(expect.arrayContaining([{ table_name: "dealerships", row_key: { id: admitted.businessId } },
      { table_name: "dealership_invitations", row_key: { id: admitted.invitationId } }]));
    unchanged = await digest(id);
    await post(`/api/v1/business/${admitted.businessId}/settings`, owner, { name: "Before redemption refused" }).expect(403);
    await post("/api/v1/business/invitations/redeem", outsider, { token: admitted.token }).expect(409);
    expect(await digest(id), "pre-redemption settings and outsider redemption refusals write nothing").toBe(unchanged);
    await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201);
    const member = await db.dealershipMember.findFirstOrThrow({ where: { dealershipId: admitted.businessId, userId: owner.user.id }, select: { id: true, role: true, status: true } });
    expect(member).toMatchObject({ role: "owner", status: "active" });
    unchanged = await digest(id);
    await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(409);
    expect(await digest(id), "repeated redemption refusal writes nothing").toBe(unchanged);
    await post(`/api/v1/business/${admitted.businessId}/settings`, owner, { name: "Ordinary owner saved synthetic content" }).expect(201);
    expect((await get("/api/v1/business/current", owner).expect(200)).body.workspace).toMatchObject({ business: { id: admitted.businessId, status: "active", admissionMode: "synthetic", name: "Ordinary owner saved synthetic content" }, membership: { role: "owner" } });
    unchanged = await digest(id);
    await post(`/api/v1/business/${admitted.businessId}/settings`, outsider, { name: "Foreign edit refused" }).expect(403);
    expect(await digest(id), "foreign settings refusal writes nothing").toBe(unchanged);
    await grant(coordinator, target, "founder.admission", false).expect(204);
    unchanged = await digest(id);
    await post("/api/v1/business/admission", admissionStaff, { ...admission, slug: `${admission.slug}-revoked` }).expect(403);
    expect(await digest(id), "revoked admission refusal writes nothing").toBe(unchanged);
    const audit = await db.auditLog.findFirstOrThrow({ where: { targetId: admitted.businessId, action: "BUSINESS_ADMITTED" } });
    expect(audit.actorId).toBe(target);
    expect(audit.details).toMatchObject({ mode: "synthetic", verifiedScope: "Synthetic fixture; no real business verified" });
    expect(JSON.stringify(audit.details).includes(admitted.token)).toBe(false);
    const businessAudits = await db.auditLog.findMany({ where: { targetType: "Dealership", targetId: admitted.businessId }, orderBy: { createdAt: "asc" }, select: { id: true, actorId: true, action: true, details: true } });
    expect(businessAudits.map(({ actorId, action, details }) => ({ actorId, action, details }))).toEqual([
      { actorId: target, action: "BUSINESS_ADMITTED", details: { mode: "synthetic", evidence: "Fictional reservation-owned business only", reason: "Disposable full-v3 ordinary HTTP proof", verifiedScope: "Synthetic fixture; no real business verified" } },
      { actorId: owner.user.id, action: "BUSINESS_INVITATION_REDEEMED", details: { invitationId: admitted.invitationId, role: "owner" } },
      { actorId: owner.user.id, action: "BUSINESS_SETTINGS_CHANGED", details: { fields: ["name"] } },
    ]);
    const before = await owned(id);
    for (const table of ["users", "sessions", "otp_requests", "totp_enrollments", "totp_backup_codes", "staff_grants", "dealerships", "dealership_members", "dealership_invitations", "audit_logs"]) expect(before.some(row => row.table_name === table), table).toBe(true);
    for (const row of [{ table_name: "dealerships", row_key: { id: admitted.businessId } }, { table_name: "dealership_invitations", row_key: { id: admitted.invitationId } },
      { table_name: "dealership_members", row_key: { id: member.id } }, ...businessAudits.map(row => ({ table_name: "audit_logs", row_key: { id: row.id } }))]) expect(before, `owned ${row.table_name}`).toContainEqual(row);
    expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
    await assertDisposed(id, before);
    expect(await db.dealership.findUnique({ where: { id: admitted.businessId } })).toBeNull();
    expect(await db.dealershipInvitation.findUnique({ where: { id: admitted.invitationId } })).toBeNull();
    expect(await db.dealershipMember.findUnique({ where: { id: member.id } })).toBeNull();
    // Retained business audits keep no evidence, reason, token or settings text.
    expect(await db.auditLog.findMany({ where: { id: { in: businessAudits.map(row => row.id) } }, select: { actorId: true, targetType: true, targetId: true, details: true } })).toEqual(
      businessAudits.map(() => ({ actorId: null, targetType: "SyntheticCampaign", targetId: id, details: { profile, disposition: "redacted-synthetic-audit" } })));
    const terminal = await digest(id);
    expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
    expect(await digest(id)).toBe(terminal);
    await assertDisposed(id, before);
    await get("/api/v1/business/current", owner).expect(403);
    await request.post("/api/v1/auth/refresh").send({ refreshToken: owner.refreshToken }).expect(401);
    expect(execute("fixture", id).code).toBe(1);
  }));

  it("refuses foreign alias collision atomically and preserves the foreign identity", async () => {
    const id = "a5".repeat(16), controlId = "b5".repeat(16), foreignId = randomUUID();
    await seed(controlId);
    // Collision fixture only. This is never used as admission or authentication proof.
    const foreign = await db.user.create({ data: { id: foreignId, email: email(id, "buyer-a"), emailVerifiedAt: new Date(), displayName: "Foreign collision must survive" } });
    expect(execute("fixture", id).code).toBe(1);
    expect(await db.user.findUnique({ where: { id: foreignId } })).toEqual(foreign);
    expect(await rows(`SELECT schema_name FROM information_schema.schemata WHERE schema_name=$1`, `cf_${id}`)).toEqual([]);
    await db.user.delete({ where: { id: foreignId } });
    expect(execute("reset", controlId).code).toBe(0);
  });

  it("preserves another reservation and exact foreign queue content while blocking late enqueue and mock delivery", () => withKnownJobs(async known => {
    const id = "a6".repeat(16), otherId = "a7".repeat(16);
    const roster = await seed(id);
    await seed(otherId);
    const other = await digest(otherId);
    const issued = await request.post("/api/v1/auth/otp/request").send({ email: actor(roster, "sales-b").email });
    learn(known, issued);
    expect(issued.status).toBe(201);
    const requestId = issued.body.requestId as string;
    const pending = await queue.getJob(requestId);
    expect(pending).toBeDefined();
    const data = pending!.data as { to: string; code: string; locale: "ru"; purpose: "sign-in" };
    const foreignId = randomUUID();
    const foreignData = { to: "foreign@example.invalid", code: "654321", locale: "en", purpose: "sign-in" };
    known.add(foreignId);
    await queue.add(AuthSchemas.EMAIL_CODE_JOB_NAME, foreignData, { jobId: foreignId });
    const before = await owned(id);
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
    expect(await digest(otherId)).toBe(other);
    expect((await queue.getJob(foreignId))?.data).toEqual(foreignData);
    await expect(app.get(BullMqEmailCodeSenderAdapter).enqueue({ requestId, email: data.to, code: data.code, locale: data.locale, purpose: data.purpose })).rejects.toThrow();
    expect(processEmail(requestId, { ...data, to: data.to })).toBe(1);
    const lateRequest = await request.post("/api/v1/auth/otp/request").send({ email: data.to });
    learn(known, lateRequest);
    expect(lateRequest.status).toBe(500);
    await request.post("/api/v1/auth/otp/verify").send({ email: data.to, code: data.code }).expect(400);
    expect(await db.session.count({ where: { userId: actor(roster, "sales-b").user_id } })).toBe(0);
    await assertDisposed(id, before);
    expect(await digest(otherId)).toBe(other);
    await (await queue.getJob(foreignId))?.remove();
    expect(execute("reset", otherId).code).toBe(0);
  }));

  it("rolls back row and event budget overflow while retaining room for exact cleanup", async () => {
    const id = "a9".repeat(16), roster = await seed(id);
    const original = await digest(id);
    const business = await db.dealership.findUniqueOrThrow({ where: { slug: `campaign897-${id}-${candidate.slice(0, 12)}` } });
    // Storage-boundary fault probes, separate from the ordinary HTTP content proof.
    // A single failed transaction must leave the entire tracked inventory unchanged.
    await expect(db.$transaction(Array.from({ length: 129 }, () => db.listingDraft.create({ data: {
      userId: actor(roster, "owner").user_id, businessId: business.id, payload: { description: "Synthetic row budget probe", media: [] },
    } })))).rejects.toThrow(/Campaign.*limit/);
    expect(await digest(id)).toBe(original);
    // No authority/active-status write. Repeat a permitted storage content edit.
    await expect(db.$executeRawUnsafe(`DO $probe$ BEGIN FOR i IN 1..2049 LOOP UPDATE public.dealerships SET name='Synthetic event budget probe' WHERE id='${business.id}'; END LOOP; END $probe$`)).rejects.toThrow(/Campaign.*(limit|budget)/);
    expect(await digest(id)).toBe(original);
    const before = await owned(id);
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
  });

  it("keeps cleaning ownership after an active exact delivery, then resumes the same reset", () => withKnownJobs(async known => {
    const id = "aa".repeat(16), roster = await seed(id);
    const issued = await request.post("/api/v1/auth/otp/request").send({ email: actor(roster, "buyer-a").email });
    learn(known, issued);
    expect(issued.status).toBe(201);
    const requestId = issued.body.requestId as string;
    const before = await owned(id);
    // A real BullMQ lock provides an explicit barrier. Never enumerate queue jobs.
    const worker = new Worker(AuthSchemas.EMAIL_CODE_QUEUE, async () => {}, {
      connection: { url: process.env["REDIS_URL"]! }, autorun: false,
    });
    const token = randomUUID();
    let job: Awaited<ReturnType<typeof worker.getNextJob>> | undefined;
    try {
      // Acquisition sits inside the lifecycle so Worker.close runs even when the claim attempt throws.
      job = await worker.getNextJob(token, { block: false });
      expect(job?.id, "exact disposable delivery claim required before reset proof").toBe(requestId);
      expect(await job!.getState()).toBe("active");
      expect(execute("reset", id).code).toBe(1);
      expect(await rows(`SELECT state FROM "cf_${id}".campaign_manifest`)).toEqual([{ state: "cleaning" }]);
      expect((await queue.getJob(requestId))?.data.to).toBe(actor(roster, "buyer-a").email);
      const refused = await request.post("/api/v1/auth/otp/request").send({ email: actor(roster, "sales-b").email });
      learn(known, refused);
      expect(refused.status).toBe(500);
    } finally {
      // Releases whichever job this token claimed, own or not, before exact known-ID removal; unknown jobs are never removed.
      try { await job?.moveToWait(token); } finally { await worker.close(); }
    }
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
    expect(execute("reset", id).code).toBe(0);
    await assertDisposed(id, before);
  }));

  it("refuses a changed candidate without altering live ownership or ordinary sessions", () => withKnownJobs(async known => {
    const id = "a8".repeat(16), roster = await seed(id);
    const login = await signIn(id, actor(roster, "buyer-a"), known);
    const before = await digest(id);
    expect(execute("reset", id, { candidate: "b".repeat(40) })).toMatchObject({ code: 1, receipt: undefined });
    expect(await digest(id)).toBe(before);
    await get("/api/v1/business/current", login).expect(200);
    expect(execute("reset", id).code).toBe(0);
  }));

  // Elevation expiry is not exercised: identity composes the concrete SystemClockAdapter with no
  // configuration seam, and this spec forbids provider overrides and Session writes. See the #901 handoff.
  it("re-elevates a granted staff alias, consumes one backup code once, refuses a revoked grant on the next request and disposes exactly", () => withKnownJobs(async known => {
    const id = "ab".repeat(16), roster = await seed(id);
    const coordinator = await signIn(id, actor(roster, "coordinator"), known);
    let staff = await signIn(id, actor(roster, "support"), known);
    const staffId = actor(roster, "support").user_id;
    // Authorized recovery of an absent business is refused after the authority check, before any write.
    const recover = (login: Login) => post(`/api/v1/business/${randomUUID()}/recovery`, login,
      { ownerUserId: actor(roster, "owner").user_id, evidence: "Synthetic lifecycle probe only", reason: "Disposable full-v3 grant lifecycle proof" });
    const capabilities = async (login: Login) => (await get("/api/v1/staff/capabilities", login).expect(200)).body as { capabilities: string[]; elevated: boolean; adminTotpExpiresAt?: string };
    const verify = (code: string) => post("/api/v1/auth/staff/totp/verify", staff, { code });

    expect((await get("/api/v1/staff/capabilities", staff).expect(403)).body.details).toEqual({ reason: "CAPABILITY_REQUIRED" });
    await elevate(coordinator);
    await grant(coordinator, staffId, "founder.recovery").expect(204);
    const enrollment = await post("/api/v1/auth/staff/totp/enroll", staff, {}).expect(201);
    const first = (await verify(generateSync({ secret: enrollment.body.secret, strategy: "totp", period: 30 })).expect(201)).body as { adminTotpExpiresAt: string; backupCodes: string[] };
    expect(first.backupCodes).toHaveLength(10);
    expect((await recover(staff).expect(409)).body.details).toEqual({ reason: "RECOVERY_REQUIRED" });

    // Ordinary refresh keeps the deadline; a later TOTP code re-elevates the same Session to a later one.
    const refreshed = await request.post("/api/v1/auth/refresh").send({ refreshToken: staff.refreshToken }).expect(201);
    staff = { ...staff, accessToken: refreshed.body.accessToken, refreshToken: refreshed.body.refreshToken };
    expect(await capabilities(staff)).toEqual({ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: first.adminTotpExpiresAt });
    const reElevated = (await verify(generateSync({ secret: enrollment.body.secret, strategy: "totp", period: 30 })).expect(201)).body as { adminTotpExpiresAt: string };
    expect(Object.keys(reElevated)).toEqual(["adminTotpExpiresAt"]);
    expect(Date.parse(reElevated.adminTotpExpiresAt)).toBeGreaterThan(Date.parse(first.adminTotpExpiresAt));
    expect((await capabilities(staff)).adminTotpExpiresAt).toBe(reElevated.adminTotpExpiresAt);

    const backupCode = first.backupCodes[0]!;
    const byBackup = (await verify(backupCode).expect(201)).body as { adminTotpExpiresAt: string };
    expect(Object.keys(byBackup)).toEqual(["adminTotpExpiresAt"]);
    expect(Date.parse(byBackup.adminTotpExpiresAt)).toBeGreaterThan(Date.parse(reElevated.adminTotpExpiresAt));
    expect((await verify(backupCode).expect(400)).body.code).toBe("INVALID_TOTP");
    expect((await capabilities(staff)).adminTotpExpiresAt).toBe(byBackup.adminTotpExpiresAt);
    // No route reports remaining backup codes, so exact single consumption is read from storage.
    expect(await db.totpBackupCode.count({ where: { totpEnrollment: { userId: staffId }, usedAt: { not: null } } })).toBe(1);
    expect(await db.totpBackupCode.count({ where: { totpEnrollment: { userId: staffId }, usedAt: null } })).toBe(9);

    await grant(coordinator, staffId, "founder.recovery", false).expect(204);
    expect((await recover(staff).expect(403)).body.details).toEqual({ reason: "CAPABILITY_REQUIRED" });
    expect((await get("/api/v1/staff/capabilities", staff).expect(403)).body.details).toEqual({ reason: "CAPABILITY_REQUIRED" });
    expect((await verify(generateSync({ secret: enrollment.body.secret, strategy: "totp", period: 30 })).expect(403)).body.details).toEqual({ reason: "CAPABILITY_REQUIRED" });
    expect(await db.session.count({ where: { userId: staffId } })).toBe(1);
    await grant(coordinator, staffId, "founder.recovery").expect(204);
    expect(await capabilities(staff)).toEqual({ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: byBackup.adminTotpExpiresAt });
    expect((await recover(staff).expect(409)).body.details).toEqual({ reason: "RECOVERY_REQUIRED" });
    expect(await db.auditLog.findMany({ where: { targetType: "User", targetId: staffId }, orderBy: { createdAt: "asc" }, select: { actorId: true, action: true, details: true } })).toEqual([
      { actorId: coordinator.user.id, action: "STAFF_CAPABILITY_GRANTED", details: { capability: "founder.recovery", reason: "Reservation-owned synthetic full-v3 acceptance", previouslyActive: false } },
      { actorId: coordinator.user.id, action: "STAFF_CAPABILITY_REVOKED", details: { capability: "founder.recovery", reason: "Reservation-owned synthetic full-v3 acceptance", previouslyActive: true } },
      { actorId: coordinator.user.id, action: "STAFF_CAPABILITY_GRANTED", details: { capability: "founder.recovery", reason: "Reservation-owned synthetic full-v3 acceptance", previouslyActive: false } },
    ]);

    const before = await owned(id);
    const perTable: Record<string, number> = {};
    for (const row of before) perTable[row.table_name] = (perTable[row.table_name] ?? 0) + 1;
    expect(perTable).toEqual({ users: 15, sessions: 2, otp_requests: 2, totp_enrollments: 2, totp_backup_codes: 20, staff_grants: 3, audit_logs: 5, dealerships: 1, dealership_members: 1 });
    expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`)).toEqual(
      [coordinator.requestId, staff.requestId].sort().map(request_id => ({ request_id })));
    expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
    await assertDisposed(id, before);
    const terminal = await digest(id);
    expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
    expect(await digest(id)).toBe(terminal);
    await assertDisposed(id, before);
    expect((await get("/api/v1/staff/capabilities", staff).expect(403)).body.details).toEqual({ reason: "SESSION_REQUIRED" });
    await request.post("/api/v1/auth/refresh").send({ refreshToken: staff.refreshToken }).expect(401);
    await request.post("/api/v1/auth/refresh").send({ refreshToken: coordinator.refreshToken }).expect(401);
    expect(execute("fixture", id).code).toBe(1);
  }));

  it("refuses an admission slug owned by a foreign or root Dealership and leaves both unchanged", () => withKnownJobs(known => {
    const id = "ac".repeat(16), foreignId = randomUUID();
    return resetAfter([id], async () => {
      const roster = await seed(id);
      // Collision fixture only: a pre-existing Dealership outside every reservation, never adopted or authenticated.
      const slug = `campaign897-${id}-${candidate.slice(0, 12)}-admitted`;
      await db.dealership.create({ data: { id: foreignId, slug, name: "Foreign collision Dealership must survive" } });
      try {
        const foreign = await businessState(foreignId);
        const root = await db.dealership.findUniqueOrThrow({ where: { slug: `campaign897-${id}-${candidate.slice(0, 12)}` } });
        const rootState = await businessState(root.id);
        const { staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
        const unchanged = await digest(id);
        expect((await post("/api/v1/business/admission", staff, admissionFor(id, actor(roster, "buyer-a").user_id, slug)).expect(409)).body.code).toBe("CONFLICT");
        expect((await post("/api/v1/business/admission", staff, admissionFor(id, actor(roster, "buyer-a").user_id, root.slug)).expect(409)).body.code).toBe("CONFLICT");
        expect(await businessState(foreignId)).toEqual(foreign);
        expect(await businessState(root.id)).toEqual(rootState);
        expect(await db.auditLog.count({ where: { action: "BUSINESS_ADMITTED", actorId: actor(roster, "support").user_id } })).toBe(0);
        expect(await digest(id)).toBe(unchanged);
        const before = await owned(id);
        expect(before.filter(row => row.table_name === "dealerships")).toEqual([{ table_name: "dealerships", row_key: { id: root.id } }]);
        expect(execute("reset", id).code).toBe(0);
        await assertDisposed(id, before);
        expect(await businessState(foreignId)).toEqual(foreign);
      } finally {
        await db.dealership.delete({ where: { id: foreignId } });
      }
    });
  }));

  it("refuses to adopt a pre-existing foreign Dealership through owner recovery and rolls back every write", () => withKnownJobs(known => {
    const id = "ad".repeat(16), foreignId = randomUUID();
    return resetAfter([id], async () => {
      const roster = await seed(id);
      // Ownerless foreign Dealership in recovery: ordinary recovery would invite a roster User into it.
      await db.dealership.create({ data: { id: foreignId, slug: `foreign-adoption-${foreignId}`, name: "Foreign recovery Dealership must survive" } });
      try {
        const foreign = await businessState(foreignId);
        const measurement = await db.measurementState.findMany({ orderBy: { key: "asc" } });
        const { staff } = await elevatedStaff(id, roster, known, ["founder.recovery"]);
        const unchanged = await digest(id);
        const refused = await post(`/api/v1/business/${foreignId}/recovery`, staff, recoveryFor(actor(roster, "buyer-b").user_id));
        expect(refused.status, "foreign Dealership adoption must refuse").toBeGreaterThanOrEqual(400);
        expect(await businessState(foreignId)).toEqual(foreign);
        expect(await db.dealershipInvitation.count({ where: { recipientUserId: actor(roster, "buyer-b").user_id } })).toBe(0);
        expect(await db.measurementState.findMany({ orderBy: { key: "asc" } })).toEqual(measurement);
        expect(await digest(id)).toBe(unchanged);
        const before = await owned(id);
        expect(before.some(row => row.row_key["id"] === foreignId)).toBe(false);
        expect(execute("reset", id).code).toBe(0);
        await assertDisposed(id, before);
        expect(await businessState(foreignId)).toEqual(foreign);
      } finally {
        await db.dealership.delete({ where: { id: foreignId } });
      }
    });
  }));

  it("keeps a second reservation's admitted Dealership out of the first and preserves it through the first reset", () => withKnownJobs(known => {
    const id = "ae".repeat(16), otherId = "af".repeat(16);
    return resetAfter([id, otherId], async () => {
      const roster = await seed(id), otherRoster = await seed(otherId);
      const other = await elevatedStaff(otherId, otherRoster, known, ["founder.admission"]);
      const admitted = (await post("/api/v1/business/admission", other.staff, admissionFor(otherId, actor(otherRoster, "buyer-a").user_id)).expect(201)).body as { businessId: string; invitationId: string };
      const otherBefore = await owned(otherId);
      expect(otherBefore).toEqual(expect.arrayContaining([{ table_name: "dealerships", row_key: { id: admitted.businessId } },
        { table_name: "dealership_invitations", row_key: { id: admitted.invitationId } }]));
      const otherDigest = await digest(otherId), otherState = await businessState(admitted.businessId);
      const { staff } = await elevatedStaff(id, roster, known, ["founder.recovery"]);
      const unchanged = await digest(id);
      const refused = await post(`/api/v1/business/${admitted.businessId}/recovery`, staff, recoveryFor(actor(roster, "buyer-b").user_id));
      expect(refused.status, "another reservation's Dealership must not be adopted").toBeGreaterThanOrEqual(400);
      expect(await businessState(admitted.businessId)).toEqual(otherState);
      expect(await digest(id)).toBe(unchanged);
      expect(await digest(otherId)).toBe(otherDigest);
      const before = await owned(id);
      expect(before.some(row => row.row_key["id"] === admitted.businessId)).toBe(false);
      expect(execute("reset", id).code).toBe(0);
      await assertDisposed(id, before);
      expect(await digest(otherId)).toBe(otherDigest);
      expect(await businessState(admitted.businessId)).toEqual(otherState);
      expect(execute("reset", otherId).code).toBe(0);
      await assertDisposed(otherId, otherBefore);
      expect(await db.dealership.findUnique({ where: { id: admitted.businessId } })).toBeNull();
    });
  }));

  it("refuses a stale candidate at the operator boundary without altering an admitted Dealership", () => withKnownJobs(known => {
    const id = "b0".repeat(16), stale = "b".repeat(40);
    return resetAfter([id], async () => {
      const roster = await seed(id);
      const { staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
      const admitted = (await post("/api/v1/business/admission", staff, admissionFor(id, actor(roster, "buyer-a").user_id)).expect(201)).body as { businessId: string };
      const unchanged = await digest(id), state = await businessState(admitted.businessId);
      // The runtime admission path has no candidate input; the supported binding is the operator fixture/reset command.
      expect(execute("reset", id, { candidate: stale })).toMatchObject({ code: 1, receipt: undefined });
      expect(execute("fixture", id, { candidate: stale })).toMatchObject({ code: 1, sqlCalls: 0, receipt: undefined });
      expect(await digest(id)).toBe(unchanged);
      expect(await businessState(admitted.businessId)).toEqual(state);
      const before = await owned(id);
      expect(execute("reset", id).code).toBe(0);
      await assertDisposed(id, before);
      expect(await db.dealership.findUnique({ where: { id: admitted.businessId } })).toBeNull();
    });
  }));

  it("atomically refuses reserved redemption that would delete a pre-existing inventory baseline, then succeeds without one", () => withKnownJobs(known => {
    const id = "b1".repeat(16), epoch = randomUUID(), baselineKey = `inventory_baseline:${epoch}`, unrelatedKey = `inventory_baseline:${randomUUID()}`;
    const baselineValue = "2026-10-01T00:00:00.000Z", created: string[] = [], unrelatedEmail = `unrelated.${randomUUID()}@example.invalid`;
    let unrelatedUserId: string | undefined;
    // Known-request lifetime, like known jobs: the racing redemption is settled before any cleanup, on every path.
    let racing: Promise<{ status: number } | { error: unknown }> | undefined;
    return resetAfter([id], async () => {
      // Global rows are created only when absent and removed in finally by exact key; a foreign collector stops the case.
      expect(await db.measurementState.findMany({ where: { key: { in: ["collector", baselineKey, unrelatedKey] } } })).toEqual([]);
      try {
        await db.measurementState.create({ data: { key: "collector", epoch } }); created.push("collector");
        await db.measurementState.create({ data: { key: unrelatedKey, epoch: baselineValue } }); created.push(unrelatedKey);
        await db.measurementState.create({ data: { key: baselineKey, epoch: baselineValue } }); created.push(baselineKey);
        const roster = await seed(id);
        const { staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
        const owner = await signIn(id, actor(roster, "buyer-a"), known);
        const admitted = (await post("/api/v1/business/admission", staff, admissionFor(id, owner.user.id)).expect(201)).body as { businessId: string; invitationId: string; token: string };
        const redeem = () => post("/api/v1/business/invitations/redeem", owner, { token: admitted.token });
        const measurement = () => db.measurementState.findMany({ orderBy: { key: "asc" } });
        const withBaseline = await measurement(), state = await businessState(admitted.businessId), unchanged = await digest(id);
        // Proposed contract: refused like other fixture storage refusals (500), with the whole transaction rolled back.
        const assertRefusedAtomically = async (status: number) => {
          expect(status, "reserved redemption must refuse rather than delete a shared baseline").toBe(500);
          expect(await businessState(admitted.businessId)).toEqual(state);
          expect(await digest(id)).toBe(unchanged);
          expect(await measurement()).toEqual(withBaseline);
        };
        await assertRefusedAtomically((await redeem()).status);

        // Race at the legitimate row-lock boundary: the baseline commits while redemption waits on the collector lock.
        await db.measurementState.delete({ where: { key: baselineKey } });
        await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "key" FROM "measurement_state" WHERE "key" = 'collector' FOR UPDATE`;
          await tx.measurementState.create({ data: { key: baselineKey, epoch: baselineValue } });
          // Rejection is observed at creation, so it cannot surface unhandled while this transaction waits.
          racing = redeem().then(response => ({ status: response.status }), (error: unknown) => ({ error }));
          for (let attempt = 0; ; attempt += 1) {
            const [waiting] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity
              WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%measurement_state%'`;
            if (waiting?.count === 1) break;
            if (attempt >= 100) throw new Error("Reserved redemption never waited on the collector row lock");
            await new Promise(done => setTimeout(done, 50));
          }
        }, { timeout: 15_000 });
        const raced = await racing!;
        if ("error" in raced) throw raced.error;
        await assertRefusedAtomically(raced.status);

        // With no baseline for the current epoch, ordinary redemption succeeds and leaves other global rows untouched.
        await db.measurementState.delete({ where: { key: baselineKey } }); created.pop();
        const withoutBaseline = await measurement();
        await redeem().expect(201);
        expect(await measurement()).toEqual(withoutBaseline);
        expect((await get("/api/v1/business/current", owner).expect(200)).body.workspace).toMatchObject({ business: { id: admitted.businessId, status: "active" }, membership: { role: "owner" } });

        // A non-reserved ordinary deletion of the same baseline stays normal while this namespace is live.
        await db.measurementState.create({ data: { key: baselineKey, epoch: baselineValue } }); created.push(baselineKey);
        const reserved = await digest(id);
        const issued = await request.post("/api/v1/auth/otp/request").send({ email: unrelatedEmail });
        learn(known, issued);
        expect(issued.status).toBe(201);
        const code = (await queue.getJob(issued.body.requestId as string))?.data.code as string;
        const unrelated = await request.post("/api/v1/auth/otp/verify").send({ email: unrelatedEmail, code }).expect(201);
        unrelatedUserId = unrelated.body.user.id as string;
        await request.delete("/api/v1/me").set("authorization", `Bearer ${unrelated.body.accessToken}`).expect(204);
        expect(await measurement()).toEqual(withoutBaseline);
        expect(await digest(id)).toBe(reserved);
        const before = await owned(id);
        expect(before.some(row => row.row_key["id"] === unrelatedUserId)).toBe(false);
        expect(execute("reset", id).code).toBe(0);
        await assertDisposed(id, before);
        expect(await measurement()).toEqual(withoutBaseline);
      } finally {
        // Never rejects; awaited after the row-lock transaction has unwound, so the original failure stays primary.
        await racing;
        await db.measurementState.deleteMany({ where: { key: { in: created } } });
        // Exact removal of the unrelated ordinary User this case created, and its own sign-in code.
        await db.otpRequest.deleteMany({ where: { destination: unrelatedEmail } });
        if (unrelatedUserId) await db.user.delete({ where: { id: unrelatedUserId } });
      }
    });
  }));

  // Time is the controlled boundary: only this process's Date moves back 12 h + 2 min for support's ordinary
  // sign-in and first elevation. PostgreSQL, Redis, timers and the worker child keep real time; no Session is seeded or edited directly.
  it("refuses an elevation that expired by the API clock, keeps it through refresh, and re-elevates the same and a fresh Session", () => withKnownJobs(known => {
    const id = "b2".repeat(16), shift = 12 * 60 * 60 * 1000 + 2 * 60 * 1000;
    return resetAfter([id], async () => {
      const roster = await seed(id);
      const staffId = actor(roster, "support").user_id;
      const coordinator = await signIn(id, actor(roster, "coordinator"), known);
      await elevate(coordinator);
      await grant(coordinator, staffId, "founder.recovery").expect(204);
      const recover = (login: Login) => post(`/api/v1/business/${randomUUID()}/recovery`, login, recoveryFor(actor(roster, "owner").user_id));
      const capabilities = async (login: Login) => (await get("/api/v1/staff/capabilities", login).expect(200)).body as { capabilities: string[]; elevated: boolean; adminTotpExpiresAt?: string };
      const verify = (login: Login, code: string) => post("/api/v1/auth/staff/totp/verify", login, { code });

      let staff: Login, secret: string, first: { adminTotpExpiresAt: string; backupCodes: string[] };
      try {
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - shift });
        staff = await signIn(id, actor(roster, "support"), known);
        secret = (await post("/api/v1/auth/staff/totp/enroll", staff, {}).expect(201)).body.secret as string;
        // The authenticator derives the code from the enrolled secret at the window's own time.
        first = (await verify(staff, generateSync({ secret, strategy: "totp", period: 30 })).expect(201)).body;
        expect(first.backupCodes).toHaveLength(10);
        expect(await capabilities(staff), "elevation is valid inside the window").toEqual({ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: first.adminTotpExpiresAt });
      } finally {
        vi.useRealTimers();
      }

      // At real time the server-issued deadline is an ordinary 12-hour deadline that has already passed.
      const deadline = Date.parse(first.adminTotpExpiresAt);
      expect(deadline).toBeLessThan(Date.now());
      expect(deadline).toBeGreaterThan(Date.now() - 10 * 60 * 1000);
      expect((await recover(staff).expect(403)).body.details).toEqual({ reason: "ELEVATION_REQUIRED" });
      const stale = { capabilities: ["founder.recovery"], elevated: false, adminTotpExpiresAt: first.adminTotpExpiresAt };
      expect(await capabilities(staff)).toEqual(stale);
      const refreshed = await request.post("/api/v1/auth/refresh").send({ refreshToken: staff.refreshToken }).expect(201);
      staff = { ...staff, accessToken: refreshed.body.accessToken, refreshToken: refreshed.body.refreshToken };
      expect(await capabilities(staff), "refresh neither extends nor restores elevation").toEqual(stale);
      expect((await recover(staff).expect(403)).body.details).toEqual({ reason: "ELEVATION_REQUIRED" });

      const same = (await verify(staff, generateSync({ secret, strategy: "totp", period: 30 })).expect(201)).body as { adminTotpExpiresAt: string };
      expect(Object.keys(same)).toEqual(["adminTotpExpiresAt"]);
      expect(Date.parse(same.adminTotpExpiresAt)).toBeGreaterThan(Date.now());
      expect(await capabilities(staff)).toEqual({ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: same.adminTotpExpiresAt });
      expect((await recover(staff).expect(409)).body.details).toEqual({ reason: "RECOVERY_REQUIRED" });

      await request.post("/api/v1/auth/logout").send({ refreshToken: staff.refreshToken }).expect(204);
      expect((await get("/api/v1/staff/capabilities", staff).expect(403)).body.details).toEqual({ reason: "SESSION_REQUIRED" });
      expect((await recover(staff).expect(403)).body.details).toEqual({ reason: "SESSION_REQUIRED" });
      await request.post("/api/v1/auth/refresh").send({ refreshToken: staff.refreshToken }).expect(401);
      // The window's request is 12 h old, so the ordinary 60 s resend backoff no longer applies.
      const fresh = await signIn(id, actor(roster, "support"), known);
      expect(fresh.requestId).not.toBe(staff.requestId);
      expect(await capabilities(fresh), "a fresh Session inherits no elevation").toEqual({ capabilities: ["founder.recovery"], elevated: false });
      expect((await recover(fresh).expect(403)).body.details).toEqual({ reason: "ELEVATION_REQUIRED" });
      const backupCode = first.backupCodes[0]!;
      const byBackup = (await verify(fresh, backupCode).expect(201)).body as { adminTotpExpiresAt: string };
      expect(Object.keys(byBackup)).toEqual(["adminTotpExpiresAt"]);
      expect(Date.parse(byBackup.adminTotpExpiresAt)).toBeGreaterThan(Date.now());
      expect((await verify(fresh, backupCode).expect(400)).body.code).toBe("INVALID_TOTP");
      expect(await capabilities(fresh)).toEqual({ capabilities: ["founder.recovery"], elevated: true, adminTotpExpiresAt: byBackup.adminTotpExpiresAt });
      expect((await recover(fresh).expect(409)).body.details).toEqual({ reason: "RECOVERY_REQUIRED" });

      const before = await owned(id);
      const perTable: Record<string, number> = {};
      for (const row of before) perTable[row.table_name] = (perTable[row.table_name] ?? 0) + 1;
      expect(perTable).toEqual({ users: 15, sessions: 2, otp_requests: 3, totp_enrollments: 2, totp_backup_codes: 20, staff_grants: 3, audit_logs: 3, dealerships: 1, dealership_members: 1 });
      expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`)).toEqual(
        [coordinator.requestId, staff.requestId, fresh.requestId].sort().map(request_id => ({ request_id })));
      expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
      await assertDisposed(id, before);
      const terminal = await digest(id);
      expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
      expect(await digest(id)).toBe(terminal);
      await assertDisposed(id, before);
      expect((await get("/api/v1/staff/capabilities", fresh).expect(403)).body.details).toEqual({ reason: "SESSION_REQUIRED" });
      await request.post("/api/v1/auth/refresh").send({ refreshToken: fresh.refreshToken }).expect(401);
      await request.post("/api/v1/auth/refresh").send({ refreshToken: coordinator.refreshToken }).expect(401);
    });
  }));

  // B1/B2 membership on the admitted business. Setup (admission, owner redemption, settings) must pass before any
  // membership assertion counts. On 794ac50a the expected reached failure is owner redemption: `admissionClosed`
  // first refuses the admitted Dealership's invitation UPDATE ('Unsupported campaign business'), before the member INSERT.
  // Invitation expiry (48 h) is not exercised; see the #901 business membership handoff.
  it("invites, replaces, revokes, redeems and suspends sales membership on the admitted business with exact audits and disposal", () => withKnownJobs(known => {
    const id = "b3".repeat(16), foreignUserId = randomUUID();
    return resetAfter([id], async () => {
      const roster = await seed(id);
      const { coordinator, staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
      const owner = await signIn(id, actor(roster, "buyer-a"), known);
      const salesA = await signIn(id, actor(roster, "sales-a"), known);
      const salesB = await signIn(id, actor(roster, "sales-b"), known);
      const rootBusiness = await db.dealership.findUniqueOrThrow({ where: { slug: `campaign897-${id}-${candidate.slice(0, 12)}` } });
      const rootState = await businessState(rootBusiness.id);
      // Foreign recipient fixture only: an ordinary User outside every reservation, never signed in or adopted.
      const foreignUser = await db.user.create({ data: { id: foreignUserId, email: `foreign.${foreignUserId}@example.invalid`, emailVerifiedAt: new Date(), displayName: "Foreign recipient must survive" } });
      try {
        const admitted = (await post("/api/v1/business/admission", staff, admissionFor(id, owner.user.id)).expect(201)).body as { businessId: string; invitationId: string; token: string };
        const businessId = admitted.businessId;
        await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201);
        await post(`/api/v1/business/${businessId}/settings`, owner, { name: "Synthetic membership business" }).expect(201);
        const ownerMember = await db.dealershipMember.findUniqueOrThrow({ where: { userId: owner.user.id } });
        expect(ownerMember).toMatchObject({ dealershipId: businessId, role: "owner", status: "active" });

        const invite = async (recipient: string) => {
          const body = (await post(`/api/v1/business/${businessId}/invitations`, owner, { recipientUserId: recipient }).expect(201)).body as { businessId: string; invitationId: string; token: string; expiresAt: string };
          expect(body).toMatchObject({ businessId });
          expect(body.token).toMatch(/^[a-f0-9]{64}$/);
          expect(await db.dealershipInvitation.findUniqueOrThrow({ where: { id: body.invitationId } })).toMatchObject({ dealershipId: businessId, recipientUserId: recipient, role: "sales", redeemedAt: null, revokedAt: null, expiresAt: new Date(body.expiresAt) });
          expect(await owned(id)).toContainEqual({ table_name: "dealership_invitations", row_key: { id: body.invitationId } });
          return body;
        };
        const redeem = (login: Login, token: string) => post("/api/v1/business/invitations/redeem", login, { token });
        const reason = (response: { body: { details?: unknown } }) => response.body.details;
        let unchanged: string | undefined;
        const refusedWithoutWrites = async (label: string, attempt: () => Promise<unknown>) => {
          unchanged = await digest(id);
          const state = await businessState(businessId);
          await attempt();
          expect(await digest(id), `${label} writes nothing`).toBe(unchanged);
          expect(await businessState(businessId), `${label} leaves the business unchanged`).toEqual(state);
        };
        const salesAId = actor(roster, "sales-a").user_id, salesBId = actor(roster, "sales-b").user_id;

        // Invite, wrong-account redemption and duplicate replacement.
        const first = await invite(salesAId);
        await refusedWithoutWrites("wrong-account redemption", async () => expect(reason(await redeem(salesB, first.token).expect(409))).toEqual({ reason: "INVITATION_INVALID" }));
        const second = await invite(salesAId);
        expect((await db.dealershipInvitation.findUniqueOrThrow({ where: { id: first.invitationId } })).revokedAt).not.toBeNull();
        await refusedWithoutWrites("replaced-token redemption", async () => expect(reason(await redeem(salesA, first.token).expect(409))).toEqual({ reason: "INVITATION_INVALID" }));

        // Revoke, revoked-token refusal and a no-op repeated revoke without an audit.
        const third = await invite(salesBId);
        expect((await post(`/api/v1/business/${businessId}/invitations/revoke`, owner, { invitationId: third.invitationId }).expect(201)).body).toEqual({ ok: true });
        await refusedWithoutWrites("revoked-token redemption", async () => expect(reason(await redeem(salesB, third.token).expect(409))).toEqual({ reason: "INVITATION_INVALID" }));
        await refusedWithoutWrites("repeated revoke", async () => expect((await post(`/api/v1/business/${businessId}/invitations/revoke`, owner, { invitationId: third.invitationId }).expect(201)).body).toEqual({ ok: true }));

        // Sales redemption has no shared inventory-baseline path; global measurement rows are only observed.
        const measurement = await db.measurementState.findMany({ orderBy: { key: "asc" } });
        expect((await redeem(salesA, second.token).expect(201)).body).toEqual({ businessId });
        expect(await db.measurementState.findMany({ orderBy: { key: "asc" } })).toEqual(measurement);
        const salesMember = await db.dealershipMember.findUniqueOrThrow({ where: { userId: salesAId } });
        expect(salesMember).toMatchObject({ dealershipId: businessId, role: "sales", status: "active" });
        expect((await get("/api/v1/business/current", salesA).expect(200)).body.workspace).toMatchObject({ business: { id: businessId, status: "active" }, membership: { role: "sales", status: "active" }, members: [], invitations: [] });
        await refusedWithoutWrites("repeated redemption", async () => expect(reason(await redeem(salesA, second.token).expect(409))).toEqual({ reason: "INVITATION_INVALID" }));
        await refusedWithoutWrites("sales owner actions", async () => {
          expect(reason(await post(`/api/v1/business/${businessId}/invitations`, salesA, { recipientUserId: salesBId }).expect(403))).toEqual({ reason: "OWNER_REQUIRED" });
          expect(reason(await post(`/api/v1/business/${businessId}/invitations/revoke`, salesA, { invitationId: third.invitationId }).expect(403))).toEqual({ reason: "OWNER_REQUIRED" });
          expect(reason(await post(`/api/v1/business/${businessId}/settings`, salesA, { name: "Sales edit refused" }).expect(403))).toEqual({ reason: "OWNER_REQUIRED" });
          expect(reason(await post(`/api/v1/business/${businessId}/members`, salesA, { targetUserId: owner.user.id, action: "suspend" }).expect(403))).toEqual({ reason: "OWNER_REQUIRED" });
        });

        // Suspend and restore; the sole owner and a non-member are refused.
        expect((await post(`/api/v1/business/${businessId}/members`, owner, { targetUserId: salesAId, action: "suspend" }).expect(201)).body).toEqual({ ok: true });
        expect(reason(await get("/api/v1/business/current", salesA).expect(403))).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
        expect((await post(`/api/v1/business/${businessId}/members`, owner, { targetUserId: salesAId, action: "restore" }).expect(201)).body).toEqual({ ok: true });
        expect((await get("/api/v1/business/current", salesA).expect(200)).body.workspace).toMatchObject({ membership: { role: "sales", status: "active" } });
        await refusedWithoutWrites("sole-owner removal and non-member change", async () => {
          expect(reason(await post(`/api/v1/business/${businessId}/members`, owner, { targetUserId: owner.user.id, action: "remove" }).expect(409))).toEqual({ reason: "SOLE_OWNER" });
          expect(reason(await post(`/api/v1/business/${businessId}/members`, owner, { targetUserId: salesBId, action: "suspend" }).expect(403))).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
        });

        // An owned invitation naming a foreign recipient is a foreign roster reference: whole-transaction refusal.
        await refusedWithoutWrites("foreign-recipient invitation", async () => {
          expect((await post(`/api/v1/business/${businessId}/invitations`, owner, { recipientUserId: foreignUserId })).status, "fixture refusal").toBe(500);
        });
        expect(await db.dealershipInvitation.count({ where: { recipientUserId: foreignUserId } })).toBe(0);
        expect(await db.user.findUnique({ where: { id: foreignUserId } })).toEqual(foreignUser);

        // Exact per-operation audits, none carrying a raw invitation token.
        const audits = await db.auditLog.findMany({ where: { targetType: "Dealership", targetId: businessId }, orderBy: { createdAt: "asc" }, select: { id: true, actorId: true, action: true, details: true } });
        expect(audits.map(({ actorId, action, details }) => ({ actorId, action, details }))).toEqual([
          { actorId: staff.user.id, action: "BUSINESS_ADMITTED", details: { mode: "synthetic", evidence: "Fictional reservation-owned business only", reason: "Disposable full-v3 ordinary HTTP proof", verifiedScope: "Synthetic fixture; no real business verified" } },
          { actorId: owner.user.id, action: "BUSINESS_INVITATION_REDEEMED", details: { invitationId: admitted.invitationId, role: "owner" } },
          { actorId: owner.user.id, action: "BUSINESS_SETTINGS_CHANGED", details: { fields: ["name"] } },
          { actorId: owner.user.id, action: "BUSINESS_INVITATION_CREATED", details: { invitationId: first.invitationId, role: "sales" } },
          { actorId: owner.user.id, action: "BUSINESS_INVITATION_CREATED", details: { invitationId: second.invitationId, role: "sales" } },
          { actorId: owner.user.id, action: "BUSINESS_INVITATION_CREATED", details: { invitationId: third.invitationId, role: "sales" } },
          { actorId: owner.user.id, action: "BUSINESS_INVITATION_REVOKED", details: { invitationId: third.invitationId } },
          { actorId: salesAId, action: "BUSINESS_INVITATION_REDEEMED", details: { invitationId: second.invitationId, role: "sales" } },
          { actorId: owner.user.id, action: "BUSINESS_MEMBERSHIP_CHANGED", details: { targetUserId: salesAId, action: "suspend" } },
          { actorId: owner.user.id, action: "BUSINESS_MEMBERSHIP_CHANGED", details: { targetUserId: salesAId, action: "restore" } },
        ]);
        for (const token of [admitted.token, first.token, second.token, third.token]) expect(JSON.stringify(audits).includes(token)).toBe(false);

        // Changed candidate at the operator boundary (the runtime path has no candidate input) changes nothing.
        await refusedWithoutWrites("changed-candidate reset", async () => expect(execute("reset", id, { candidate: "b".repeat(40) })).toMatchObject({ code: 1, receipt: undefined }));

        // The bootstrap owner and root Dealership are untouched by the admitted business's membership.
        expect(await businessState(rootBusiness.id)).toEqual(rootState);

        // Exact ownership: nothing was deleted, so every record ever written is live.
        const before = await owned(id);
        const perTable: Record<string, number> = {};
        for (const row of before) perTable[row.table_name] = (perTable[row.table_name] ?? 0) + 1;
        expect(perTable).toEqual({ users: 15, sessions: 5, otp_requests: 5, totp_enrollments: 2, totp_backup_codes: 20, staff_grants: 3, audit_logs: 13, dealerships: 2, dealership_members: 3, dealership_invitations: 4 });
        expect((await rows<{ count: number }>(`SELECT count(*)::int AS count FROM "cf_${id}".campaign_records`))[0]?.count).toBe(72);
        for (const row of [{ table_name: "dealerships", row_key: { id: businessId } }, { table_name: "dealership_members", row_key: { id: ownerMember.id } }, { table_name: "dealership_members", row_key: { id: salesMember.id } },
          ...[admitted, first, second, third].map(i => ({ table_name: "dealership_invitations", row_key: { id: i.invitationId } })), ...audits.map(a => ({ table_name: "audit_logs", row_key: { id: a.id } }))]) expect(before, `owned ${row.table_name}`).toContainEqual(row);
        expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`)).toEqual(
          [coordinator.requestId, staff.requestId, owner.requestId, salesA.requestId, salesB.requestId].sort().map(request_id => ({ request_id })));

        // Exact disposal with a lost receipt, redacted audit retention and an identical retry.
        expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
        await assertDisposed(id, before);
        expect(await businessState(businessId)).toEqual({ business: null, invitations: [], members: [], audits: [] });
        expect(await db.auditLog.findMany({ where: { id: { in: audits.map(a => a.id) } }, select: { actorId: true, targetType: true, targetId: true, details: true } })).toEqual(
          audits.map(() => ({ actorId: null, targetType: "SyntheticCampaign", targetId: id, details: { profile, disposition: "redacted-synthetic-audit" } })));
        const terminal = await digest(id);
        expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
        expect(await digest(id)).toBe(terminal);
        await assertDisposed(id, before);
        expect(reason(await get("/api/v1/business/current", salesA).expect(403))).toEqual({ reason: "SESSION_REQUIRED" });
        await request.post("/api/v1/auth/refresh").send({ refreshToken: owner.refreshToken }).expect(401);
        expect(await db.user.findUnique({ where: { id: foreignUserId } })).toEqual(foreignUser);
      } finally {
        await db.user.deleteMany({ where: { id: foreignUserId } });
      }
    });
  }));

  // A foreign active business (legitimate setup outside every reservation) inviting a roster User must refuse
  // atomically. Reachable on 794ac50a: no admission or redemption precedes it.
  it("refuses a foreign business invitation naming a roster User and preserves the foreign business exactly", () => withKnownJobs(known => {
    const id = "b4".repeat(16), foreignBusinessId = randomUUID(), foreignEmail = `foreign-owner.${randomUUID()}@example.invalid`;
    let foreignOwnerId: string | undefined;
    return resetAfter([id], async () => {
      const roster = await seed(id);
      try {
        // Ordinary sign-in of a non-reserved User; its code is read from its own ordinary job, as in the baseline case.
        const issued = await request.post("/api/v1/auth/otp/request").send({ email: foreignEmail });
        learn(known, issued);
        expect(issued.status).toBe(201);
        const code = (await queue.getJob(issued.body.requestId as string))?.data.code as string;
        const signedIn = await request.post("/api/v1/auth/otp/verify").send({ email: foreignEmail, code }).expect(201);
        foreignOwnerId = signedIn.body.user.id as string;
        await db.dealership.create({ data: { id: foreignBusinessId, slug: `foreign-membership-${foreignBusinessId}`, name: "Foreign membership business must survive", status: "active" } });
        await db.dealershipMember.create({ data: { dealershipId: foreignBusinessId, userId: foreignOwnerId, role: "owner", status: "active" } });
        const foreign = await businessState(foreignBusinessId), unchanged = await digest(id);
        const salesB = actor(roster, "sales-b").user_id;
        const refused = await request.post(`/api/v1/business/${foreignBusinessId}/invitations`).set("authorization", `Bearer ${signedIn.body.accessToken}`).send({ recipientUserId: salesB });
        expect(refused.status, "foreign invitation of a roster User is a fixture refusal").toBe(500);
        expect(await businessState(foreignBusinessId)).toEqual(foreign);
        expect(await db.dealershipInvitation.count({ where: { recipientUserId: salesB } })).toBe(0);
        expect(await digest(id)).toBe(unchanged);
        const before = await owned(id);
        expect(before.some(row => [foreignBusinessId, foreignOwnerId].includes(row.row_key["id"]!))).toBe(false);
        expect(execute("reset", id).code).toBe(0);
        await assertDisposed(id, before);
        expect(await businessState(foreignBusinessId)).toEqual(foreign);
      } finally {
        // Exact removal of only the foreign rows this case created.
        await db.dealershipMember.deleteMany({ where: { dealershipId: foreignBusinessId } });
        await db.dealership.deleteMany({ where: { id: foreignBusinessId } });
        await db.otpRequest.deleteMany({ where: { destination: foreignEmail } });
        if (foreignOwnerId) await db.user.delete({ where: { id: foreignOwnerId } });
      }
    });
  }));
  // This is the checked-in operator command, in its own Node/tsx process and transaction.
  // One Node process avoids an unowned tsx CLI descendant. execFile's callback settles
  // after exit, including its bounded SIGKILL timeout; no child survives an assertion.
  async function promote(person: Actor, options: { runtimeCandidate?: string; dryRun?: boolean; loseResponse?: boolean } = {}) {
    const run = promisify(execFile);
    const args = ["--import", "tsx", "scripts/promote-admin.ts", "--email", person.email,
      "--reason", "  Reservation-owned coordinator moderation proof  "];
    if (options.dryRun) args.push("--dry-run");
    try {
      const result = await run(process.execPath, args, { cwd: packageRoot, timeout: 30000, killSignal: "SIGKILL",
        env: { ...process.env, AUTOTM_COMMIT_SHA: options.runtimeCandidate ?? candidate } });
      return { code: 0, output: options.loseResponse ? undefined : `${result.stdout}${result.stderr}` };
    } catch (error) {
      const failed = error as { code?: unknown; stdout?: string; stderr?: string };
      // Spawn/timeout signal errors throw. Each refusal case first proves command
      // loading and database lookup with a successful write-free dry-run.
      if (typeof failed.code !== "number") throw error;
      return { code: failed.code, output: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  }
  async function promotionState(roster: Actor[]) {
    const ids = roster.map(person => person.user_id);
    return {
      users: await db.user.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }),
      grants: await db.staffGrant.findMany({ where: { userId: { in: ids } }, orderBy: [{ userId: "asc" }, { capability: "asc" }] }),
      sessions: await db.session.findMany({ where: { userId: { in: ids } }, orderBy: { id: "asc" } }),
      enrollments: await db.totpEnrollment.findMany({ where: { userId: { in: ids } }, orderBy: { id: "asc" } }),
      codes: await db.totpBackupCode.findMany({ where: { totpEnrollment: { userId: { in: ids } } }, orderBy: { id: "asc" } }),
      otps: await db.otpRequest.findMany({ where: { destination: { in: roster.map(person => person.email) } }, orderBy: { id: "asc" } }),
      audits: await db.auditLog.findMany({ where: { targetId: { in: ids } }, orderBy: { id: "asc" } }),
    };
  }
  async function promotionAccounting(id: string, requestIds: string[], promoted: boolean, elevated: boolean, disposed = false) {
    const expected = { users: 15, dealerships: 1, dealership_members: 1, staff_grants: 2,
      audit_logs: promoted ? 3 : 2,
      ...(requestIds.length ? { otp_requests: requestIds.length, sessions: requestIds.length } : {}),
      ...(elevated ? { totp_enrollments: 1, totp_backup_codes: 10 } : {}) };
    expect(await rows(`SELECT table_name,count(*)::int AS count FROM "cf_${id}".campaign_records GROUP BY table_name ORDER BY table_name`)).toEqual(
      Object.entries(expected).sort(([a], [b]) => a.localeCompare(b)).map(([table_name, count]) => ({ table_name, count })));
    const [budget] = await rows<{ records: number; events: number }>(`SELECT
      (SELECT count(*)::int FROM "cf_${id}".campaign_records) AS records,
      (SELECT count(*)::int FROM "cf_${id}".campaign_events) AS events`);
    expect(budget?.records).toBe(21 + requestIds.length * 2 + (promoted ? 1 : 0) + (elevated ? 11 : 0));
    expect(budget!.records).toBeLessThanOrEqual(128);
    // Source-derived exact write count: OTP INSERT + two UPDATEs + Session INSERT;
    // first TOTP adds enrollment INSERT/UPDATE, ten code INSERTs and Session UPDATE.
    expect(budget?.events).toBe(21 + requestIds.length * 4 + (promoted ? 2 : 0) + (elevated ? 13 : 0) +
      (disposed ? 21 + requestIds.length * 2 + (promoted ? 1 : 0) + (elevated ? 11 : 0) : 0));
    expect(budget!.events).toBeLessThan(2048);
    expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`)).toEqual(
      [...requestIds].sort().map(request_id => ({ request_id })));
    expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_sink ORDER BY request_id`)).toEqual(
      (disposed ? [] : [...requestIds].sort().map(request_id => ({ request_id }))));
  }

  it("keeps an ordinarily signed-in and elevated buyer coordinator outside the marketplace admin role", () => withKnownJobs(known => {
    const id = "c5".repeat(16);
    return resetAfter([id], async () => {
      const roster = await seed(id), coordinator = await signIn(id, actor(roster, "coordinator"), known);
      expect(coordinator.user.role).toBe("buyer");
      const denied = async () => expect((await get("/api/v1/admin/authority", coordinator).expect(403)).body).toMatchObject({ code: "FORBIDDEN", message: "Admin role required" });
      let unchanged = await digest(id);
      await denied();
      expect(await digest(id)).toBe(unchanged);
      await elevate(coordinator);
      unchanged = await digest(id);
      await denied();
      expect(await digest(id)).toBe(unchanged);
      expect(await db.auditLog.count({ where: { targetId: coordinator.user.id, action: "ADMIN_BOOTSTRAP_PROMOTE" } })).toBe(0);
      await promotionAccounting(id, [coordinator.requestId], false, true);
      const before = await owned(id);
      expect(execute("reset", id).code).toBe(0);
      await assertDisposed(id, before);
      await promotionAccounting(id, [coordinator.requestId], false, true, true);
    });
  }));

  it("promotes only the coordinator through the real command, requires ordinary TOTP, and redacts the exact audit on retryable reset", () => withKnownJobs(known => {
    const id = "b6".repeat(16);
    return resetAfter([id], async () => {
      const roster = await seed(id), person = actor(roster, "coordinator");
      const coordinator = await signIn(id, person, known);
      const initial = await promotionState(roster), unchanged = await digest(id);
      expect(initial.users.every(user => user.role === "buyer")).toBe(true);
      expect(await promote(person, { dryRun: true })).toMatchObject({ code: 0 });
      expect(await promotionState(roster)).toEqual(initial);
      expect(await digest(id)).toBe(unchanged);
      // First intended new RED: current track_business refuses users.role='admin'
      // with "Synthetic identity changed", before the command's audit INSERT.
      // A fixture, OTP or import failure above is setup failure, not this RED.
      expect(await promote(person, { loseResponse: true }), "actual coordinator command must commit despite lost response").toEqual({ code: 0, output: undefined });
      const promoted = await promotionState(roster);
      expect(promoted.users).toEqual(initial.users.map(user => user.id === person.user_id ? { ...user, role: "admin", updatedAt: expect.any(Date) } : user));
      for (const key of ["grants", "sessions", "enrollments", "codes", "otps"] as const) expect(promoted[key], key).toEqual(initial[key]);
      const audits = promoted.audits.filter(audit => audit.action === "ADMIN_BOOTSTRAP_PROMOTE");
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: null, targetType: "user", targetId: person.user_id,
        details: { reason: "Reservation-owned coordinator moderation proof", before: { role: "buyer" }, after: { role: "admin" } } });
      expect(audits[0]!.details).toEqual({ reason: "Reservation-owned coordinator moderation proof", before: { role: "buyer" }, after: { role: "admin" } });
      expect(promoted.audits.filter(audit => audit.action !== "ADMIN_BOOTSTRAP_PROMOTE")).toEqual(initial.audits);
      const committed = await digest(id);
      const retry = await promote(person);
      expect(retry).toMatchObject({ code: 0 });
      expect(retry.output).toContain(person.user_id);
      expect(retry.output).not.toContain(person.email);
      expect(await promotionState(roster)).toEqual(promoted);
      expect(await digest(id)).toBe(committed);
      // The existing JWT still says buyer. AdminGuard checks the current database role,
      // then finds the live Session with no elevation deadline: elevation-expired.
      expect((await get("/api/v1/admin/authority", coordinator).expect(403)).body).toMatchObject({ code: "FORBIDDEN", message: "Admin TOTP elevation expired" });
      expect(await digest(id)).toBe(committed);
      await elevate(coordinator);
      const elevated = await digest(id);
      expect((await get("/api/v1/admin/authority", coordinator).expect(200)).body).toEqual({ marketplaceAdmin: true });
      expect((await post("/api/v1/business/admission", coordinator, admissionFor(id, actor(roster, "buyer-a").user_id)).expect(403)).body.details).toEqual({ reason: "CAPABILITY_REQUIRED" });
      expect(await digest(id)).toBe(elevated);
      await promotionAccounting(id, [coordinator.requestId], true, true);
      const before = await owned(id);
      expect(before).toContainEqual({ table_name: "audit_logs", row_key: { id: audits[0]!.id } });
      expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
      await assertDisposed(id, before);
      expect(await db.auditLog.findUnique({ where: { id: audits[0]!.id }, select: { actorId: true, targetType: true, targetId: true, details: true } })).toEqual({
        actorId: null, targetType: "SyntheticCampaign", targetId: id, details: { profile, disposition: "redacted-synthetic-audit" } });
      const terminal = await digest(id);
      expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { state: "disposed", candidate, profile, fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
      expect(await digest(id)).toBe(terminal);
      expect(await promote(person)).toEqual({ code: 1, output: "No user found for the selected contact\n" });
      expect(await digest(id)).toBe(terminal);
      await assertDisposed(id, before);
      await promotionAccounting(id, [coordinator.requestId], true, true, true);
      await request.post("/api/v1/auth/refresh").send({ refreshToken: coordinator.refreshToken }).expect(401);
    });
  }));

  it("refuses real command promotion for every other alias and for a stale runtime candidate without writes", async () => {
    const id = "b7".repeat(16), foreignId = "b8".repeat(16);
    await resetAfter([id, foreignId], async () => {
      const roster = await seed(id), foreignRoster = await seed(foreignId);
      const initial = await promotionState(roster), foreign = await promotionState(foreignRoster);
      const unchanged = await digest(id), foreignDigest = await digest(foreignId);
      expect(await promote(actor(roster, "coordinator"), { dryRun: true })).toMatchObject({ code: 0 });
      for (const person of roster.filter(person => person.alias !== "coordinator")) {
        const refused = await promote(person);
        expect(refused, `other alias ${person.alias}`).toMatchObject({ code: 1 });
        expect(await promotionState(roster)).toEqual(initial);
        expect(await digest(id)).toBe(unchanged);
      }
      expect(await promote(actor(roster, "coordinator"), { runtimeCandidate: "b".repeat(40) })).toMatchObject({ code: 1 });
      expect(await promotionState(roster)).toEqual(initial);
      expect(await digest(id)).toBe(unchanged);
      expect(await promotionState(foreignRoster)).toEqual(foreign);
      expect(await digest(foreignId)).toBe(foreignDigest);
      await promotionAccounting(id, [], false, false);
      await promotionAccounting(foreignId, [], false, false);
    });
  });

  it("refuses the real coordinator command during cleaning and after disposal without recreating identities", async () => {
    const id = "b9".repeat(16);
    await resetAfter([id], async () => {
      const roster = await seed(id), person = actor(roster, "coordinator");
      expect(await promote(person, { dryRun: true })).toMatchObject({ code: 0 });
      // Fixture lifecycle fault injection only. No auth, role, receipt or journal is seeded.
      await db.$executeRawUnsafe(`UPDATE "cf_${id}".campaign_manifest SET state='cleaning'`);
      const initial = await promotionState(roster), unchanged = await digest(id);
      expect(await promote(person)).toMatchObject({ code: 1 });
      expect(await promotionState(roster)).toEqual(initial);
      expect(await digest(id)).toBe(unchanged);
      await promotionAccounting(id, [], false, false);
      const before = await owned(id);
      expect(execute("reset", id).code).toBe(0);
      await assertDisposed(id, before);
      const terminal = await digest(id);
      expect(await promote(person)).toEqual({ code: 1, output: "No user found for the selected contact\n" });
      expect(await digest(id)).toBe(terminal);
      await assertDisposed(id, before);
      await promotionAccounting(id, [], false, false, true);
    });
  });


  it("confirms only the admitted Owner's generated contact code and disposes its exact protected SMS evidence", () => withKnownJobs(known => {
    const id = "e1".repeat(16), foreignId = randomUUID(), reuseId = randomUUID();
    const phone = "+99367752052";
    // Literal design vector, independently checked against the selected derivation.
    expect(`+9936${(BigInt(`0x${createHash("sha256").update(`campaign897-contact-phone-v1:${id}:${candidate}`, "ascii").digest("hex")}`) % 10000000n).toString().padStart(7, "0")}`).toBe(phone);
    const smsIds = new Set<string>();
    return resetAfter([id], async () => {
      const roster = await seed(id);
      await db.dealership.create({ data: { id: foreignId, slug: `contact-control-${foreignId}`, name: "Foreign contact control" } });
      try {
        const foreign = await businessState(foreignId);
        const { staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
        const owner = await signIn(id, actor(roster, "buyer-a"), known);
        const admitted = (await post("/api/v1/business/admission", staff, admissionFor(id, owner.user.id)).expect(201)).body as { businessId: string; token: string };
        await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201);
        expect((await get("/api/v1/business/current", owner).expect(200)).body.workspace).toMatchObject({
          business: { id: admitted.businessId, status: "active" }, membership: { role: "owner" },
        });
        const contact = (action: "request" | "verify", login: Login, body: object, businessId = admitted.businessId) =>
          post(`/api/v1/me/contact-phones/${action}`, login, body).set("x-business-id", businessId);
        const measurement = () => db.measurementState.findMany({ orderBy: { key: "asc" } });
        const unchanged = async () => ({
          users: await db.user.findMany({ where: { id: { in: roster.map(person => person.user_id) } }, orderBy: { id: "asc" } }),
          sessions: await db.session.findMany({ where: { userId: { in: roster.map(person => person.user_id) } }, orderBy: { id: "asc" } }),
          proofs: await db.verifiedContactPhone.findMany({ orderBy: { id: "asc" } }),
          audits: await db.auditLog.findMany({ orderBy: { id: "asc" } }), global: await measurement(),
        });
        const initial = await unchanged(), business = await businessState(admitted.businessId);
        const before = await owned(id), journal = await digest(id);
        const [eventsBefore] = await rows<{ count: number }>(`SELECT count(*)::int AS count FROM "cf_${id}".campaign_events`);
        // On d397c8b7 this real route reaches track_business's Unsupported campaign OTP.
        // A 404, failed admission/redemption or an auth failure is setup failure, never that behavioral RED.
        const issued = await contact("request", owner, { phone });
        if (typeof issued.body.requestId === "string") smsIds.add(issued.body.requestId);
        if (issued.status >= 400) {
          expect(await digest(id)).toBe(journal);
          expect(await unchanged()).toEqual(initial);
          expect(await db.otpRequest.count({ where: { destination: phone } })).toBe(0);
        }
        expect(issued.status, "ordinary contact request must pass Unsupported campaign OTP barrier").toBe(200);
        expect(issued.body).toMatchObject({ status: "code_sent", requestId: expect.any(String), resendInSeconds: expect.any(Number) });
        expect(issued.body.testCode).toBeUndefined();
        const requestId = issued.body.requestId as string;
        expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(issued.body.resendInSeconds).toBeGreaterThan(0);
        const smsLedger = () => rows<{ value: Record<string, unknown> }>(`SELECT to_jsonb(l) AS value FROM "cf_${id}".campaign_sms_ledger l WHERE request_id=$1`, requestId);
        const binding = () => rows<{ value: Record<string, unknown> }>(`SELECT to_jsonb(b) AS value FROM "cf_${id}".campaign_sms_binding b`);
        const sink = () => rows<{ message: string }>(`SELECT message FROM "cf_${id}".campaign_sms_sink WHERE request_id=$1`, requestId);
        const retainedBinding = await binding(), retainedLedger = await smsLedger();
        expect(retainedBinding).toHaveLength(1);
        expect(retainedBinding[0]?.value).toMatchObject({ reservation_id: id, candidate, destination: phone });
        expect(retainedLedger).toHaveLength(1);
        for (const entry of [...retainedBinding, ...retainedLedger]) {
          expect(entry.value).not.toHaveProperty("message");
          expect(entry.value).not.toHaveProperty("code");
        }
        const pending = await db.otpRequest.findUniqueOrThrow({ where: { id: requestId } });
        expect(pending).toMatchObject({ purpose: "listing_contact_phone", channel: "phone", destination: phone, phone, userId: owner.user.id, businessId: admitted.businessId, verifiedAt: null, attempts: 0 });
        expect(retainedLedger[0]?.value).toMatchObject({ request_id: requestId, destination: phone, code_hash: pending.codeHash, issue_row_hash: expect.stringMatching(/^[0-9a-f]+$/) });
        const delivered = await sink();
        expect(delivered).toHaveLength(1);
        // The sole code read is the exact namespace/full-request protected SMS sink.
        const code = delivered[0]?.message.match(/\b\d{6}\b/)?.[0];
        expect(code).toBeDefined();
        expect(createHash("sha256").update(code!).digest("hex")).toBe(pending.codeHash);
        expect(await queue.getJob(requestId)).toBeUndefined();
        expect(await unchanged()).toEqual(initial);
        expect(await businessState(admitted.businessId)).toEqual(business);
        const sent = await digest(id);
        expect(sent).not.toBe(journal);
        await contact("request", staff, { phone }).expect(403);
        await contact("verify", owner, { phone, code }, foreignId).expect(403);
        expect(await digest(id)).toBe(sent);
        const wrong = `${code![0] === "0" ? "1" : "0"}${code!.slice(1)}`;
        expect((await contact("verify", owner, { phone, code: wrong }).expect(400)).body).toMatchObject({ code: "INVALID_OTP", details: { attemptsLeft: 4 } });
        expect(await db.otpRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ attempts: 1, verifiedAt: null });
        const verified = await contact("verify", owner, { phone, code }).expect(200);
        expect(verified.body.contactPhone).toMatchObject({ phone, source: "confirmed" });
        const { confirmedAt, reusableUntil } = verified.body.contactPhone as { confirmedAt: string; reusableUntil: string };
        expect(Date.parse(reusableUntil) - Date.parse(confirmedAt)).toBe(7 * 24 * 60 * 60 * 1000);
        expect(await db.otpRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ attempts: 1, verifiedAt: expect.any(Date) });
        const confirmed = await businessState(admitted.businessId);
        expect(confirmed).toEqual({ ...business, business: { ...business.business, contactPhone: phone, contactConfirmedAt: new Date(confirmedAt), updatedAt: expect.any(Date) } });
        const confirmedDigest = await digest(id);
        // Foreign scalar use must refuse without adoption or a change to the control.
        await expect(db.dealership.update({ where: { id: foreignId }, data: { contactPhone: phone } })).rejects.toThrow();
        expect(await businessState(foreignId)).toEqual(foreign);
        expect((await contact("verify", owner, { phone, code }).expect(400)).body.code).toBe("OTP_ALREADY_USED");
        expect((await contact("request", owner, { phone }).expect(200)).body).toEqual({ status: "confirmed", contactPhone: verified.body.contactPhone });
        expect(await digest(id)).toBe(confirmedDigest);
        expect(await smsLedger()).toEqual(retainedLedger);
        expect(await sink()).toEqual(delivered);
        expect(await unchanged()).toEqual(initial);
        expect((await owned(id)).length).toBe(before.length + 1);
        const [eventsAfter] = await rows<{ count: number }>(`SELECT count(*)::int AS count FROM "cf_${id}".campaign_events`);
        expect(eventsAfter?.count).toBe(eventsBefore!.count + 4); // INSERT, wrong attempt, consume, Dealership UPDATE.
        const disposable = await owned(id);
        expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
        await assertDisposed(id, disposable);
        expect(await sink()).toEqual([]);
        expect(await smsLedger()).toEqual(retainedLedger);
        expect(await binding()).toEqual(retainedBinding);
        expect(await db.otpRequest.findUnique({ where: { id: requestId } })).toBeNull();
        expect(await measurement()).toEqual(initial.global);
        expect(await businessState(foreignId)).toEqual(foreign);
        const terminal = await digest(id);
        // Fresh unrelated graph IDs may reuse the phone after disposal. No auth or proof is seeded.
        const reused = await db.dealership.create({ data: { id: reuseId, slug: `terminal-reuse-${reuseId}`, name: "Unrelated later phone reuse", contactPhone: phone } });
        expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { state: "disposed", queueJobs: 0, sinkRecords: 0 } });
        expect(await digest(id)).toBe(terminal);
        expect(await db.dealership.findUnique({ where: { id: reuseId } })).toEqual(reused);
        expect(await smsLedger()).toEqual(retainedLedger);
        expect(await binding()).toEqual(retainedBinding);
        expect(await sink()).toEqual([]);
        expect(await businessState(foreignId)).toEqual(foreign);
      } finally {
        // Recover exact authority even if the HTTP response was lost after reserve committed.
        const [contract] = await rows<{ present: boolean }>(`SELECT to_regclass('"cf_${id}".campaign_sms_ledger') IS NOT NULL AS present`);
        if (contract?.present) {
          for (const entry of await rows<{ request_id: string }>(`SELECT request_id FROM "cf_${id}".campaign_sms_ledger`)) smsIds.add(entry.request_id);
        }
        for (const requestId of smsIds) expect.soft(await queue.getJob(requestId), "synchronous SMS has no email job").toBeUndefined();
        await db.dealership.deleteMany({ where: { id: reuseId } });
        await db.dealership.delete({ where: { id: foreignId } });
      }
    });
  }));

  // Literal pre-edit budget and reset arithmetic live in full-v3-support-text-test-handoff-20261020.md.
  // No runtime gate override: the first open requires campaign-aware synthetic admission from source.
  const serviceTables = ["support_cases", "service_conversations", "service_messages", "service_outbox", "service_read_states", "service_audits"];
  async function supportJournal(id: string, expectedRecords: number, expectedEvents: number) {
    const records = await rows<RecordKey & { row_hash: string; version: bigint; deleted: boolean }>(`SELECT * FROM "cf_${id}".campaign_records ORDER BY table_name,row_key::text`);
    const events = await rows<{ table_name: string; row_key: Record<string, string>; mutation: string; row_hash: string }>(`SELECT table_name,row_key,mutation,row_hash FROM "cf_${id}".campaign_events ORDER BY sequence`);
    expect(records).toHaveLength(expectedRecords);
    expect(events).toHaveLength(expectedEvents);
    expect(expectedRecords).toBeLessThanOrEqual(128);
    expect(expectedEvents).toBeLessThanOrEqual(2048);
    for (const record of records) {
      expect([...tables, ...serviceTables]).toContain(record.table_name);
      const history = events.filter(event => event.table_name === record.table_name && JSON.stringify(event.row_key) === JSON.stringify(record.row_key));
      expect(Number(record.version)).toBe(history.length);
      expect(history[0]?.mutation).toBe("INSERT");
      expect(history.slice(1).map(event => event.mutation)).toEqual(Array.from({ length: history.length - 1 }, (_, index) => record.deleted && index === history.length - 2 ? "DELETE" : "UPDATE"));
      expect(history.at(-1)?.row_hash).toBe(record.row_hash);
      const actual = await rows<{ hash: string }>(`SELECT md5(to_jsonb(t)::text) AS hash FROM public.${record.table_name} t WHERE to_jsonb(t) @> $1::jsonb`, JSON.stringify(record.row_key));
      expect(actual).toEqual(record.deleted ? [] : [{ hash: record.row_hash }]);
    }
    expect(events.every(event => records.some(record => event.table_name === record.table_name && JSON.stringify(event.row_key) === JSON.stringify(record.row_key)))).toBe(true);
    return { records, events };
  }
  async function supportSnapshot(id: string) {
    const records = await owned(id);
    const content = [];
    for (const record of records) {
      expect([...tables, ...serviceTables]).toContain(record.table_name);
      content.push({ ...record, rows: await rows(`SELECT to_jsonb(t) AS value FROM public.${record.table_name} t WHERE to_jsonb(t) @> $1::jsonb`, JSON.stringify(record.row_key)) });
    }
    return { journal: await digest(id), content };
  }
  async function supportDisposed(id: string, before: RecordKey[], auditRows: Awaited<ReturnType<typeof db.serviceAudit.findMany>>, requestIds: string[]) {
    expect(await rows(`SELECT state FROM "cf_${id}".campaign_manifest`)).toEqual([{ state: "disposed" }]);
    expect(await owned(id)).toEqual(before.filter(row => row.table_name === "audit_logs" || row.table_name === "service_audits"));
    for (const record of before) {
      expect([...tables, ...serviceTables]).toContain(record.table_name);
      const actual = await rows<{ value: Record<string, unknown> }>(`SELECT to_jsonb(t) AS value FROM public.${record.table_name} t WHERE to_jsonb(t) @> $1::jsonb`, JSON.stringify(record.row_key));
      if (record.table_name === "audit_logs") {
        expect(actual).toHaveLength(1);
        expect(actual[0]?.value).toMatchObject({ actorId: null, targetType: "SyntheticCampaign", targetId: id, details: { profile, disposition: "redacted-synthetic-audit" } });
        expect(actual[0]?.value["details"]).toEqual({ profile, disposition: "redacted-synthetic-audit" });
      } else if (record.table_name === "service_audits") {
        const original = auditRows.find(audit => audit.id === record.row_key["id"]);
        expect(original).toBeDefined();
        // Non-null scalar resourceId cannot be nulled. Keep exact ID, action, purpose, version and timestamp.
        expect(actual).toHaveLength(1);
        expect(await db.serviceAudit.findUnique({ where: { id: original!.id } })).toEqual({ ...original, actorId: null, reason: null, targetStaffId: null, resourceId: "redacted-synthetic-service" });
      } else expect(actual, `owned ${record.table_name} ${JSON.stringify(record.row_key)} disposed`).toEqual([]);
    }
    expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`)).toEqual([...requestIds].sort().map(request_id => ({ request_id })));
    expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_sink`)).toEqual([]);
    const redis = await queue.client;
    for (const requestId of requestIds) {
      expect(await queue.getJob(requestId)).toBeUndefined();
      const key = queue.toKey(`de:campaign-cf_${id}-${requestId}`);
      expect(await redis.get(key)).toBe(`disposed:cf_${id}:${candidate}:${requestId}`);
      expect(await redis.pttl(key)).toBe(-1);
    }
  }

  it("keeps Support text, private notes and read state in one reservation, retains redacted audit IDs and preserves foreign cases on repeatable reset", () => withKnownJobs(known => {
    const id = "f1".repeat(16), foreignId = "f2".repeat(16);
    const cleanupIds = [id];
    return resetAfter(cleanupIds, async () => {
      const roster = await seed(id);
      const { staff } = await elevatedStaff(id, roster, known, ["support.operations"]);
      const buyerA = await signIn(id, actor(roster, "buyer-a"), known);
      const buyerB = await signIn(id, actor(roster, "buyer-b"), known);
      const requestIds = [...known];
      await supportJournal(id, 53, 65);
      // FIRST NEW BEHAVIORAL BARRIER: source runtime currently returns COLLECTION_DISABLED/503.
      const opened = await post("/api/v1/services/conversations", buyerA, { purpose: "support", synthetic: true }).expect(201);
      const conversationId = opened.body.id as string, resourceId = opened.body.resourceId as string;
      expect(conversationId).toMatch(/^[a-f0-9-]{36}$/);
      expect(resourceId).toMatch(/^[a-f0-9-]{36}$/);
      const path = `/api/v1/services/conversations/${conversationId}`;
      expect((await owned(id)).filter(row => serviceTables.includes(row.table_name))).toEqual([
        { table_name: "service_conversations", row_key: { id: conversationId } }, { table_name: "support_cases", row_key: { id: resourceId } },
      ]);
      await supportJournal(id, 55, 67);
      let unchanged = await supportSnapshot(id);
      expect((await post("/api/v1/services/conversations", buyerA, { purpose: "support", synthetic: true }).expect(201)).body).toEqual(opened.body);
      expect(await supportSnapshot(id)).toEqual(unchanged);
      const customerMessage = { clientMessageId: randomUUID(), body: "Synthetic buyer A Support request", visibility: "customer" };
      const customerSent = await post(`${path}/messages`, buyerA, customerMessage).expect(201);
      expect(customerSent.body).toMatchObject({ clientMessageId: customerMessage.clientMessageId, sequence: 1, sender: "customer", visibility: "customer", body: customerMessage.body, attachment: null });
      const debt = (await get(path, buyerA).expect(200)).body.support.unansweredSince;
      expect(debt).not.toBeNull();
      await post(`${path}/assignment`, staff, { expectedVersion: 0 }).expect(201);
      const note = { clientMessageId: randomUUID(), body: "Synthetic private Support note", visibility: "staff" };
      const noteSent = await post(`${path}/messages`, staff, note).expect(201);
      expect(noteSent.body).toMatchObject({ sequence: 3, sender: "carberk", visibility: "staff", body: note.body });
      expect((await get(path, buyerA).expect(200)).body.support.unansweredSince).toBe(debt);
      const notice = { clientMessageId: randomUUID(), body: "Synthetic Support notice", visibility: "customer", supportKind: "notice", reason: "Synthetic customer-specific notice reason to erase" };
      const noticeSent = await post(`${path}/messages`, staff, notice).expect(201);
      expect(noticeSent.body).toMatchObject({ sequence: 4, sender: "carberk", visibility: "customer", body: notice.body });
      expect((await get(path, buyerA).expect(200)).body.support.unansweredSince).toBe(debt);
      const reply = { clientMessageId: randomUUID(), body: "Synthetic customer-visible Support reply", visibility: "customer", supportKind: "reply" };
      const replySent = await post(`${path}/messages`, staff, reply).expect(201);
      expect(replySent.body).toMatchObject({ sequence: 5, sender: "carberk", visibility: "customer", body: reply.body });
      const staffRead = await get(path, staff).expect(200);
      expect(staffRead.body.messages.map((message: { id: string }) => message.id)).toEqual([customerSent.body.id, noteSent.body.id, noticeSent.body.id, replySent.body.id]);
      expect(staffRead.body).toMatchObject({ assignmentVersion: 1, assigned: true, lastSequence: 5, support: { unansweredSince: null } });
      const customerRead = await get(path, buyerA).expect(200);
      expect(customerRead.headers["cache-control"]).toBe("no-store, private");
      expect(customerRead.body.messages.map((message: { id: string }) => message.id)).toEqual([customerSent.body.id, noticeSent.body.id, replySent.body.id]);
      expect(customerRead.body.messages.every((message: { operatorName: unknown }) => message.operatorName === null)).toBe(true);
      expect(customerRead.body).toMatchObject({ lastSequence: 5, readThrough: 0, unread: 2, operatorName: null });
      await post(`${path}/read`, buyerA, { throughSequence: 5 }).expect(201);
      expect((await get(path, buyerA).expect(200)).body).toMatchObject({ readThrough: 5, unread: 0 });
      expect(await db.serviceReadState.findMany({ where: { conversationId }, select: { conversationId: true, userId: true, lastSequence: true } })).toEqual([{ conversationId, userId: buyerA.user.id, lastSequence: 5 }]);
      unchanged = await supportSnapshot(id);
      expect((await post(`${path}/messages`, buyerA, customerMessage).expect(201)).body).toEqual(customerSent.body);
      expect(await supportSnapshot(id)).toEqual(unchanged);
      // Staff exact retry still creates the ordinary locked SERVICE_SEND access audit, but no content/outbox/sequence write.
      expect((await post(`${path}/messages`, staff, reply).expect(201)).body).toEqual(replySent.body);
      const other = await post("/api/v1/services/conversations", buyerB, { purpose: "support", synthetic: true }).expect(201);
      expect(other.body.id).not.toBe(conversationId);
      expect((await get("/api/v1/services/conversations", buyerB).expect(200)).body).toEqual([{ id: other.body.id, purpose: "support", createdAt: expect.any(String) }]);
      expect((await get("/api/v1/services/conversations", buyerA).expect(200)).body).toEqual([{ id: conversationId, purpose: "support", createdAt: expect.any(String) }]);
      unchanged = await supportSnapshot(id);
      expect((await get(path, buyerB).expect(403)).body.code).toBe("NO_ACCESS");
      expect((await post(`${path}/messages`, buyerB, { clientMessageId: randomUUID(), visibility: "customer", body: "Synthetic cross-account refusal" }).expect(403)).body.code).toBe("NO_ACCESS");
      expect((await post(`${path}/read`, buyerB, { throughSequence: 5 }).expect(403)).body.code).toBe("NO_ACCESS");
      expect((await post(`${path}/messages`, buyerA, { ...customerMessage, body: "Changed idempotency payload" }).expect(409)).body.code).toBe("IDEMPOTENCY_CONFLICT");
      // Runtime HTTP has no client candidate field. Exercise the actual operator binding, not an invented HTTP header.
      expect(execute("fixture", id, { candidate: "b".repeat(40) })).toMatchObject({ code: 1, sqlCalls: 0, receipt: undefined });
      expect(execute("reset", id, { candidate: "b".repeat(40) })).toMatchObject({ code: 1, receipt: undefined });
      expect(await supportSnapshot(id)).toEqual(unchanged);

      cleanupIds.push(foreignId);
      const foreignRoster = await seed(foreignId), foreignBuyer = await signIn(foreignId, actor(foreignRoster, "buyer-a"), known);
      const foreign = await post("/api/v1/services/conversations", foreignBuyer, { purpose: "support", synthetic: true }).expect(201);
      const foreignBefore = await supportSnapshot(foreignId);
      // A valid current support grant cannot adopt a case from another reservation through assignment.
      await post(`/api/v1/services/conversations/${foreign.body.id}/assignment`, staff, { expectedVersion: 0 }).expect(403);
      expect(await supportSnapshot(id)).toEqual(unchanged);
      expect(await supportSnapshot(foreignId)).toEqual(foreignBefore);
      await supportJournal(foreignId, 25, 27);

      const audits = await db.serviceAudit.findMany({ where: { resourceId }, orderBy: { id: "asc" } });
      expect(audits.map(({ action }) => action).sort()).toEqual(["SERVICE_ASSIGN", "SERVICE_HANDOVER", "SERVICE_NOTE", "SERVICE_READ", "SERVICE_SEND", "SERVICE_SEND", "SERVICE_SEND", "SUPPORT_CUSTOMER_MESSAGE", "SUPPORT_NOTICE", "SUPPORT_PRIVATE_NOTE", "SUPPORT_REPLY"]);
      for (const audit of audits) expect(audit).toMatchObject({ purpose: "support", resourceId, actorId: audit.action === "SUPPORT_CUSTOMER_MESSAGE" ? buyerA.user.id : staff.user.id,
        assignmentVersion: audit.action === "SERVICE_ASSIGN" || audit.action === "SUPPORT_CUSTOMER_MESSAGE" ? 0 : 1, reason: audit.action === "SUPPORT_NOTICE" ? notice.reason : null, targetStaffId: audit.action === "SERVICE_HANDOVER" ? staff.user.id : null });
      const outbox = await db.serviceOutbox.findMany({ where: { conversationId }, orderBy: { sequence: "asc" } });
      expect(outbox.map(({ eventType, sequence, visibility, lifecycleEpoch }) => ({ eventType, sequence, visibility, lifecycleEpoch }))).toEqual([
        { eventType: "message", sequence: 1, visibility: "customer", lifecycleEpoch: 0 }, { eventType: "handover", sequence: 2, visibility: "customer", lifecycleEpoch: 0 },
        { eventType: "message", sequence: 3, visibility: "staff", lifecycleEpoch: 0 }, { eventType: "message", sequence: 4, visibility: "customer", lifecycleEpoch: 0 },
        { eventType: "message", sequence: 5, visibility: "customer", lifecycleEpoch: 0 },
      ]);
      const before = await owned(id);
      const expectedServiceKeys = [
        { table_name: "support_cases", row_key: { id: resourceId } }, { table_name: "support_cases", row_key: { id: other.body.resourceId } },
        { table_name: "service_conversations", row_key: { id: conversationId } }, { table_name: "service_conversations", row_key: { id: other.body.id } },
        ...[customerSent.body.id, noteSent.body.id, noticeSent.body.id, replySent.body.id].map(id => ({ table_name: "service_messages", row_key: { id } })),
        ...outbox.map(({ id }) => ({ table_name: "service_outbox", row_key: { id } })),
        ...audits.map(({ id }) => ({ table_name: "service_audits", row_key: { id } })),
        { table_name: "service_read_states", row_key: { conversationId, userId: buyerA.user.id } },
      ];
      expect(before.filter(row => serviceTables.includes(row.table_name))).toHaveLength(25);
      expect(before.filter(row => serviceTables.includes(row.table_name))).toEqual(expect.arrayContaining(expectedServiceKeys));
      const live = await supportJournal(id, 78, 100);
      expect(await rows(`SELECT table_name,count(*)::int AS count FROM "cf_${id}".campaign_records GROUP BY table_name ORDER BY table_name`)).toEqual(
        Object.entries({ audit_logs: 3, dealership_members: 1, dealerships: 1, otp_requests: 4, service_audits: 11, service_conversations: 2, service_messages: 4, service_outbox: 5, service_read_states: 1, sessions: 4, staff_grants: 3, support_cases: 2, totp_backup_codes: 20, totp_enrollments: 2, users: 15 }).sort(([a], [b]) => a.localeCompare(b)).map(([table_name, count]) => ({ table_name, count })));
      expect(await rows(`SELECT table_name,mutation,count(*)::int AS count FROM "cf_${id}".campaign_events WHERE mutation<>'INSERT' GROUP BY table_name,mutation ORDER BY table_name`)).toEqual([
        { table_name: "otp_requests", mutation: "UPDATE", count: 8 }, { table_name: "service_conversations", mutation: "UPDATE", count: 5 },
        { table_name: "sessions", mutation: "UPDATE", count: 2 }, { table_name: "support_cases", mutation: "UPDATE", count: 5 }, { table_name: "totp_enrollments", mutation: "UPDATE", count: 2 },
      ]);
      const terminalReceipt = { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 };
      expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
      await supportDisposed(id, before, audits, requestIds);
      const terminal = await supportJournal(id, 78, 178);
      expect(terminal.events.slice(0, 100)).toEqual(live.events);
      for (const record of terminal.records) {
        const prior = live.records.find(row => row.table_name === record.table_name && JSON.stringify(row.row_key) === JSON.stringify(record.row_key));
        expect(Number(record.version)).toBe(Number(prior!.version) + 1);
        expect(terminal.events.filter(event => event.table_name === record.table_name && JSON.stringify(event.row_key) === JSON.stringify(record.row_key)).at(-1)?.mutation).toBe(["audit_logs", "service_audits"].includes(record.table_name) ? "UPDATE" : "DELETE");
      }
      const terminalSnapshot = await supportSnapshot(id);
      expect(execute("reset", id)).toMatchObject({ code: 0, receipt: terminalReceipt });
      expect(await supportSnapshot(id)).toEqual(terminalSnapshot);
      expect(await supportSnapshot(foreignId)).toEqual(foreignBefore);
      const foreignKeys = await owned(foreignId);
      expect(execute("reset", foreignId)).toMatchObject({ code: 0, receipt: terminalReceipt });
      await supportDisposed(foreignId, foreignKeys, [], [foreignBuyer.requestId]);
      await supportJournal(foreignId, 25, 52);
    });
  }));

  // B2 text-only contexts. Per reservation, count BEFORE writing: primary 68 records / 91 events
  // before reset, 159 events after reset; foreign control 24 / 26, then 50 events after its reset.
  // Fixed guards remain 128 records / 2048 events. No catalog, contact, media or publish setup.
  // First predicted RED at abfd51f9: personal INSERT -> `Campaign business required` (null businessId).
  // After context admission, PATCH also needs the real generated validatedSteps: [] payload allowed.
  it("keeps personal and admitted-business drafts separate, preserves suspended sales work and disposes only its reservation on retry", () => withKnownJobs(known => {
    const id = "d1".repeat(16), foreignId = "d2".repeat(16);
    const cleanupIds = [id];
    return resetAfter(cleanupIds, async () => {
      const roster = await seed(id);
      const { coordinator, staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
      const owner = await signIn(id, actor(roster, "buyer-a"), known);
      const sales = await signIn(id, actor(roster, "sales-a"), known);
      const outsider = await signIn(id, actor(roster, "buyer-b"), known);
      const admitted = (await post("/api/v1/business/admission", staff, admissionFor(id, owner.user.id)).expect(201)).body as { businessId: string; token: string };
      const businessId = admitted.businessId;
      await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201);
      const invitation = (await post(`/api/v1/business/${businessId}/invitations`, owner, { recipientUserId: sales.user.id }).expect(201)).body as { token: string };
      await post("/api/v1/business/invitations/redeem", sales, { token: invitation.token }).expect(201);
      const rootBusiness = await db.dealership.findUniqueOrThrow({ where: { slug: `campaign897-${id}-${candidate.slice(0, 12)}` } });
      const rootState = await businessState(rootBusiness.id);
      const draftsPath = "/api/v1/listings/drafts";
      const inventoryPath = `/api/v1/businesses/${businessId}/inventory`;
      const patch = (draftId: string, login: Login, description: string, context?: string) => {
        const attempt = request.patch(`${draftsPath}/${draftId}`).set("authorization", `Bearer ${login.accessToken}`);
        if (context) attempt.set("x-business-id", context);
        return attempt.send({ description });
      };
      const personal = (await post(draftsPath, owner, { initialPayload: { description: "Synthetic personal draft before workspace switch" } }).expect(201)).body as { id: string };
      const business = (await post(draftsPath, sales, { businessId, initialPayload: { description: "Synthetic business draft by sales" } }).expect(201)).body as { id: string };
      const savedDrafts = () => db.listingDraft.findMany({ where: { id: { in: [personal.id, business.id] } }, orderBy: { id: "asc" } });
      const assertContexts = async (personalDescription: string, businessDescription: string, updated: boolean) => {
        expect((await get("/api/v1/me/drafts", owner).expect(200)).body.items).toEqual([
          expect.objectContaining({ id: personal.id, userId: owner.user.id, payload: { description: personalDescription, ...(updated ? { validatedSteps: [] } : {}) } }),
        ]);
        expect((await get("/api/v1/me/drafts", sales).expect(200)).body.items).toEqual([]);
        for (const login of [owner, sales]) {
          const inventory = (await get(inventoryPath, login).expect(200)).body;
          expect(inventory).toMatchObject({ businessId, listings: [], counts: { drafts: 1, active: 0 } });
          expect(inventory.drafts).toEqual([expect.objectContaining({ id: business.id, userId: sales.user.id, businessId,
            payload: { description: businessDescription, ...(updated ? { validatedSteps: [] } : {}) } })]);
        }
        expect(await db.listingDraft.findUniqueOrThrow({ where: { id: personal.id } })).toMatchObject({ userId: owner.user.id, businessId: null,
          payload: { description: personalDescription, ...(updated ? { validatedSteps: [] } : {}) } });
        expect(await db.listingDraft.findUniqueOrThrow({ where: { id: business.id } })).toMatchObject({ userId: sales.user.id, businessId,
          payload: { description: businessDescription, ...(updated ? { validatedSteps: [] } : {}) } });
      };
      await assertContexts("Synthetic personal draft before workspace switch", "Synthetic business draft by sales", false);
      expect((await patch(personal.id, owner, "Synthetic personal draft resumed").expect(200)).body).not.toHaveProperty("businessId");
      expect((await patch(business.id, sales, "Synthetic business draft resumed by sales", businessId).expect(200)).body).toMatchObject({ id: business.id, userId: sales.user.id, businessId,
        payload: { description: "Synthetic business draft resumed by sales", validatedSteps: [] } });
      await assertContexts("Synthetic personal draft resumed", "Synthetic business draft resumed by sales", true);

      cleanupIds.push(foreignId);
      const foreignRoster = await seed(foreignId);
      const foreignBuyer = await signIn(foreignId, actor(foreignRoster, "buyer-b"), known);
      const foreignDraft = (await post(draftsPath, foreignBuyer, { initialPayload: { description: "Foreign reservation personal draft must survive" } }).expect(201)).body as { id: string };
      const foreignState = await db.listingDraft.findUniqueOrThrow({ where: { id: foreignDraft.id } });
      const foreignDigest = await digest(foreignId);
      const refused = async (attempt: () => Promise<unknown>) => {
        const unchanged = await digest(id), drafts = await savedDrafts();
        await attempt();
        expect(await digest(id), "draft refusal writes no graph or event").toBe(unchanged);
        expect(await savedDrafts()).toEqual(drafts);
        expect(await digest(foreignId)).toBe(foreignDigest);
        expect(await db.listingDraft.findUniqueOrThrow({ where: { id: foreignDraft.id } })).toEqual(foreignState);
      };
      await refused(async () => {
        expect((await patch(business.id, owner, "Missing explicit context").expect(403)).body.details).toEqual({ reason: "BUSINESS_CONTEXT_CHANGED" });
        expect((await patch(personal.id, owner, "Do not transfer personal work", businessId).expect(403)).body.details).toEqual({ reason: "OWNER_REQUIRED" });
        expect((await post(draftsPath, owner, { businessId, initialPayload: { description: "Mismatched context" } }).set("x-business-id", rootBusiness.id).expect(400)).body.details).toEqual({ reason: "BUSINESS_CONTEXT_CHANGED" });
        for (const login of [outsider, foreignBuyer]) {
          expect((await get(inventoryPath, login).expect(403)).body.details).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
          expect((await patch(business.id, login, "Cannot adopt business work", businessId).expect(403)).body.details).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
          await patch(personal.id, login, "Cannot adopt personal work").expect(404);
          expect((await post(draftsPath, login, { businessId, initialPayload: { description: "Cannot create business work" } }).expect(403)).body.details).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
        }
        await patch(foreignDraft.id, owner, "Cannot adopt another reservation's work").expect(404);
        expect(execute("reset", id, { candidate: "b".repeat(40) })).toMatchObject({ code: 1, receipt: undefined });
      });

      await post(`/api/v1/business/${businessId}/members`, owner, { targetUserId: sales.user.id, action: "suspend" }).expect(201);
      await refused(async () => {
        expect((await get(inventoryPath, sales).expect(403)).body.details).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
        expect((await patch(business.id, sales, "Suspended sales must not overwrite saved work", businessId).expect(403)).body.details).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
        expect((await post(draftsPath, sales, { businessId, initialPayload: { description: "Suspended sales must not create" } }).expect(403)).body.details).toEqual({ reason: "MEMBERSHIP_REQUIRED" });
      });
      expect((await get(inventoryPath, owner).expect(200)).body.drafts).toEqual([expect.objectContaining({ id: business.id, userId: sales.user.id, businessId,
        payload: { description: "Synthetic business draft resumed by sales", validatedSteps: [] } })]);
      expect((await get("/api/v1/me/drafts", owner).expect(200)).body.items).toEqual([expect.objectContaining({ id: personal.id,
        payload: { description: "Synthetic personal draft resumed", validatedSteps: [] } })]);
      expect((await patch(business.id, owner, "Synthetic business work preserved by owner", businessId).expect(200)).body).toMatchObject({ id: business.id, userId: sales.user.id, businessId,
        payload: { description: "Synthetic business work preserved by owner", validatedSteps: [] } });
      await post(`/api/v1/business/${businessId}/members`, owner, { targetUserId: sales.user.id, action: "restore" }).expect(201);
      expect((await get(inventoryPath, sales).expect(200)).body.drafts).toEqual([expect.objectContaining({ id: business.id,
        payload: { description: "Synthetic business work preserved by owner", validatedSteps: [] } })]);
      await patch(business.id, sales, "Synthetic business work resumed after restoration", businessId).expect(200);
      await assertContexts("Synthetic personal draft resumed", "Synthetic business work resumed after restoration", true);
      expect(await businessState(rootBusiness.id)).toEqual(rootState);
      expect(await digest(foreignId)).toBe(foreignDigest);

      // Literal accounting includes bootstrap, ordinary sign-ins, TOTP, admission and membership.
      const journal = async (reservation: string, records: number, events: number) => {
        expect(await rows(`SELECT (SELECT count(*)::int FROM "cf_${reservation}".campaign_records) AS records,(SELECT count(*)::int FROM "cf_${reservation}".campaign_events) AS events`)).toEqual([{ records, events }]);
      };
      const before = await owned(id), foreignBefore = await owned(foreignId);
      const perTable: Record<string, number> = {};
      for (const row of before) perTable[row.table_name] = (perTable[row.table_name] ?? 0) + 1;
      expect(perTable).toEqual({ users: 15, sessions: 5, otp_requests: 5, totp_enrollments: 2, totp_backup_codes: 20, staff_grants: 3,
        audit_logs: 9, dealerships: 2, dealership_members: 3, dealership_invitations: 2, listing_drafts: 2 });
      for (const draftId of [personal.id, business.id]) expect(before).toContainEqual({ table_name: "listing_drafts", row_key: { id: draftId } });
      expect(before).not.toContainEqual({ table_name: "listing_drafts", row_key: { id: foreignDraft.id } });
      await journal(id, 68, 91);
      await journal(foreignId, 24, 26);
      expect(await rows(`SELECT request_id FROM "cf_${id}".campaign_delivery_ledger ORDER BY request_id`)).toEqual(
        [coordinator.requestId, staff.requestId, owner.requestId, sales.requestId, outsider.requestId].sort().map(request_id => ({ request_id })));
      // Publish is deferred to valid contact/media proof. Suspension here is not D3 creator removal.
      expect(execute("reset", id, { loseReceipt: true })).toMatchObject({ code: 0, receipt: undefined });
      await assertDisposed(id, before);
      await journal(id, 68, 159);
      const terminal = await digest(id);
      expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { profile, candidate, state: "disposed", fixtures: "absent", identities: 0, tombstone: true, queueJobs: 0, sinkRecords: 0 } });
      expect(await digest(id)).toBe(terminal);
      await assertDisposed(id, before);
      expect(await savedDrafts()).toEqual([]);
      expect(await digest(foreignId)).toBe(foreignDigest);
      expect(await db.listingDraft.findUniqueOrThrow({ where: { id: foreignDraft.id } })).toEqual(foreignState);
      expect((await get("/api/v1/me/drafts", foreignBuyer).expect(200)).body.items).toEqual([expect.objectContaining({ id: foreignDraft.id, userId: foreignBuyer.user.id,
        payload: { description: "Foreign reservation personal draft must survive" } })]);
      expect(execute("reset", foreignId).code).toBe(0);
      await assertDisposed(foreignId, foreignBefore);
      await journal(foreignId, 24, 50);
    });
  }));

  // Literal accounting was derived before editing: each reservation is 56/68
  // after ordinary Owner setup, 57/69 after unused contact reserve, 57/126 terminal.
  // No confirmation, wrong attempt, resend, extra grant or Session is performed.
  function asynchronousReset(id: string) {
    // Run the identical existing operator/transport harness away from this event loop.
    // Every SQL/Redis child retains execute's existing 30s bound. Do not terminate
    // this worker before its synchronous children settle; wait for its natural exit.
    const worker = new NodeWorker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { spawnSync } = require('node:child_process');
      const { createRequire } = require('node:module');
      const { runInNewContext } = require('node:vm');
      const { root, packageRoot, profile, candidate, source, id } = workerData;
      const localRequire = createRequire(root + '/apps/api/package.json');
      const remoteProcess = { execPath: process.execPath, exitCode: 0, env: {
        STAGING_CAMPAIGN_PROFILE_ENABLED: profile,
        RAILWAY_PROJECT_ID: 'v3-project', RAILWAY_ENVIRONMENT_ID: 'v3-staging', RAILWAY_SERVICE_ID: 'v3-api', RAILWAY_ENVIRONMENT_NAME: 'staging',
        APP_ENV: 'staging', SMS_DRIVER: 'mock', AUTOTM_COMMIT_SHA: candidate,
        DATABASE_URL: 'postgresql://fixture:synthetic@postgres.railway.internal:5432/railway', REDIS_URL: 'redis://fixture:synthetic@redis.railway.internal:6379/0',
        MINIO_ENDPOINT: 'http://minio.railway.internal:9000', MINIO_PUBLIC_URL: 'https://media.example',
      } };
      const payload = { kind: 'reset', id, namespace: 'cf_' + id, profile, candidate, target: candidate,
        redisOrigin: 'redis://redis.railway.internal:6379/0', identity: { projectId: 'v3-project', environmentId: 'v3-staging', services: { api: 'v3-api' },
          origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://media.example' } } };
      let code = 0, receipt, sqlCalls = 0;
      const program = runInNewContext(source + '; remoteProgram(payload)', { payload });
      runInNewContext(program, { URL, process: remoteProcess, require: name => name === 'node:child_process' ? {
        spawnSync: (binary, args, spawnOptions) => {
          if (binary === process.execPath) return spawnSync(binary, args, { ...spawnOptions, encoding: 'utf8', timeout: 30000, cwd: root + '/apps/api', env: process.env });
          sqlCalls += 1;
          return spawnSync(process.execPath, [root + '/scripts/testing/query-disposable-postgres.cjs'], {
            input: spawnOptions.input, encoding: 'utf8', timeout: 30000,
            env: { ...process.env, STAGING_CONTROL_TEST_DATABASE_URL: process.env.DATABASE_URL, STAGING_TEST_DB_PACKAGE: packageRoot + '/package.json' },
          });
        },
      } : localRequire(name), console: { log: value => { receipt = JSON.parse(value); }, error: () => { code = 1; } } });
      parentPort.postMessage({ code: code || remoteProcess.exitCode, receipt, sqlCalls });
    `, { eval: true, workerData: { root, packageRoot, profile, candidate, source, id } });
    return new Promise<ReturnType<typeof execute>>((resolve, reject) => {
      let result: ReturnType<typeof execute> | undefined, failure: Error | undefined;
      worker.on("message", (value: ReturnType<typeof execute>) => { result = value; });
      worker.on("error", (error: Error) => { failure = error; });
      worker.on("exit", code => {
        if (failure) reject(failure);
        else if (code !== 0 || !result) reject(new Error("Reset transport worker failed before receipt"));
        else resolve(result);
      });
    });
  }

  async function contactOrdering(id: string, phone: string, senderFirst: boolean, known: Set<string>) {
    const foreignId = randomUUID(), reuseId = randomUUID();
    type SqlClient = {
      connect(): Promise<void>; end(): Promise<void>;
      query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
    };
    const { Client } = createRequire(`${packageRoot}/package.json`)("pg") as {
      Client: new (options: { connectionString: string | undefined }) => SqlClient;
    };
    let barrier: SqlClient | undefined;
    let send: Promise<{ error?: unknown }> | undefined;
    let resetting: Promise<{ result?: ReturnType<typeof execute>; error?: unknown }> | undefined;
    let requestId: string | undefined;
    let log: ReturnType<typeof vi.spyOn> | undefined;
    await resetAfter([id], async () => {
      try {
        const roster = await seed(id);
        await db.dealership.create({ data: { id: foreignId, slug: `sender-control-${foreignId}`, name: "Unrelated sender/reset control" } });
        const foreign = await businessState(foreignId);
        const { staff } = await elevatedStaff(id, roster, known, ["founder.admission"]);
        const owner = await signIn(id, actor(roster, "buyer-a"), known);
        const admitted = (await post("/api/v1/business/admission", staff, admissionFor(id, owner.user.id)).expect(201)).body as { businessId: string; token: string };
        await post("/api/v1/business/invitations/redeem", owner, { token: admitted.token }).expect(201);
        expect((await get("/api/v1/business/current", owner).expect(200)).body.workspace).toMatchObject({
          business: { id: admitted.businessId, status: "active" }, membership: { role: "owner", status: "active" },
        });
        const accounting = () => rows(`SELECT (SELECT count(*)::int FROM "cf_${id}".campaign_records) AS records,
          (SELECT count(*)::int FROM "cf_${id}".campaign_events) AS events`);
        expect(await accounting()).toEqual([{ records: 56, events: 68 }]);
        const measurement = await db.measurementState.findMany({ orderBy: { key: "asc" } });
        expect(`+9936${(BigInt(`0x${createHash("sha256").update(`campaign897-contact-phone-v1:${id}:${candidate}`, "ascii").digest("hex")}`) % 10000000n).toString().padStart(7, "0")}`).toBe(phone);
        const code = OtpCode.generate();
        const reserved = await new PrismaOtpRequestRepository(db).reserve({
          purpose: Enums.SignInCodePurpose.ListingContactPhone, destination: signInCodeDestination({ phone }),
          codeHash: createHash("sha256").update(code.value).digest("hex"), userId: owner.user.id,
          businessId: admitted.businessId, ip: "127.0.0.1",
        }, new SystemClockAdapter());
        requestId = reserved.record.id;
        expect(reserved.smsDelivery).toEqual({ kind: "campaign", reservationId: id, candidate, namespace: `cf_${id}`, requestId });
        const sms: OtpSms = { phone, code: code.value, purpose: Enums.SignInCodePurpose.ListingContactPhone,
          locale: "ru", requestId, smsDelivery: reserved.smsDelivery };
        const sender = app.get(HttpOtpSenderAdapter);
        // Missing serving attestation is a setup gap. Never enable an operational gate here.
        expect(process.env["AUTOTM_COMMIT_SHA"], "serving candidate attestation prerequisite, not race RED").toBe(candidate);
        expect(await accounting()).toEqual([{ records: 57, events: 69 }]);
        const before = await owned(id);
        const authority = () => rows(`SELECT to_jsonb(b) AS binding,
          (SELECT to_jsonb(l) FROM "cf_${id}".campaign_sms_ledger l WHERE request_id=$1) AS ledger,
          m.sms_hash,m.sms_schema_hash,m.sms_contract_hash,m.tracking_hash,m.schema_hash
          FROM "cf_${id}".campaign_sms_binding b CROSS JOIN "cf_${id}".campaign_manifest m`, requestId);
        const retained = await authority();
        expect(retained).toHaveLength(1);
        const sink = () => rows<{ message: string }>(`SELECT message FROM "cf_${id}".campaign_sms_sink WHERE request_id=$1`, requestId);
        expect(await sink()).toEqual([]);
        log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
        if (senderFirst) {
          barrier = new Client({ connectionString: process.env["DATABASE_URL"] });
          await barrier.connect();
          await barrier.query("BEGIN");
          const holder = (await barrier.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
          // Only the exact private table is locked. The sender's public authority
          // reads remain MVCC and reset can take its existing public graph locks.
          await barrier.query(`LOCK TABLE "cf_${id}".campaign_sms_sink IN SHARE MODE`);
          send = sender.send(sms).then(() => ({}), (error: unknown) => ({ error }));
          const deadline = performance.now() + 2500;
          let senderPid: number | undefined;
          while (performance.now() < deadline) {
            const waiting = await rows<{ pid: number }>(`SELECT a.pid FROM pg_stat_activity a
              JOIN pg_locks sink ON sink.pid=a.pid AND sink.locktype='relation' AND NOT sink.granted
                AND sink.relation='"cf_${id}".campaign_sms_sink'::regclass AND sink.mode='RowExclusiveLock'
              JOIN pg_locks fence ON fence.pid=a.pid AND fence.locktype='advisory' AND fence.granted AND fence.objsubid=1
                AND fence.classid=((hashtextextended($1,0)>>32)&4294967295)::oid
                AND fence.objid=(hashtextextended($1,0)&4294967295)::oid
              WHERE a.datname=current_database() AND $2::int=ANY(pg_blocking_pids(a.pid))`, `cf_${id}`, holder);
            if (waiting.length === 1) { senderPid = waiting[0]!.pid; break; }
          }
          expect(senderPid, "BARRIER SETUP FAILURE: real sender must hold exact namespace fence at sink INSERT").toBeDefined();
          resetting = asynchronousReset(id).then(result => ({ result }), (error: unknown) => ({ error }));
          const resetDeadline = performance.now() + 2500;
          let resetWaiting = false;
          while (performance.now() < resetDeadline) {
            const waiting = await rows(`SELECT a.pid FROM pg_stat_activity a JOIN pg_locks fence ON fence.pid=a.pid
              WHERE a.datname=current_database() AND a.wait_event_type='Lock'
                AND fence.locktype='advisory' AND NOT fence.granted AND fence.objsubid=1
                AND fence.classid=((hashtextextended($1,0)>>32)&4294967295)::oid
                AND fence.objid=(hashtextextended($1,0)&4294967295)::oid
                AND $2::int=ANY(pg_blocking_pids(a.pid))`, `cf_${id}`, senderPid);
            if (waiting.length === 1) { resetWaiting = true; break; }
          }
          expect(resetWaiting, "BARRIER SETUP FAILURE: reset must wait on sender's exact namespace fence").toBe(true);
          await barrier.query("ROLLBACK");
          const sent = await send;
          if (sent.error) throw sent.error;
          const reset = await resetting;
          if (reset.error) throw reset.error;
          expect(reset.result).toMatchObject({ code: 0, receipt: { state: "disposed", queueJobs: 0, sinkRecords: 0 } });
        } else {
          expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { state: "disposed", queueJobs: 0, sinkRecords: 0 } });
        }
        await assertDisposed(id, before);
        expect(await accounting()).toEqual([{ records: 57, events: 126 }]);
        expect(await db.otpRequest.findUnique({ where: { id: requestId } })).toBeNull();
        expect(await db.user.findUnique({ where: { id: owner.user.id } })).toBeNull();
        expect(await sink()).toEqual([]);
        expect(await authority()).toEqual(retained);
        expect(await businessState(foreignId)).toEqual(foreign);
        const terminal = await digest(id);
        const reused = await db.dealership.create({ data: { id: reuseId, slug: `sender-reuse-${reuseId}`,
          name: "Unrelated terminal scalar reuse", contactPhone: phone } });
        // Reset-first invokes this exact generated reserve result for the first
        // time only after disposal. Sender-first also checks its delayed retry.
        await expect(sender.send(sms)).rejects.toThrow("Campaign SMS delivery refused");
        expect(log).not.toHaveBeenCalled();
        expect(await sink()).toEqual([]);
        expect(await queue.getJob(requestId)).toBeUndefined();
        expect(await authority()).toEqual(retained);
        expect(await digest(id)).toBe(terminal);
        expect(execute("reset", id)).toMatchObject({ code: 0, receipt: { state: "disposed", queueJobs: 0, sinkRecords: 0 } });
        expect(await digest(id)).toBe(terminal);
        expect(await authority()).toEqual(retained);
        expect(await sink()).toEqual([]);
        await assertDisposed(id, before);
        expect(await db.dealership.findUnique({ where: { id: reuseId } })).toEqual(reused);
        expect(await businessState(foreignId)).toEqual(foreign);
        expect(await db.measurementState.findMany({ orderBy: { key: "asc" } })).toEqual(measurement);
      } finally {
        // Release storage before awaiting either contender. Sender rollback or
        // commit releases its transaction advisory lock. The reset worker exits
        // only after every existing bounded SQL/Redis child has settled.
        try { if (barrier) await barrier.query("ROLLBACK"); } finally {
          try { await Promise.allSettled([send, resetting]); } finally {
            try { if (barrier) await barrier.end(); } finally {
              log?.mockRestore();
              try { if (requestId) expect.soft(await queue.getJob(requestId)).toBeUndefined(); } finally {
                await db.dealership.deleteMany({ where: { id: { in: [reuseId, foreignId] } } });
              }
            }
          }
        }
      }
    });
  }

  it("finishes a fenced generated contact send before reset disposes its sink and owned graph", () => withKnownJobs(known =>
    contactOrdering("e2".repeat(16), "+99369944528", true, known)));

  it("refuses the exact delayed contact carrier after reset while unrelated fresh phone reuse survives retry", () => withKnownJobs(known =>
    contactOrdering("e3".repeat(16), "+99366905843", false, known)));

});
