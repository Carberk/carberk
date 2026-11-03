import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { inspect, promisify } from "node:util";
import { CreateBucketCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { Pool } from "pg";
import { inject } from "vitest";
import { GlobalErrorFilter } from "../../src/common/error.filter";
import { JwtAuthGuard } from "../../src/common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT } from "../../src/modules/identity/identity.public";
import { Listing } from "../../src/modules/listings/domain/Listing";
import { PrismaListingRepository } from "../../src/modules/listings/infrastructure/PrismaListingRepository";
import { DiagnosticsModule } from "../../src/modules/diagnostics/diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../../src/modules/diagnostics/domain/ports/DiagnosticIntakePort";
import { diagnosticMutation, diagnosticPlannedRow, diagnosticRoots } from "../../src/modules/diagnostics/infrastructure/DiagnosticPreparedIntake";
import { bullTestRoot } from "./bullTestRoot";
import { defineE2eSuite, seedSuiteCatalog } from "./e2eSuite";
import { workerUrls } from "./testDatabases";

type Suite = "capture" | "handoff" | "discovery" | "readers";
type Person = "commissionerA" | "commissionerB" | "reception" | "technicianA" | "technicianB" | "reviewer" | "foreign";
type Response<T> = { status: number; body: T; headers: Record<string, string | string[] | number | undefined> };
type Evidence = Prisma.DiagnosticIdentityEvidenceGetPayload<{ include: { identityRecord: true } }>;
type Guard = { table: string; name: string; enabled: "D" | "O" | "A" | "R" };
type Visit = { order: D.DiagnosticOrder; commissioner: Person; technician: Person; raw?: D.DiagnosticIdentityRecord; provenanceId?: string; evidence?: D.DiagnosticIdentityEvidence };
export type PreparedReaderCleanup = {
  label: string; role: string; database: string; keys: string[]; controlKey?: string;
  callers: number; sourceReceipts: number; campaignReceipts: number; roleBackends: number; roleAbsent: boolean;
  objectsEmpty: boolean; controlPreserved: boolean; guardModesRestored: boolean; failures: string[];
};
const run = promisify(execFile);
const appRequire = createRequire(resolve(process.cwd(), "package.json"));
type UserRepositoryLike = { create: (methods: { phone: string; phoneVerifiedAt: Date; email: null; emailVerifiedAt: null }, identity: { nameNumber: number; avatarIndex: number }) => Promise<{ id: string }>; updateDisplayName: (id: string, name: string) => Promise<void> };
type SessionRepositoryLike = { create: (input: { userId: string; refreshTokenHash: string; deviceLabel: string; userAgent: string; expiresAt: Date }) => Promise<{ id: string }>; updateAdminTotpExpiresAt: (id: string, at: Date) => Promise<void>; deleteAllByUserId: (id: string) => Promise<number> };
type AccountUnitOfWorkLike = { run: (command: { userId: string; deletionScheduledAt: Date }, work: (writes: { scheduleDeletion: (id: string, at: Date) => Promise<void>; archiveActiveListings: (id: string) => Promise<void> }) => Promise<void>) => Promise<unknown> };
type HasherLike = { hash: (value: string) => Promise<string>; compare: (value: string, encoded: string) => Promise<boolean> };
const { PrismaUserRepository } = appRequire("./src/modules/identity/infrastructure/PrismaUserRepository") as { PrismaUserRepository: new (db: PrismaService) => UserRepositoryLike };
const { PrismaSessionRepository } = appRequire("./src/modules/identity/infrastructure/PrismaSessionRepository") as { PrismaSessionRepository: new (db: PrismaService, hasher: HasherLike) => SessionRepositoryLike };
const { PrismaAccountDeletionUnitOfWork } = appRequire("./src/modules/identity/infrastructure/PrismaAccountDeletionUnitOfWork") as { PrismaAccountDeletionUnitOfWork: new (db: PrismaService) => AccountUnitOfWorkLike };
const { BcryptHasherAdapter } = appRequire("./src/modules/identity/infrastructure/BcryptHasherAdapter") as { BcryptHasherAdapter: new () => HasherLike };
const bucket = "diagnostic-test-private";
const people: Person[] = ["commissionerA", "commissionerB", "reception", "technicianA", "technicianB", "reviewer", "foreign"];
const capabilities: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technicianA: "diagnostics.technician", technicianB: "diagnostics.technician",
  reviewer: "diagnostics.reviewer", foreign: "diagnostics.technician",
};
const localized = { tk: "Synthetic", ru: "Synthetic", en: "Synthetic" };
export const preparedReaderRights = {
  category: "vehicle_observation", purpose: "Synthetic discovery", basis: "Owned synthetic fixture",
  provenance: "Generated fixture", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: "2027-01-01T00:00:00.000Z", reason: "Fixture permission" }, supplierRestrictions: "No export", hold: null,
};
// Literal synthetic image and sanitized descriptor from DiagnosticIdentityEvidence.e2e.spec.ts.
const image = {
  input: "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=",
  output: "UklGRkAAAABXRUJQVlA4IDQAAAAwAgCdASoEAAQAAMASJaACdLoB+AH4AARoAAD++iGX/3easNN39a3/9aOfron+tHP/WVgA",
  sha256: "2639253ab66f01c5c4121c41b648a4d492d71527101073024166d926a0be22c1", sizeBytes: 72,
};
const quote = (identifier: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error("938_invalid_identifier");
  return `"${identifier}"`;
};
const guardsSql = `SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%'
    OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate') ORDER BY c.relname,t.tgname`;

