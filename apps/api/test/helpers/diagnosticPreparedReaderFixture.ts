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
import { DiagnosticSchemas as D, type BusinessSchemas } from "@auto-tm/contracts";
import { Pool } from "pg";
import { inject } from "vitest";
import { GlobalErrorFilter } from "../../src/common/error.filter";
import { JwtAuthGuard } from "../../src/common/jwt-auth.guard";
import { IDENTITY_CLOCK_PORT, type IdentityAdminPort, type IdentityCheckPort, type IdentityReadPort } from "../../src/modules/identity/identity.public";
import { SuspendUser } from "../../src/modules/admin/application/SuspendUser";
import { PrismaAuditLogRepository } from "../../src/modules/admin/infrastructure/PrismaAuditLogRepository";
import { PrismaContentReportRepository } from "../../src/modules/admin/infrastructure/PrismaContentReportRepository";
import { PrismaConversationRepository } from "../../src/modules/conversations/infrastructure/PrismaConversationRepository";
import { Listing } from "../../src/modules/listings/domain/Listing";
import { PrismaListingRepository } from "../../src/modules/listings/infrastructure/PrismaListingRepository";
import { DiagnosticsModule } from "../../src/modules/diagnostics/diagnostics.module";
import { DIAGNOSTIC_RUNTIME } from "../../src/modules/diagnostics/domain/ports/DiagnosticIntakePort";
import { diagnosticMutation, diagnosticPlannedRow, diagnosticRoots } from "../../src/modules/diagnostics/infrastructure/DiagnosticPreparedIntake";
import { bullTestRoot } from "./bullTestRoot";
import { defineE2eSuite, seedSuiteCatalog } from "./e2eSuite";
import { workerUrls } from "./testDatabases";

