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
        let racing: Promise<{ status: number }> | undefined;
        await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "key" FROM "measurement_state" WHERE "key" = 'collector' FOR UPDATE`;
          await tx.measurementState.create({ data: { key: baselineKey, epoch: baselineValue } });
          racing = redeem().then(response => ({ status: response.status }));
          for (let attempt = 0; ; attempt += 1) {
            const [waiting] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity
              WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%measurement_state%'`;
            if (waiting?.count === 1) break;
            if (attempt >= 100) throw new Error("Reserved redemption never waited on the collector row lock");
            await new Promise(done => setTimeout(done, 50));
          }
        }, { timeout: 15_000 });
        await assertRefusedAtomically((await racing!).status);

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
        await db.measurementState.deleteMany({ where: { key: { in: created } } });
        // Exact removal of the unrelated ordinary User this case created, and its own sign-in code.
        await db.otpRequest.deleteMany({ where: { destination: unrelatedEmail } });
        if (unrelatedUserId) await db.user.delete({ where: { id: unrelatedUserId } });
      }
    });
  }));
});