/** A case owns all callers and resources from the first initialization step. Only the
 * environment connection provisions roles/guards; every fixture and application tuple
 * is produced by the restricted client through actual owners and prepared commands. */
export class DiagnosticPreparedReaderFixture {
  readonly suite;
  readonly role: string;
  readonly label: string;
  readonly cleanupReceipt: PreparedReaderCleanup;
  readonly actors = {} as Record<Person, { userId: string; sessionId: string }>;
  readonly ledger: { orderId: string; event: string; version: number }[] = [];
  readonly objects = new Map<string, { sha256: string | null; sizeBytes: number | null }>();
  db!: PrismaService;
  private environment?: Pool;
  private client?: PrismaService;
  private app?: NestFastifyApplication;
  private module?: TestingModule;
  private s3?: S3Client;
  private jwt?: JwtService;
  private runtimeUrl?: string;
  private roleCreated = false;
  private guards: Guard[] = [];
  private inFlight = new Set<Promise<unknown>>();
  private accepting = true;
  private now = new Date();
  private fault: { orderId: string; evidenceId: string; provenanceId: string; enabled: boolean; reads: number } | undefined;
  private controlKey?: string;
  private controlWritten = false;
  private centerId = "";
  private templateId = "";

  constructor(readonly kind: Suite, scenario: string) {
    this.label = `issue938/recovery-stage1/${kind}/${scenario}`;
    this.suite = defineE2eSuite(`r938-s1-${kind}-${scenario}-${randomUUID()}`);
    this.role = `r938_s1_${kind}`;
    this.cleanupReceipt = { label: this.label, role: this.role, database: "", keys: [], callers: 0, sourceReceipts: 0, campaignReceipts: 0,
      roleBackends: 0, roleAbsent: false, objectsEmpty: false, controlPreserved: false, guardModesRestored: false, failures: [] };
  }
  id(alias: string): string { return this.suite.id(alias); }
  private dependency(condition: unknown, stage: string, detail?: unknown): asserts condition {
    if (!condition) throw new Error(`938_fixture_dependency:${stage}:${JSON.stringify(detail)}`);
  }
  private async caller<T>(work: () => Promise<T>): Promise<T> {
    this.dependency(this.accepting, "caller_after_close");
    const promise = work(); this.inFlight.add(promise);
    try { return await promise; } finally { this.inFlight.delete(promise); }
  }
  async send<T = unknown>(who: Person, method: "GET" | "POST" | "PUT", path: string, payload?: object | Buffer): Promise<Response<T>> {
    return this.caller(async () => {
      this.dependency(this.app && this.jwt, "http_not_initialized");
      const app = this.app, jwt = this.jwt;
      this.dependency(app && jwt, "http_not_initialized");
      const options = { method, url: `/api/v1/diagnostics/${path}`,
        headers: { authorization: `Bearer ${jwt.sign({ sub: this.actors[who].userId, sid: this.actors[who].sessionId, role: "buyer" })}`,
          ...(Buffer.isBuffer(payload) ? { "content-type": "application/octet-stream", "x-evidence-type": "image/png" } : {}) } } as const;
      const response = payload === undefined ? await app.inject(options) : await app.inject({ ...options, payload });
      return { status: response.statusCode, body: response.json() as T, headers: response.headers };
    });
  }
  private async admitted<T>(who: Person, path: string, body: object): Promise<T> {
    const response = await this.send<T>(who, "POST", path, body);
    this.dependency(response.status === 201, path, response);
    return response.body;
  }
  private async bootstrap(who: Person, capability: string): Promise<void> {
    const env = { ...process.env, DATABASE_URL: this.runtimeUrl, APP_ENV: "test", DIAGNOSTIC_SYNTHETIC_ENABLED: "true",
      DIAGNOSTIC_SYNTHETIC_USER_IDS: JSON.stringify(people.map(p => this.actors[p].userId)) };
    for (const argv of [
      ["--filter", "@auto-tm/db", "staff:bootstrap", "--user-id", this.actors[who].userId, "--capability", capability, "--reason", "Issue 938 owned synthetic fixture"],
      ["--filter", "@auto-tm/db", "diagnostics:bootstrap-synthetic", "--center-code", `synthetic-${this.id("center")}`, "--user-id", this.actors[who].userId, "--capability", capability],
    ]) {
      const startedAt = new Date().toISOString();
      const result = await run("pnpm", argv, { cwd: resolve(process.cwd(), "../.."), env, maxBuffer: 1024 * 1024 });
      console.info("938_bootstrap", { argv, startedAt, endedAt: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr });
    }
  }
  async initialize(partialFailure = false): Promise<void> {
    const configured = inject("apiTestDatabases");
    this.dependency(configured && configured.workers === 1, "global_setup_required");
    const expected = workerUrls(configured, Number(process.env["VITEST_POOL_ID"]));
    const databaseUrl = process.env["DATABASE_URL"];
    this.dependency(databaseUrl === expected.databaseUrl && process.env["REDIS_URL"] === expected.redisUrl, "worker_urls");
    const url = new URL(expected.databaseUrl);
    this.dependency(url.hostname === "127.0.0.1" && url.port === "61169" && /^auto_tm_897_938_s1r1_t[a-f0-9]{6}_w1$/.test(url.pathname.slice(1)), "owned_worker_database");
    this.dependency(new URL(expected.redisUrl).host === "127.0.0.1:61168" && new URL(expected.redisUrl).pathname === "/1", "owned_redis_db1");
    this.dependency(process.env["MINIO_ENDPOINT"] === "http://127.0.0.1:61170" && process.env["DIAGNOSTIC_PRIVATE_BUCKET"] === bucket, "owned_storage");
    this.cleanupReceipt.database = url.pathname.slice(1);
    this.environment = new Pool({ connectionString: databaseUrl });
    const observed = await this.environment.query<{ name: string; owner: string }>("SELECT current_database() AS name,current_user AS owner");
    this.dependency(observed.rows[0]?.name === this.cleanupReceipt.database, "environment_database");
    this.guards = (await this.environment.query<Guard>(guardsSql)).rows;
    this.dependency(this.guards.length > 0, "source_guards_missing");
    for (const row of this.guards) await this.environment.query(`ALTER TABLE public.${quote(row.table)} ENABLE TRIGGER ${quote(row.name)}`);
    const password = randomUUID();
    this.dependency((await this.environment.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [this.role])).rowCount === 0, "role_already_exists");
    await this.environment.query(`CREATE ROLE ${quote(this.role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    this.roleCreated = true;
    await this.environment.query(`GRANT CONNECT ON DATABASE ${quote(this.cleanupReceipt.database)} TO ${quote(this.role)}`);
    await this.environment.query(`GRANT USAGE ON SCHEMA public TO ${quote(this.role)}`);
    const registry = (await this.environment.query<{ table: string }>("SELECT value->>'table' AS table FROM jsonb_array_elements(diagnostic_source_registry())")).rows.map(r => r.table);
    const permissions: Record<string, string[]> = {
      SELECT: [...registry, "diagnostic_source_commands", "campaign_preparations", "diagnostic_pdf_artifacts", "measurement_state", "dealership_invitations"],
      "INSERT,UPDATE,DELETE": ["users", "sessions", "staff_grants", "audit_logs", "diagnostic_centers", "diagnostic_center_assignments", "diagnostic_template_versions",
        "inspection_orders", "diagnostic_order_assignments", "diagnostic_identity_records", "diagnostic_reports", "diagnostic_identity_provenance", "diagnostic_identity_evidence",
        "diagnostic_evidence", "diagnostic_audits", "diagnostic_source_anchors", "diagnostic_source_commands", "campaign_preparations", "diagnostic_continuity_proofs", "diagnostic_continuity_requests",
        "diagnostic_ownership_grants", "diagnostic_ownership_components", "diagnostic_pdf_artifacts", "listings", "brands", "models", "regions", "cities"],
      DELETE: ["otp_requests", "measurement_investigation_exports", "measurement_principals", "measurement_state", "totp_enrollments", "fcm_devices", "notification_history",
        "notification_preferences", "saved_searches", "favorites", "owned_vehicles", "blocked_users", "dealership_members", "dealership_invitations", "listing_drafts", "verified_contact_phones",
        "service_messages", "service_push_subscriptions", "service_outbox", "service_read_states"],
      UPDATE: ["measurement_state", "media_uploads", "service_conversations", "service_attachments", "service_messages", "service_audits", "support_cases", "history_deliveries", "history_artifacts",
        "history_bookings", "history_payments", "history_purchase_intents", "history_refunds", "history_orders", "history_quotes", "vehicle_history_requests", "video_grants", "video_process_work",
        "video_generations", "video_upload_sessions", "service_erasure_fences", "video_cleanup_work", "dealerships", "listing_drafts"],
      INSERT: ["media_upload_cleanups", "video_cleanup_work", "service_erasure_fences"],
    };
    for (const [verbs, tables] of Object.entries(permissions)) for (const table of new Set(tables)) {
      await this.environment.query(`GRANT ${verbs === "SELECT" ? "SELECT" : `SELECT,${verbs}`} ON public.${quote(table)} TO ${quote(this.role)}`);
    }
    await this.environment.query(`GRANT USAGE ON SEQUENCE public."listings_publicNumber_seq" TO ${quote(this.role)}`);
    console.info("938_role_grants", { role: this.role, database: this.cleanupReceipt.database, permissions, sequence: "listings_publicNumber_seq", environmentOwner: observed.rows[0]?.owner });
    const runtime = new URL(expected.databaseUrl); runtime.username = this.role; runtime.password = password; this.runtimeUrl = runtime.toString();
    const saved = process.env["DATABASE_URL"];
    try { process.env["DATABASE_URL"] = this.runtimeUrl; this.client = new PrismaService(); }
    finally { process.env["DATABASE_URL"] = saved; }
    // Prisma's native query extension applies to native interactive transactions.
    // No $transaction callback or tx object is wrapped: DiagnosticPreparedIntake's
    // WeakMap receives the identical native tx throughout authority/preparation.
    const client = this.client;
    this.dependency(client, "prisma_client");
    this.db = this.kind === "discovery" ? client.$extends({ query: { diagnosticIdentityEvidence: {
      findMany: async ({ args, query }) => {
        const rows = await query(args);
        const fault = this.fault;
        if (!fault?.enabled) return rows;
        this.dependency(JSON.stringify(args) === JSON.stringify({ where: { orderId: fault.orderId }, include: { identityRecord: true }, orderBy: { orderVersion: "asc" } })
          || args.where?.orderId !== fault.orderId, "f47_unapproved_query_scope", args);
        if (args.where?.orderId !== fault.orderId) return rows;
        return rows.map(row => {
          if (row.id !== fault.evidenceId) return row;
          const copy = structuredClone(row);
          const provenance = D.DiagnosticIdentityEvidenceSchema.shape.provenance.parse(copy.provenance);
          this.dependency(provenance.length === 1 && provenance[0]?.id === fault.provenanceId, "f47_pinned_provenance");
          const first = provenance[0]; this.dependency(first, "f47_provenance_missing");
          first.sha256 = "f".repeat(64); copy.provenance = provenance; fault.reads++;
          return copy;
        });
      },
    } } }) as unknown as PrismaService : this.client;
    const enforcement = (await this.db.$queryRaw<{ role: string; superuser: boolean; owner: boolean; inherit: boolean; membership: boolean }[]>`
      SELECT current_user AS role,r.rolsuper AS superuser,r.rolinherit AS inherit,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=r.oid) AS owner,
        EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership FROM pg_roles r WHERE r.rolname=current_user`)[0];
    this.dependency(enforcement?.role === this.role && !enforcement.superuser && !enforcement.owner && !enforcement.inherit && !enforcement.membership, "restricted_role", enforcement);
    console.info("938_role_enforcement", enforcement);
    const testing = Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), EventEmitterModule.forRoot(), bullTestRoot(), DiagnosticsModule,
      JwtModule.register({ global: true, secret: "issue938-stage1-owned-runtime" })] })
      .overrideProvider(PrismaService).useValue(this.db)
      .overrideProvider(IDENTITY_CLOCK_PORT).useValue({ now: () => new Date(this.now) })
      .overrideProvider(DIAGNOSTIC_RUNTIME).useValue({ now: () => new Date(this.now), id: randomUUID, publicSyntheticAllowed: () => true,
        syntheticAllowed: ({ userId }: { userId: string }) => people.some(p => this.actors[p]?.userId === userId) });
    this.module = await testing.compile();
    this.app = this.module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    this.jwt = this.app.get(JwtService);
    this.app.useGlobalGuards(new JwtAuthGuard(this.app.get(Reflector), this.jwt));
    this.app.useGlobalFilters(new GlobalErrorFilter());
    await this.app.init(); await this.app.getHttpAdapter().getInstance().ready();
    const endpoint = process.env["MINIO_ENDPOINT"], region = process.env["MINIO_REGION"], accessKeyId = process.env["MINIO_ACCESS_KEY"], secretAccessKey = process.env["MINIO_SECRET_KEY"];
    this.dependency(endpoint && region && accessKeyId && secretAccessKey, "storage_credentials");
    this.s3 = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
    try { await this.s3.send(new CreateBucketCommand({ Bucket: bucket })); }
    catch (error) { this.dependency((error as { name?: string }).name === "BucketAlreadyOwnedByYou", "create_bucket", String(error)); }
    const inventory = await this.s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    this.dependency(!inventory.IsTruncated && !inventory.Contents?.length, "initial_bucket_not_clean", inventory.Contents);
    this.controlKey = `diagnostic-evidence/${this.id("control-provenance")}/${image.sha256}`;
    this.cleanupReceipt.controlKey = this.controlKey;
    await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: this.controlKey, Body: Buffer.from(image.output, "base64"), ContentType: "image/webp", IfNoneMatch: "*" }));
    this.controlWritten = true;
    if (partialFailure) throw new Error("938_partial_initialization_sentinel");
    const users = new PrismaUserRepository(this.db);
    const sessions = new PrismaSessionRepository(this.db, new BcryptHasherAdapter());
    for (const [index, person] of people.entries()) {
      const user = await users.create({ phone: this.suite.phone(person), phoneVerifiedAt: this.now, email: null, emailVerifiedAt: null }, { nameNumber: 1000 + index, avatarIndex: index });
      const session = await sessions.create({ userId: user.id, refreshTokenHash: this.id(`${person}-refresh`), deviceLabel: this.label, userAgent: this.label, expiresAt: new Date("2027-01-01T00:00:00.000Z") });
      await sessions.updateAdminTotpExpiresAt(session.id, new Date("2027-01-01T00:00:00.000Z"));
      await users.updateDisplayName(user.id, person === "technicianB" ? "B technician" : person);
      this.actors[person] = { userId: user.id, sessionId: session.id };
    }
    // Independent technician expiry is earlier than reviewer/reception expiry.
    // Discovery advances only its injected authority clock to this actual deadline.
    for (const person of ["technicianB", "technicianA", "foreign", "reviewer", "reception"] as const) {
      const capability = capabilities[person]; this.dependency(capability, "capability_missing"); await this.bootstrap(person, capability);
    }
    await this.bootstrap("reception", "diagnostics.templates");
    this.centerId = (await this.db.diagnosticCenter.findUniqueOrThrow({ where: { code: `synthetic-${this.id("center")}` } })).id;
    const template = await this.admitted<D.DiagnosticTemplate>("reception", `centers/${this.centerId}/templates`, { expectedVersion: 0, synthetic: true,
      definition: { title: localized, limitations: localized, syntheticNotice: localized, checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] } });
    this.templateId = template.id;
    console.info("938_fixture_registry", { label: this.label, actors: this.actors, centerId: this.centerId, templateId: this.templateId, guards: this.guards, controlKey: this.controlKey });
  }

  async arrived(alias: "A" | "B", publicVisit = false): Promise<Visit> {
    const commissioner: Person = publicVisit && alias === "A" ? "commissionerA" : "commissionerB";
    const technician: Person = alias === "A" ? "technicianA" : "technicianB";
    let listingId: string | undefined;
    if (publicVisit) {
      if (await this.db.brand.count({ where: { id: this.suite.catalog.brandId } }) === 0) await seedSuiteCatalog(this.db, this.suite);
      listingId = this.id(`listing-${alias}`);
      await new PrismaListingRepository(this.db).save(Listing.create({ id: listingId, publicNumber: 0, sellerId: this.actors[commissioner].userId,
        status: "active", brandId: this.suite.catalog.brandId, modelId: this.suite.catalog.modelId, cityId: this.suite.catalog.cityId, year: 2020, vin: "SYN-123",
        priceAmount: 100000, priceCurrency: "TMT", allowCalls: false, allowChat: true, publishedAt: this.now }));
    }
    let order = await this.admitted<D.DiagnosticOrder>(commissioner, "orders", { requestKey: this.id(`request-${alias}`), centerId: this.centerId,
      templateVersionId: this.templateId, audience: publicVisit ? "listing_public" : "buyer_private", ...(listingId ? { listingId } : {}), synthetic: true });
    this.record(order, "create", 0);
    const step = async (path: string, data: object, event: string, version: number) => {
      order = await this.admitted<D.DiagnosticOrder>("reception", `orders/${order.id}/${path}`, { expectedVersion: order.version, ...data });
      this.record(order, event, version);
    };
    await step("authorization", { kind: "physical", authorityReference: "SYNTHETIC physical access" }, "physical authorization", 1);
    if (publicVisit) await step("authorization", { kind: "publication", authorityReference: "SYNTHETIC publication" }, "publication authorization", 2);
    await step("assignments", { userId: this.actors.reviewer.userId, capability: "diagnostics.reviewer", active: true }, "reviewer assignment", publicVisit ? 3 : 2);
    await step("assignments", { userId: this.actors[technician].userId, capability: "diagnostics.technician", active: true }, "technician assignment", publicVisit ? 4 : 3);
    await step("appointment", { state: "confirmed" }, "confirmed", publicVisit ? 5 : 4);
    await step("appointment", { state: "arrived" }, "arrived", publicVisit ? 6 : 5);
    return { order, commissioner, technician };
  }
  private record(order: { id: string; version: number }, event: string, version: number) {
    this.dependency(order.version === version, `version:${event}`, { expected: version, actual: order.version });
    this.ledger.push({ orderId: order.id, event, version });
  }
  /** Unchanged-version checkpoints read the persisted order, not a route response. */
  private async persisted(orderId: string): Promise<{ id: string; version: number }> {
    return this.db.inspectionOrder.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, version: true } });
  }
  async observe(visit: Visit, observation: Omit<D.DiagnosticObservedVehicle, "expectedVersion">, ownershipRights?: object): Promise<D.DiagnosticOrder> {
    let grant: { id: string } | undefined;
    if (visit.order.audience === "listing_public") {
      this.dependency(ownershipRights, "public_grant_rights_required");
      this.dependency(await this.db.diagnosticIdentityRecord.count({ where: { orderId: visit.order.id } }) === 0, "grant_before_first_raw");
      grant = await this.admitted(visit.commissioner, `orders/${visit.order.id}/ownership-grant`, { rights: ownershipRights });
      this.record((await this.send<D.DiagnosticOrder>(visit.technician, "GET", `orders/${visit.order.id}`)).body, "grant before first raw", 6);
    } else {
      // Buyer-private orders never receive an ownership grant; checkpoint the unchanged version before first raw.
      this.dependency(await this.db.diagnosticOwnershipGrant.count({ where: { orderId: visit.order.id } }) === 0, "private_no_ownership_grant");
      this.record(await this.persisted(visit.order.id), "no ownership grant", 5);
    }
    visit.order = await this.admitted(visit.technician, `orders/${visit.order.id}/vehicle`, { expectedVersion: visit.order.version, ...observation,
      ...(grant ? { ownershipGrantId: grant.id, ownershipClassification: { rights: ownershipRights } } : {}) });
    this.record(visit.order, "first raw", visit.order.audience === "listing_public" ? 7 : 6);
    const history = await this.send<D.DiagnosticIdentityRecord[]>(visit.technician, "GET", `orders/${visit.order.id}/identity-records`);
    this.dependency(history.status === 200 && history.body.length === 1, "first_raw_history", history);
    const raw = history.body[0]; this.dependency(raw, "first_raw_missing"); visit.raw = raw; return visit.order;
  }
  async material(visit: Visit): Promise<void> {
    this.dependency(visit.raw, "raw_before_material");
    const raw = visit.raw;
    const provenanceId = this.id(`provenance-${visit.order.id}`);
    const key = `diagnostic-evidence/${provenanceId}/${image.sha256}`;
    this.objects.set(key, { sha256: image.sha256, sizeBytes: image.sizeBytes });
    await this.admitted(visit.technician, `orders/${visit.order.id}/identity-provenance`, { id: provenanceId, expectedOrderVersion: visit.order.version, contentType: "image/png", sizeBytes: 95, rights: preparedReaderRights });
    const uploaded = await this.send(visit.technician, "PUT", `orders/${visit.order.id}/identity-provenance/${provenanceId}?expectedOrderVersion=${visit.order.version}`, Buffer.from(image.input, "base64"));
    this.dependency(uploaded.status === 200, "provenance_upload", uploaded);
    const stored = await this.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: provenanceId } });
    this.dependency(stored.objectKey === key && stored.sha256 === image.sha256 && stored.sizeBytes === 72, "stored_object_descriptor", stored);
    this.record(await this.persisted(visit.order.id), "provenance stage-upload", visit.order.audience === "listing_public" ? 7 : 6);
    const evidence = await this.admitted<D.DiagnosticIdentityEvidence>(visit.technician, `orders/${visit.order.id}/identity-evidence`, {
      id: this.id(`evidence-${visit.order.id}`), expectedOrderVersion: visit.order.version, identityRecordId: raw.id,
      identifiers: [{ kind: "vin_stamp", location: "Synthetic plate", value: "SYN-123", provenanceIds: [provenanceId] }], rights: preparedReaderRights, correction: null,
    });
    visit.evidence = evidence; visit.provenanceId = provenanceId;
    visit.order = (await this.send<D.DiagnosticOrder>(visit.technician, "GET", `orders/${visit.order.id}`)).body;
    this.record(visit.order, "retained evidence append", visit.order.audience === "listing_public" ? 8 : 7);
  }
  async release(visit: Visit, reportId = this.id(`report-${visit.order.id}`), existing = false): Promise<D.DiagnosticReportRecord> {
    if (!existing) await this.admitted(visit.technician, `orders/${visit.order.id}/reports`, { reportId, expectedOrderVersion: visit.order.version });
    await this.admitted(visit.technician, `reports/${reportId}/findings`, { expectedVersion: 0, finding: { id: this.id(`finding-${visit.order.id}`), checkId: "brakes", assessment: "normal",
      explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null } });
    await this.admitted(visit.technician, `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" });
    const report = await this.admitted<D.DiagnosticReportRecord>("reviewer", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize", vehicleDisplay: { make: "Synthetic make", model: "Synthetic model", year: 2020 } });
    const artifacts = await this.db.diagnosticPdfArtifact.findMany({ where: { reportId } });
    this.dependency(artifacts.length === 3 && artifacts.every(row => row.objectKey === `diagnostic-pdf/${reportId}/${row.id}.pdf` && row.state === "pending"), "finalized_pdf_intents", artifacts);
    for (const row of artifacts) this.objects.set(row.objectKey, { sha256: row.sha256, sizeBytes: row.sizeBytes });
    console.info("938_pdf_intents", artifacts);
    return report;
  }
  async pair(publicVisit = false, ownershipRights?: object) {
    const a = await this.arrived("A", publicVisit);
    await this.observe(a, { observedAt: "2026-10-21T12:00:00.000Z", mileageKm: 123000, method: "vin", vin: "SYN-123", manualReference: null }, ownershipRights);
    await this.material(a); const report = await this.release(a);
    const b = await this.arrived("B", publicVisit);
    await this.observe(b, { observedAt: "2026-10-22T12:00:00.000Z", mileageKm: 124100, method: "vin", vin: "SYN-123", manualReference: null }, ownershipRights);
    await this.material(b);
    return { a, b, report };
  }
  async issue(a: Visit, b: Visit, report: D.DiagnosticReportRecord, expectedCandidateVersion: 7 | 8): Promise<string> {
    this.dependency(a.raw && b.raw && a.provenanceId && b.provenanceId, "proof_material");
    const proof = await this.admitted<{ proofId: string }>("reviewer", `orders/${b.order.id}/continuity-proofs`, { predecessorId: report.id, expectedPredecessorVersion: 3,
      expectedOrderVersion: expectedCandidateVersion, predecessorIdentityRecordId: a.raw.id, candidateIdentityRecordId: b.raw.id, linkingTechnicianId: this.actors.technicianB.userId,
      method: "comparative_attestation", rationale: "Private reviewer rationale", provenanceRecordIds: [a.provenanceId, b.provenanceId] });
    this.record(await this.persisted(b.order.id), "proof issue-read", b.order.audience === "listing_public" ? 8 : 7);
    return proof.proofId;
  }
  async expireSelectedQualification(): Promise<void> {
    const selected = await this.db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { centerId_userId_capability: { centerId: this.centerId, userId: this.actors.technicianB.userId, capability: "diagnostics.technician" } } });
    const reviewer = await this.db.diagnosticCenterAssignment.findUniqueOrThrow({ where: { centerId_userId_capability: { centerId: this.centerId, userId: this.actors.reviewer.userId, capability: "diagnostics.reviewer" } } });
    const selectedUntil = selected.qualifiedUntil, reviewerUntil = reviewer.qualifiedUntil;
    this.dependency(selectedUntil && reviewerUntil && selectedUntil < reviewerUntil, "independent_expiry_deadlines");
    this.now = selectedUntil;
  }
  async storedEvidence(visit: Visit): Promise<Evidence> {
    this.dependency(visit.evidence, "evidence_required");
    const evidence = visit.evidence;
    return this.db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: evidence.id }, include: { identityRecord: true } });
  }
  async withMalformedCopiedProvenance<T>(visit: Visit, work: () => Promise<T>): Promise<T> {
    this.dependency(this.kind === "discovery" && !this.fault && visit.evidence && visit.provenanceId, "f47_boundary");
    const evidence = visit.evidence, provenanceId = visit.provenanceId;
    this.dependency(evidence && provenanceId, "f47_material");
    const pin = { orderId: visit.order.id, evidenceId: evidence.id, provenanceId, enabled: true, reads: 0 };
    console.info("938_f47_pin", { ...pin, query: { where: { orderId: pin.orderId }, include: { identityRecord: true }, orderBy: { orderVersion: "asc" } } });
    this.fault = pin;
    try { const result = await work(); this.dependency(pin.reads > 0, "f47_target_read_not_reached"); return result; }
    finally { pin.enabled = false; this.fault = undefined; }
  }
  async illegalProvenanceRewrite(visit: Visit): Promise<{ reached: boolean; error: unknown }> {
    this.dependency(visit.evidence && visit.provenanceId, "immutable_control_material");
    const evidence = visit.evidence, provenanceId = visit.provenanceId;
    this.dependency(evidence && provenanceId, "immutable_control_material");
    const evidenceId = evidence.id;
    let reached = false;
    try {
      await this.db.$transaction(async tx => {
        const stored = await tx.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: evidenceId } });
        const copy = D.DiagnosticIdentityEvidenceSchema.shape.provenance.parse(stored.provenance);
        this.dependency(copy.length === 1 && copy[0]?.id === provenanceId, "immutable_control_pinned_row");
        const first = copy[0]; this.dependency(first, "immutable_control_provenance"); first.sha256 = "f".repeat(64);
        const planned = await diagnosticPlannedRow(tx, { table: "diagnostic_identity_evidence", key: { id: evidenceId } }, { provenance: copy });
        await diagnosticMutation(tx, { operation: "identity_material_change", roots: diagnosticRoots(this.actors[visit.technician], [visit.order.id]), rows: [planned],
          actorUserId: this.actors[visit.technician].userId, sessionId: this.actors[visit.technician].sessionId, cutoff: null, campaign: null }, async () => {
          reached = true;
          await tx.diagnosticIdentityEvidence.update({ where: { id: evidenceId }, data: { provenance: copy } });
        });
      });
      throw new Error("938_immutable_write_unexpectedly_succeeded");
    } catch (error) { console.info("938_immutable_control_error", { reached, error: inspect(error, { depth: null }) }); return { reached, error }; }
  }
  async purgeA(visit: Visit): Promise<void> {
    this.dependency(visit.commissioner === "commissionerA", "independent_A_commissioner_required");
    const userId = this.actors.commissionerA.userId;
    const due = new Date();
    // The fixture calls the actual scheduling adapter with an already-due task
    // account, then the actual worker. It does not fake DELETE /me's 30-day grace.
    await new PrismaSessionRepository(this.db, new BcryptHasherAdapter()).deleteAllByUserId(userId);
    await new PrismaAccountDeletionUnitOfWork(this.db).run({ userId, deletionScheduledAt: due }, async writes => {
      await writes.scheduleDeletion(userId, due); await writes.archiveActiveListings(userId);
    });
    const require = createRequire(resolve(process.cwd(), "package.json"));
    const { PurgeExpiredAccounts } = require(resolve(process.cwd(), "../worker/dist/jobs/PurgeExpiredAccounts.js")) as { PurgeExpiredAccounts: new (db: PrismaService) => { execute(input: { now: Date }): Promise<{ purgedCount: number }> } };
    const result = await new PurgeExpiredAccounts(this.db).execute({ now: new Date() });
    this.dependency(result.purgedCount === 1, "A_purge_count", result);
    const [order, user] = await Promise.all([this.db.inspectionOrder.findUniqueOrThrow({ where: { id: visit.order.id } }), this.db.user.findUniqueOrThrow({ where: { id: userId } })]);
    this.dependency(order.erasedAt && user.phone === null && user.email === null && user.deletionScheduledAt === null, "A_purge_not_erased");
    console.info("938_actual_A_erasure", { userId, orderId: order.id, erasedAt: order.erasedAt, cutoff: due.toISOString(), result });
  }
  async assign(visit: Visit, who: Person, active: boolean): Promise<D.DiagnosticOrder> {
    visit.order = await this.admitted("reception", `orders/${visit.order.id}/assignments`, { expectedVersion: visit.order.version,
      userId: this.actors[who].userId, capability: "diagnostics.technician", active });
    return visit.order;
  }
  async close(): Promise<PreparedReaderCleanup> {
    const receipt = this.cleanupReceipt;
    this.accepting = false; if (this.fault) this.fault.enabled = false; this.fault = undefined;
    receipt.callers = this.inFlight.size;
    await Promise.allSettled([...this.inFlight]);
    const attempt = async (name: string, work: () => Promise<unknown>) => { try { await work(); } catch (error) { receipt.failures.push(`${name}:${String(error)}`); } };
    const client = this.client;
    if (client) await attempt("live_receipts", async () => {
      receipt.sourceReceipts = await client.diagnosticSourceCommand.count();
      const rows = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM public.campaign_preparations`;
      receipt.campaignReceipts = rows[0]?.count ?? 0;
      this.dependency(receipt.sourceReceipts === 0 && receipt.campaignReceipts === 0, "residual_receipts", receipt);
    });
    const app = this.app, module = this.module;
    if (app) await attempt("app_close", () => app.close());
    else if (module) await attempt("module_close", () => module.close());
    else if (client) await attempt("prisma_close", () => client.onModuleDestroy());
    const s3 = this.s3;
    if (s3) {
      for (const key of this.objects.keys()) await attempt(`object:${key}`, () => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
      const controlKey = this.controlKey;
      if (controlKey) await attempt("control_preserved", async () => {
        if (this.controlWritten) {
          const control = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: controlKey }));
          this.dependency(control.ContentLength === 72, "cleanup_control_changed"); receipt.controlPreserved = true;
        }
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: controlKey }));
      });
      await attempt("object_inventory", async () => {
        const remaining = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
        this.dependency(!remaining.IsTruncated && !remaining.Contents?.length, "cleanup_residual_objects", remaining.Contents); receipt.objectsEmpty = true;
      });
      s3.destroy();
    }
    const environment = this.environment;
    if (environment) {
      if (this.roleCreated) await attempt("role_cleanup", async () => {
        receipt.roleBackends = (await environment.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename=$1", [this.role])).rows[0]?.count ?? 0;
        this.dependency(receipt.roleBackends === 0, "live_runtime_role_backends", receipt.roleBackends);
        await environment.query(`DROP OWNED BY ${quote(this.role)}`);
        await environment.query(`DROP ROLE ${quote(this.role)}`);
        receipt.roleAbsent = (await environment.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [this.role])).rowCount === 0;
        this.dependency(receipt.roleAbsent, "role_not_dropped");
      });
      await attempt("guard_restore", async () => {
        for (const row of this.guards) {
          const action = { D: "DISABLE", O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" }[row.enabled];
          await environment.query(`ALTER TABLE public.${quote(row.table)} ${action} TRIGGER ${quote(row.name)}`);
        }
        receipt.guardModesRestored = JSON.stringify((await environment.query<Guard>(guardsSql)).rows) === JSON.stringify(this.guards);
        this.dependency(receipt.guardModesRestored, "guard_modes_not_restored");
      });
      await attempt("environment_close", () => environment.end());
    }
    receipt.keys = [...this.objects.keys()];
    console.info("938_cleanup_receipt", receipt, "order_version_ledger", this.ledger);
    return receipt;
  }
}

export async function withPreparedReaderFixture<T>(kind: Suite, scenario: string, work: (fixture: DiagnosticPreparedReaderFixture) => Promise<T>,
  options: { partialFailure?: boolean; cleanup?: (receipt: PreparedReaderCleanup) => void } = {}): Promise<T> {
  const fixture = new DiagnosticPreparedReaderFixture(kind, scenario);
  let original: unknown;
  // Successful completion is tracked explicitly: stage1 callbacks resolve with `void`, so `undefined` is a valid result.
  let completion: { readonly value: T } | undefined;
  try { await fixture.initialize(options.partialFailure); completion = { value: await work(fixture) }; }
  catch (error) { original = error; }
  const cleanup = await fixture.close(); options.cleanup?.(cleanup);
  if (cleanup.failures.length) throw new AggregateError([...(original === undefined ? [] : [original]), ...cleanup.failures], "938_fixture_cleanup_failed");
  if (original !== undefined) throw original;
  if (completion === undefined) throw new Error("938_fixture_missing_result");
  return completion.value;
}