type Suite = "capture" | "handoff" | "discovery" | "readers";
type Person = "commissionerA" | "commissionerB" | "reception" | "technicianA" | "technicianB" | "reviewer" | "foreign" | Operator;
/** #940 H2 actors created on demand through the ordinary User/Session repositories; never part of `people`. */
type Operator = "founder" | "owner" | "staffManager" | "admin";
type Response<T> = { status: number; body: T; headers: Record<string, string | string[] | number | undefined> };
type Evidence = Prisma.DiagnosticIdentityEvidenceGetPayload<{ include: { identityRecord: true } }>;
type Guard = { table: string; name: string; enabled: "D" | "O" | "A" | "R" };
export type Visit = { order: D.DiagnosticOrder; commissioner: Person; technician: Person; raw?: D.DiagnosticIdentityRecord; provenanceId?: string; evidence?: D.DiagnosticIdentityEvidence };
/** Explicit per-visit rights deadlines; omitted parts keep preparedReaderRights. */
export type MaterialRights = { provenance?: Date; evidence?: Date };
/** Staff bootstrap order fixes the ordinary 2-hour qualification deadlines' relative order. */
export type PreparedReaderSetup = { qualificationOrder?: "technician-first" | "reviewer-first" };
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
// #940 H2: the production identity adapters and use cases for staff, Business and moderation actors.
type ClockLike = { now: () => Date };
type SubjectLike = { userId: string; sessionId: string };
type InvitationReceiptLike = { businessId: string; invitationId: string; token: string; expiresAt: string };
type StaffGrantChangeLike = SubjectLike & { targetUserId: string; capability: string; reason: string; grant: boolean };
const { PrismaStaffAuthority } = appRequire("./src/modules/identity/infrastructure/PrismaStaffAuthority") as { PrismaStaffAuthority: new (db: PrismaService, clock: ClockLike) => object };
const { ChangeStaffGrant } = appRequire("./src/modules/identity/application/ChangeStaffGrant") as { ChangeStaffGrant: new (repository: object, clock: ClockLike) => { execute: (input: StaffGrantChangeLike) => Promise<void> } };
const { PrismaBusinessRepository } = appRequire("./src/modules/identity/infrastructure/PrismaBusinessRepository") as { PrismaBusinessRepository: new (db: PrismaService) => object };
const { NodeBusinessInvitationTokens } = appRequire("./src/modules/identity/infrastructure/NodeBusinessInvitationTokens") as { NodeBusinessInvitationTokens: new () => object };
const { AdmitBusiness } = appRequire("./src/modules/identity/application/AdmitBusiness") as { AdmitBusiness: new (repository: object, clock: ClockLike, tokens: object) => { execute: (input: SubjectLike & BusinessSchemas.AdmitBusinessInput) => Promise<InvitationReceiptLike> } };
const { InviteBusinessMember } = appRequire("./src/modules/identity/application/InviteBusinessMember") as { InviteBusinessMember: new (repository: object, clock: ClockLike, tokens: object) => { execute: (input: SubjectLike & { businessId: string; recipientUserId: string }) => Promise<InvitationReceiptLike> } };
const { RedeemBusinessInvitation } = appRequire("./src/modules/identity/application/RedeemBusinessInvitation") as { RedeemBusinessInvitation: new (repository: object, clock: ClockLike, tokens: object) => { execute: (input: SubjectLike & { token: string }) => Promise<{ businessId: string }> } };
const { ChangeBusinessMembership } = appRequire("./src/modules/identity/application/ChangeBusinessMembership") as { ChangeBusinessMembership: new (repository: object, clock: ClockLike) => { execute: (input: SubjectLike & BusinessSchemas.BusinessMembershipChangeInput & { businessId: string }) => Promise<void> } };
const { PrismaIdentityReadAdapter } = appRequire("./src/modules/identity/infrastructure/PrismaIdentityReadAdapter") as { PrismaIdentityReadAdapter: new (db: PrismaService) => IdentityReadPort };
const { PrismaIdentityAdminRepository } = appRequire("./src/modules/identity/infrastructure/PrismaIdentityAdminRepository") as { PrismaIdentityAdminRepository: new (db: PrismaService) => IdentityAdminPort };
const { PrismaIdentityCheckAdapter } = appRequire("./src/modules/identity/infrastructure/PrismaIdentityCheckAdapter") as { PrismaIdentityCheckAdapter: new (db: PrismaService) => IdentityCheckPort };
const bucket = "diagnostic-test-private";
const historicalDiagnosticPostgresPort = 61169;
const historicalDiagnosticRedisPort = 61168;
const historicalDiagnosticMinioPort = 61170;
const people: Person[] = ["commissionerA", "commissionerB", "reception", "technicianA", "technicianB", "reviewer", "foreign"];
const operators: Operator[] = ["founder", "owner", "staffManager", "admin"];
const capabilities: Partial<Record<Person, string>> = {
  reception: "diagnostics.reception", technicianA: "diagnostics.technician", technicianB: "diagnostics.technician",
  reviewer: "diagnostics.reviewer", foreign: "diagnostics.technician",
};
const localized = { tk: "Synthetic", ru: "Synthetic", en: "Synthetic" };
function expectedDiagnosticPort(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]{0,4}$/.test(value)) return undefined;
  const port = Number(value);
  return port <= 65535 ? port : undefined;
}
export function expectedDiagnosticPostgresPort(value = process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"]): number | undefined {
  return expectedDiagnosticPort(value, historicalDiagnosticPostgresPort);
}
export function expectedDiagnosticRedisPort(value = process.env["DIAGNOSTIC_EXPECTED_REDIS_PORT"]): number | undefined {
  return expectedDiagnosticPort(value, historicalDiagnosticRedisPort);
}
export function expectedDiagnosticMinioPort(value = process.env["DIAGNOSTIC_EXPECTED_MINIO_PORT"]): number | undefined {
  return expectedDiagnosticPort(value, historicalDiagnosticMinioPort);
}
export type DiagnosticPreparedReaderOwnership = {
  workerUrls: boolean;
  ownedWorkerDatabase: boolean;
  ownedRedisDb1: boolean;
  ownedStorage: boolean;
};
export function diagnosticPreparedReaderOwnership(input: {
  databaseUrl: string | undefined;
  expectedDatabaseUrl: string;
  redisUrl: string | undefined;
  expectedRedisUrl: string;
  minioEndpoint: string | undefined;
  bucket: string | undefined;
  expectedPostgresPort: number | undefined;
  expectedRedisPort: number | undefined;
  expectedMinioPort: number | undefined;
}): DiagnosticPreparedReaderOwnership {
  const database = new URL(input.expectedDatabaseUrl);
  const redis = input.redisUrl === undefined ? undefined : new URL(input.redisUrl);
  return {
    workerUrls: input.databaseUrl === input.expectedDatabaseUrl && input.redisUrl === input.expectedRedisUrl,
    ownedWorkerDatabase: input.expectedPostgresPort !== undefined && database.hostname === "127.0.0.1" && database.port === String(input.expectedPostgresPort) && /^auto_tm_897_938_s1r1_t[a-f0-9]{6}_w1$/.test(database.pathname.slice(1)),
    ownedRedisDb1: input.expectedRedisPort !== undefined && redis?.hostname === "127.0.0.1" && redis.port === String(input.expectedRedisPort) && redis.pathname === "/1",
  ownedStorage: input.expectedMinioPort !== undefined && input.minioEndpoint === `http://127.0.0.1:${input.expectedMinioPort}` && input.bucket === "diagnostic-test-private",
  };
}
export const preparedReaderRights = {
  category: "vehicle_observation", purpose: "Synthetic discovery", basis: "Owned synthetic fixture",
  provenance: "Generated fixture", identifiability: "pseudonymous", use: ["service"],
  schedule: { kind: "until", until: "2027-01-01T00:00:00.000Z", reason: "Fixture permission" }, supplierRestrictions: "No export", hold: null,
};
// #939 predecessor visit observation: the original discovery literals (observedAt, mileageKm 100) with the fixture VIN.
export const preparedPredecessorObservation = { observedAt: "2026-10-21T12:00:00.000Z", mileageKm: 100, method: "vin", vin: "SYN-123", manualReference: null } as const;
const rightsUntil = (until?: Date) => until ? { ...preparedReaderRights, schedule: { ...preparedReaderRights.schedule, until: until.toISOString() } } : preparedReaderRights;
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
  /** Capture suites only: the exact ownership component create data, recorded before the unchanged write. */
  readonly components: Record<string, unknown>[] = [];
  private business?: { businessId: string; membershipId: string; member: Person };
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

  constructor(readonly kind: Suite, scenario: string, readonly setup: PreparedReaderSetup = {}) {
    this.label = `issue938/recovery-stage1/${kind}/${scenario}`;
    this.suite = defineE2eSuite(`r938-s1-${kind}-${scenario}-${randomUUID()}`);
    this.role = `r938_s1_${kind}`;
    this.cleanupReceipt = { label: this.label, role: this.role, database: "", keys: [], callers: 0, sourceReceipts: 0, campaignReceipts: 0,
      roleBackends: 0, roleAbsent: false, objectsEmpty: false, controlPreserved: false, guardModesRestored: false, failures: [] };
  }
  id(alias: string): string { return this.suite.id(alias); }
  /** Fixture-chosen ordered UUIDs: one case-unique prefix, zero-padded decimal index suffix. */
  orderedId(series: string, index: number): string {
    this.dependency(Number.isInteger(index) && index >= 0 && index < 1e12, "ordered_id_index", index);
    return `${this.id(series).slice(0, 24)}${String(index).padStart(12, "0")}`;
  }
  /** The injected diagnostic/identity clock. It only moves forward, to explicit case instants. */
  get clock(): Date { return new Date(this.now); }
  at(instant: Date): void {
    this.dependency(instant.valueOf() >= this.now.valueOf(), "clock_backwards", { from: this.now.toISOString(), to: instant.toISOString() });
    console.info("938_clock", { from: this.now.toISOString(), to: instant.toISOString() });
    this.now = new Date(instant);
  }
  advance(ms: number): void { this.dependency(Number.isInteger(ms) && ms > 0, "clock_advance", ms); this.at(new Date(this.now.valueOf() + ms)); }
  private dependency(condition: unknown, stage: string, detail?: unknown): asserts condition {
    if (!condition) throw new Error(`938_fixture_dependency:${stage}:${JSON.stringify(detail)}`);
  }
  private async caller<T>(work: () => Promise<T>): Promise<T> {
    this.dependency(this.accepting, "caller_after_close");
    const promise = work(); this.inFlight.add(promise);
    try { return await promise; } finally { this.inFlight.delete(promise); }
  }
  async send<T = unknown>(who: Person, method: "GET" | "POST" | "PUT", path: string, payload?: object | Buffer, sessionId?: string): Promise<Response<T>> {
    return this.caller(async () => {
      this.dependency(this.app && this.jwt, "http_not_initialized");
      const app = this.app, jwt = this.jwt;
      this.dependency(app && jwt, "http_not_initialized");
      const options = { method, url: `/api/v1/diagnostics/${path}`,
        headers: { authorization: `Bearer ${jwt.sign({ sub: this.actors[who].userId, sid: sessionId ?? this.actors[who].sessionId, role: "buyer" })}`,
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
    const expectedPostgresPort = expectedDiagnosticPostgresPort();
    const expectedRedisPort = expectedDiagnosticRedisPort();
    const expectedMinioPort = expectedDiagnosticMinioPort();
    this.dependency(expectedPostgresPort !== undefined, "expected_postgres_port", process.env["DIAGNOSTIC_EXPECTED_POSTGRES_PORT"]);
    this.dependency(expectedRedisPort !== undefined, "expected_redis_port", process.env["DIAGNOSTIC_EXPECTED_REDIS_PORT"]);
    this.dependency(expectedMinioPort !== undefined, "expected_minio_port", process.env["DIAGNOSTIC_EXPECTED_MINIO_PORT"]);
    const ownership = diagnosticPreparedReaderOwnership({ databaseUrl, expectedDatabaseUrl: expected.databaseUrl, redisUrl: process.env["REDIS_URL"], expectedRedisUrl: expected.redisUrl,
      minioEndpoint: process.env["MINIO_ENDPOINT"], bucket: process.env["DIAGNOSTIC_PRIVATE_BUCKET"], expectedPostgresPort, expectedRedisPort, expectedMinioPort });
    this.dependency(ownership.workerUrls, "worker_urls");
    this.dependency(ownership.ownedWorkerDatabase, "owned_worker_database");
    this.dependency(ownership.ownedRedisDb1, "owned_redis_db1");
    this.dependency(ownership.ownedStorage, "owned_storage");
    const url = new URL(expected.databaseUrl);
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
    } } }) as unknown as PrismaService : this.kind === "capture" ? client.$extends({ query: { diagnosticOwnershipComponent: {
      // Observation only: records the create data the original suite asserted, then performs the identical write.
      create: async ({ args, query }) => { this.components.push(structuredClone(args.data) as Record<string, unknown>); return query(args); },
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
        syntheticAllowed: ({ userId }: { userId: string }) => Object.values(this.actors).some(actor => actor.userId === userId) });
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
    // #939 reviewer-first cases give the reviewer the earliest deadline instead.
    const order = this.setup.qualificationOrder === "reviewer-first"
      ? ["reviewer", "technicianB", "technicianA", "foreign", "reception"] as const
      : ["technicianB", "technicianA", "foreign", "reviewer", "reception"] as const;
    for (const person of order) {
      const capability = capabilities[person]; this.dependency(capability, "capability_missing"); await this.bootstrap(person, capability);
    }
    await this.bootstrap("reception", "diagnostics.templates");
    this.centerId = (await this.db.diagnosticCenter.findUniqueOrThrow({ where: { code: `synthetic-${this.id("center")}` } })).id;
    const template = await this.admitted<D.DiagnosticTemplate>("reception", `centers/${this.centerId}/templates`, { expectedVersion: 0, synthetic: true,
      definition: { title: localized, limitations: localized, syntheticNotice: localized, checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] } });
    this.templateId = template.id;
    console.info("938_fixture_registry", { label: this.label, actors: this.actors, centerId: this.centerId, templateId: this.templateId, guards: this.guards, controlKey: this.controlKey });
  }

  /** `business` (#940 H2) publishes the public Listing for the current Business graph, with commissionerB as its seller. */
  async arrived(alias: string, publicVisit = false, business = false): Promise<Visit> {
    const commissioner: Person = publicVisit && alias === "A" ? "commissionerA" : "commissionerB";
    // B is the candidate visit; A and every other predecessor alias use the distinct A technician.
    const technician: Person = alias === "B" ? "technicianB" : "technicianA";
    let listingId: string | undefined;
    if (publicVisit) {
      if (await this.db.brand.count({ where: { id: this.suite.catalog.brandId } }) === 0) await seedSuiteCatalog(this.db, this.suite);
      listingId = this.id(`listing-${alias}`);
      await new PrismaListingRepository(this.db).save(Listing.create({ id: listingId, publicNumber: 0, sellerId: this.actors[commissioner].userId,
        status: "active", brandId: this.suite.catalog.brandId, modelId: this.suite.catalog.modelId, cityId: this.suite.catalog.cityId, year: 2020, vin: "SYN-123",
        priceAmount: 100000, priceCurrency: "TMT", allowCalls: false, allowChat: true, publishedAt: this.now, ...(business ? { businessId: this.currentBusiness(commissioner).businessId } : {}) }));
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
  async material(visit: Visit, rights: MaterialRights = {}): Promise<void> {
    this.dependency(visit.raw, "raw_before_material");
    const raw = visit.raw;
    const provenanceId = this.id(`provenance-${visit.order.id}`);
    const key = `diagnostic-evidence/${provenanceId}/${image.sha256}`;
    this.objects.set(key, { sha256: image.sha256, sizeBytes: image.sizeBytes });
    await this.admitted(visit.technician, `orders/${visit.order.id}/identity-provenance`, { id: provenanceId, expectedOrderVersion: visit.order.version, contentType: "image/png", sizeBytes: 95, rights: rightsUntil(rights.provenance) });
    const uploaded = await this.send(visit.technician, "PUT", `orders/${visit.order.id}/identity-provenance/${provenanceId}?expectedOrderVersion=${visit.order.version}`, Buffer.from(image.input, "base64"));
    this.dependency(uploaded.status === 200, "provenance_upload", uploaded);
    const stored = await this.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: provenanceId } });
    this.dependency(stored.objectKey === key && stored.sha256 === image.sha256 && stored.sizeBytes === 72, "stored_object_descriptor", stored);
    this.record(await this.persisted(visit.order.id), "provenance stage-upload", visit.order.audience === "listing_public" ? 7 : 6);
    const evidence = await this.admitted<D.DiagnosticIdentityEvidence>(visit.technician, `orders/${visit.order.id}/identity-evidence`, {
      id: this.id(`evidence-${visit.order.id}`), expectedOrderVersion: visit.order.version, identityRecordId: raw.id,
      identifiers: [{ kind: "vin_stamp", location: "Synthetic plate", value: "SYN-123", provenanceIds: [provenanceId] }], rights: rightsUntil(rights.evidence), correction: null,
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
  async pair(publicVisit = false, ownershipRights?: object, rights: { a?: MaterialRights; b?: MaterialRights } = {}) {
    const a = await this.arrived("A", publicVisit);
    await this.observe(a, { observedAt: "2026-10-21T12:00:00.000Z", mileageKm: 123000, method: "vin", vin: "SYN-123", manualReference: null }, ownershipRights);
    await this.material(a, rights.a); const report = await this.release(a);
    const b = await this.candidate(publicVisit, ownershipRights, rights.b);
    return { a, b, report };
  }
  /** The retained B visit used by pair(), alone. */
  async candidate(publicVisit = false, ownershipRights?: object, rights?: MaterialRights): Promise<Visit> {
    const b = await this.arrived("B", publicVisit);
    await this.observe(b, { observedAt: "2026-10-22T12:00:00.000Z", mileageKm: 124100, method: "vin", vin: "SYN-123", manualReference: null }, ownershipRights);
    await this.material(b, rights);
    return b;
  }
  /** A finalized private predecessor whose report id is orderedId("predecessor", index). */
  async predecessor(index: number, rights?: MaterialRights): Promise<{ visit: Visit; report: D.DiagnosticReportRecord }> {
    const visit = await this.arrived(`P${index}`);
    await this.observe(visit, preparedPredecessorObservation);
    await this.material(visit, rights);
    return { visit, report: await this.release(visit, this.orderedId("predecessor", index)) };
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
  /** Reviewer-first cases: move the clock to the reviewer's persisted deadline while both technicians stay qualified. */
  async expireReviewerQualification(): Promise<void> {
    this.dependency(this.setup.qualificationOrder === "reviewer-first", "reviewer_first_required");
    const until = async (person: Person, capability: string) => (await this.db.diagnosticCenterAssignment.findUniqueOrThrow({
      where: { centerId_userId_capability: { centerId: this.centerId, userId: this.actors[person].userId, capability } } })).qualifiedUntil;
    const reviewerUntil = await until("reviewer", "diagnostics.reviewer");
    const technicianUntil = [await until("technicianB", "diagnostics.technician"), await until("technicianA", "diagnostics.technician")];
    this.dependency(reviewerUntil && technicianUntil.every(t => t && t > reviewerUntil), "reviewer_first_deadlines", { reviewerUntil, technicianUntil });
    this.at(reviewerUntil);
  }
  /** Move the clock to one visit's persisted, predeclared material rights deadline. */
  async expireVisitRights(visit: Visit, kind: "provenance" | "evidence", declared: Date): Promise<void> {
    this.dependency(visit.provenanceId && visit.evidence, "rights_material");
    const evidenceId = visit.evidence.id, provenanceId = visit.provenanceId;
    const persisted = kind === "provenance"
      ? (await this.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: provenanceId } })).rightsUntil
      : (await this.db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: evidenceId } })).rightsUntil;
    this.dependency(persisted && persisted.valueOf() === declared.valueOf() && persisted > this.now, "visit_rights_deadline", { kind, persisted, declared });
    this.at(persisted);
  }
  /** Proof rights end at their earliest bound material deadline; move the clock to the persisted proof deadline. */
  async expireProofRights(proofId: string, earliestBound: Date): Promise<void> {
    const proof = await this.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    this.dependency(proof.rightsUntil.valueOf() === earliestBound.valueOf() && proof.rightsUntil > this.now, "proof_rights_deadline", { proof: proof.rightsUntil, earliestBound });
    this.at(proof.rightsUntil);
  }
  /** #939 F16/F17 supplemental, read-only: the persisted deadlines of one issued pair. These are the A/B provenance
   * and evidence rights, the reviewer/technician qualifications, current assignments and Sessions, and the proof. */
  async pairDeadlines(a: Visit, b: Visit, proofId: string) {
    const material = async (visit: Visit) => {
      this.dependency(visit.provenanceId && visit.evidence, "rights_material");
      const provenance = await this.db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id: visit.provenanceId } });
      const evidence = await this.db.diagnosticIdentityEvidence.findUniqueOrThrow({ where: { id: visit.evidence.id } });
      return { provenance: provenance.rightsUntil, evidence: evidence.rightsUntil };
    };
    const qualification = async (person: Person, capability: string) => (await this.db.diagnosticCenterAssignment.findUniqueOrThrow({
      where: { centerId_userId_capability: { centerId: this.centerId, userId: this.actors[person].userId, capability } } }));
    const assignment = async (visit: Visit, person: Person, capability: string) => (await this.db.diagnosticOrderAssignment.findUniqueOrThrow({
      where: { orderId_userId_capability: { orderId: visit.order.id, userId: this.actors[person].userId, capability } } })).revokedAt;
    const session = async (person: Person) => {
      const row = await this.db.session.findUniqueOrThrow({ where: { id: this.actors[person].sessionId } });
      return { expiresAt: row.expiresAt, elevatedUntil: row.adminTotpExpiresAt };
    };
    const proof = await this.db.diagnosticContinuityProof.findUniqueOrThrow({ where: { id: proofId } });
    const reviewer = await qualification("reviewer", "diagnostics.reviewer"), technicianA = await qualification("technicianA", "diagnostics.technician"),
      technicianB = await qualification("technicianB", "diagnostics.technician");
    return {
      now: this.clock, a: await material(a), b: await material(b),
      qualifications: { reviewer: reviewer.qualifiedUntil, technicianA: technicianA.qualifiedUntil, technicianB: technicianB.qualifiedUntil },
      qualificationRevocations: [reviewer.revokedAt, technicianA.revokedAt, technicianB.revokedAt],
      assignmentRevocations: [await assignment(a, "reviewer", "diagnostics.reviewer"), await assignment(b, "reviewer", "diagnostics.reviewer"),
        await assignment(a, "technicianA", "diagnostics.technician"), await assignment(b, "technicianB", "diagnostics.technician")],
      sessions: { reviewer: await session("reviewer"), technicianB: await session("technicianB") },
      proof: { rightsUntil: proof.rightsUntil, invalidatedAt: proof.invalidatedAt, consumedAt: proof.consumedAt, erasedAt: proof.erasedAt },
    };
  }
  /** Lawful invalidation: an issuer Identity change fires the continuity source trigger for every unconsumed proof. */
  async invalidateIssuedProofs(visit: Visit, expected: number): Promise<void> {
    await new PrismaUserRepository(this.db).updateDisplayName(this.actors.reviewer.userId, `reviewer-invalidation-${randomUUID()}`);
    const proofs = await this.db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: visit.order.id } });
    this.dependency(proofs.length === expected && proofs.every(proof => proof.invalidatedAt !== null), "proof_invalidation", proofs.map(p => ({ id: p.id, invalidatedAt: p.invalidatedAt })));
  }
  /** #940 H2 public Business observation. `grantor` issues the ownership grant through the ordinary route;
   * null observes with the separate classification only (no grant), as the original suite does. */
  async observeBusiness(visit: Visit, observation: Omit<D.DiagnosticObservedVehicle, "expectedVersion">, ownershipRights: object, grantor: Person | null): Promise<D.DiagnosticOrder> {
    this.dependency(visit.order.audience === "listing_public" && this.business, "business_public_visit");
    this.dependency(await this.db.diagnosticIdentityRecord.count({ where: { orderId: visit.order.id } }) === 0, "grant_before_first_raw");
    let grant: { id: string } | undefined;
    if (grantor) {
      grant = await this.admitted(grantor, `orders/${visit.order.id}/ownership-grant`, { rights: ownershipRights });
      this.record(await this.persisted(visit.order.id), "grant before first raw", 6);
    } else {
      this.dependency(await this.db.diagnosticOwnershipGrant.count({ where: { orderId: visit.order.id } }) === 0, "business_no_ownership_grant");
      this.record(await this.persisted(visit.order.id), "no ownership grant", 6);
    }
    visit.order = await this.admitted(visit.technician, `orders/${visit.order.id}/vehicle`, { expectedVersion: visit.order.version, ...observation,
      ...(grant ? { ownershipGrantId: grant.id } : {}), ownershipClassification: { rights: ownershipRights } });
    this.record(visit.order, "first raw", 7);
    return visit.order;
  }
  /** On-demand operator/Business actor: an ordinary verified User with an elevated current Session. */
  private async operator(person: Operator): Promise<{ userId: string; sessionId: string }> {
    const existing = this.actors[person] as { userId: string; sessionId: string } | undefined;
    if (existing) return existing;
    const index = people.length + operators.indexOf(person);
    const users = new PrismaUserRepository(this.db), sessions = new PrismaSessionRepository(this.db, new BcryptHasherAdapter());
    const user = await users.create({ phone: this.suite.phone(person), phoneVerifiedAt: this.now, email: null, emailVerifiedAt: null }, { nameNumber: 1000 + index, avatarIndex: index });
    const session = await sessions.create({ userId: user.id, refreshTokenHash: this.id(`${person}-refresh`), deviceLabel: this.label, userAgent: this.label, expiresAt: new Date("2027-01-01T00:00:00.000Z") });
    await sessions.updateAdminTotpExpiresAt(session.id, new Date("2027-01-01T00:00:00.000Z"));
    await users.updateDisplayName(user.id, person);
    const actor = { userId: user.id, sessionId: session.id };
    this.actors[person] = actor;
    console.info("940_operator_actor", { person, ...actor });
    return actor;
  }
  /** Repository operator commands, run as the restricted runtime role exactly like the staff bootstrap. */
  private async operatorCommand(argv: string[]): Promise<void> {
    const env = { ...process.env, DATABASE_URL: this.runtimeUrl, APP_ENV: "test", DIAGNOSTIC_SYNTHETIC_ENABLED: "true",
      DIAGNOSTIC_SYNTHETIC_USER_IDS: JSON.stringify(people.map(p => this.actors[p].userId)) };
    const startedAt = new Date().toISOString();
    const result = await run("pnpm", argv, { cwd: resolve(process.cwd(), "../.."), env, maxBuffer: 1024 * 1024 });
    console.info("940_operator_command", { argv, startedAt, endedAt: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr });
  }
  /** Task-local table privileges for one named lawful producer; DROP OWNED at close removes them with the role. */
  private async taskGrants(purpose: string, grants: Record<string, string[]>): Promise<void> {
    const environment = this.environment;
    this.dependency(environment, "environment_connection");
    for (const [verbs, tables] of Object.entries(grants)) for (const table of tables) {
      await environment.query(`GRANT SELECT,${verbs} ON public.${quote(table)} TO ${quote(this.role)}`);
    }
    console.info("940_task_grants", { role: this.role, purpose, grants });
  }
  private get identityClock(): ClockLike { return { now: () => new Date(this.now) }; }
  private currentBusiness(member: Person): { businessId: string; membershipId: string } {
    this.dependency(this.business && this.business.member === member, "business_graph_required", { member });
    return this.business;
  }
  /** #940 H2 lawful Business graph: a bootstrapped founder.admission founder admits a synthetic Business, its
   * owner redeems the owner invitation, then invites `member` as sales and that member redeems it. */
  async businessMember(member: Person = "commissionerB"): Promise<{ businessId: string; membershipId: string }> {
    this.dependency(!this.business, "business_graph_exists");
    await this.taskGrants("business-admission-and-membership", { "INSERT,UPDATE": ["dealerships", "dealership_invitations", "dealership_members"] });
    const founder = await this.operator("founder"), owner = await this.operator("owner");
    await this.operatorCommand(["--filter", "@auto-tm/db", "staff:bootstrap", "--user-id", founder.userId, "--capability", "founder.admission", "--reason", "Issue 940 owned synthetic fixture"]);
    const repository = new PrismaBusinessRepository(this.db), tokens = new NodeBusinessInvitationTokens(), clock = this.identityClock;
    const admitted = await new AdmitBusiness(repository, clock, tokens).execute({ ...founder, name: "Synthetic Business", slug: `synthetic-${this.id("business")}`,
      ownerUserId: owner.userId, mode: "synthetic", evidence: "SYNTHETIC fixture Business; no real business verified", reason: "Issue 940 owned synthetic fixture" });
    const redeemOwner = await new RedeemBusinessInvitation(repository, clock, tokens).execute({ ...owner, token: admitted.token });
    this.dependency(redeemOwner.businessId === admitted.businessId, "business_owner_redeem", redeemOwner);
    const invited = await new InviteBusinessMember(repository, clock, tokens).execute({ ...owner, businessId: admitted.businessId, recipientUserId: this.actors[member].userId });
    const redeemMember = await new RedeemBusinessInvitation(repository, clock, tokens).execute({ ...this.actors[member], token: invited.token });
    this.dependency(redeemMember.businessId === admitted.businessId, "business_member_redeem", redeemMember);
    const business = await this.db.dealership.findUniqueOrThrow({ where: { id: admitted.businessId }, include: { members: true } });
    const membership = business.members.find(row => row.userId === this.actors[member].userId);
    this.dependency(business.status === "active" && business.admissionMode === "synthetic" && membership?.role === "sales" && membership.status === "active"
      && business.members.some(row => row.userId === owner.userId && row.role === "owner" && row.status === "active"), "business_graph", business);
    this.business = { businessId: business.id, membershipId: membership.id, member };
    console.info("940_business_graph", { businessId: business.id, founder: founder.userId, owner: owner.userId, member: this.actors[member].userId, membershipId: membership.id,
      ownerInvitationId: admitted.invitationId, memberInvitationId: invited.invitationId });
    return { businessId: business.id, membershipId: membership.id };
  }
  /** The Business owner suspends or removes the member through the ordinary membership change. */
  async changeBusinessMember(action: "suspend" | "remove"): Promise<void> {
    const business = this.business;
    this.dependency(business, "business_graph_required");
    const owner = await this.operator("owner");
    await new ChangeBusinessMembership(new PrismaBusinessRepository(this.db), this.identityClock).execute({ ...owner, businessId: business.businessId, targetUserId: this.actors[business.member].userId, action });
    const current = await this.db.dealershipMember.findUnique({ where: { userId: this.actors[business.member].userId } });
    this.dependency(action === "remove" ? current === null : current?.id === business.membershipId && current.status === "suspended", "business_member_change", { action, current });
    console.info("940_business_member_change", { action, businessId: business.businessId, membershipId: business.membershipId });
  }
  /** Current staff grant loss through ChangeStaffGrant, by a bootstrapped staff.manage actor with an elevated Session. */
  async revokeStaffGrant(target: Person, capability: string): Promise<void> {
    const manager = await this.operator("staffManager");
    if (await this.db.staffGrant.count({ where: { userId: manager.userId, capability: "staff.manage", revokedAt: null } }) === 0) {
      await this.operatorCommand(["--filter", "@auto-tm/db", "staff:bootstrap", "--user-id", manager.userId, "--capability", "staff.manage", "--reason", "Issue 940 owned synthetic fixture"]);
    }
    const clock = this.identityClock;
    await new ChangeStaffGrant(new PrismaStaffAuthority(this.db, clock), clock).execute({ ...manager, targetUserId: this.actors[target].userId, capability, reason: "Issue 940 synthetic current grant loss", grant: false });
    const grant = await this.db.staffGrant.findUnique({ where: { userId_capability: { userId: this.actors[target].userId, capability } } });
    this.dependency(grant?.revokedAt, "staff_grant_revoked", grant);
    console.info("940_staff_grant_revoked", { target: this.actors[target].userId, capability, revokedAt: grant.revokedAt, by: manager.userId });
  }
  /** Current Identity inactivity: an operator-promoted admin suspends the user through the SuspendUser use case.
   * The AdminGuard role check is repeated; its HTTP route is outside the diagnostics test module. */
  async suspendUser(target: Person): Promise<void> {
    const admin = await this.operator("admin");
    await this.operatorCommand(["--filter", "@auto-tm/db", "admin:promote", "--phone", this.suite.phone("admin"), "--reason", "Issue 940 owned synthetic moderator"]);
    this.dependency(await new PrismaIdentityCheckAdapter(this.db).isAdmin(admin.userId), "admin_role");
    const result = await new SuspendUser(this.db, new PrismaIdentityReadAdapter(this.db), new PrismaIdentityAdminRepository(this.db), new PrismaContentReportRepository(this.db),
      new PrismaAuditLogRepository(this.db), new PrismaConversationRepository(this.db)).execute({ userId: this.actors[target].userId, adminUserId: admin.userId, reason: "Issue 940 synthetic inactive Identity" });
    this.dependency(result.targetId === this.actors[target].userId && result.targetState.suspendedById === admin.userId, "user_suspended", result);
    console.info("940_user_suspended", { target: result.targetId, suspendedAt: result.targetState.suspendedAt, by: admin.userId, auditLogId: result.auditLogId });
  }
  /** A second current Session for the same actor, through the ordinary Session repository. */
  async secondSession(person: Person): Promise<string> {
    const sessions = new PrismaSessionRepository(this.db, new BcryptHasherAdapter());
    const session = await sessions.create({ userId: this.actors[person].userId, refreshTokenHash: this.id(`${person}-second-refresh`), deviceLabel: this.label, userAgent: this.label, expiresAt: new Date("2027-01-01T00:00:00.000Z") });
    await sessions.updateAdminTotpExpiresAt(session.id, new Date("2027-01-01T00:00:00.000Z"));
    return session.id;
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
  async assign(visit: Visit, who: Person, active: boolean, capability = "diagnostics.technician"): Promise<D.DiagnosticOrder> {
    visit.order = await this.admitted("reception", `orders/${visit.order.id}/assignments`, { expectedVersion: visit.order.version,
      userId: this.actors[who].userId, capability, active });
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
  options: { partialFailure?: boolean; cleanup?: (receipt: PreparedReaderCleanup) => void } & PreparedReaderSetup = {}): Promise<T> {
  const fixture = new DiagnosticPreparedReaderFixture(kind, scenario, options.qualificationOrder ? { qualificationOrder: options.qualificationOrder } : {});
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
