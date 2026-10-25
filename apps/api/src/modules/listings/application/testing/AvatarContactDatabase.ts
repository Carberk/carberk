import type { PrismaService } from "@auto-tm/db";

type Row = Record<string, unknown>;
const copy = <T>(value: T): T => structuredClone(value);
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const namespaces: Record<string, number> = { users: 897100, dealerships: 897200, dealership_members: 897300,
  listings: 897400, sessions: 897705, media_uploads: 898100, media_upload_cleanups: 898106,
  listing_media: 898107, audit_logs: 898300, content_reports: 898302, verified_contact_phones: 898314 };

/** An atomic database boundary fake. It enforces entry admission and injected
 * failures only. It does not simulate PostgreSQL constraints, locks or triggers. */
export class AvatarContactDatabase {
  tables: Record<string, Row[]> = Object.fromEntries(Object.keys(namespaces).map(t => [t, []]));
  mutations: Row[] | undefined;
  requiredInitialUsers: string[] = [];
  receiptIdentity = { id: "receipt", backend_pid: 1, full_transaction_id: "transaction" };
  failAt: string | undefined;
  afterPreparation: (() => void) | undefined;
  private prepared = false;
  readonly service = this as unknown as PrismaService;
  rows(table: string): Row[] { return this.tables[table] ?? []; }
  seed(table: string, row: Row): void { this.rows(table).push(copy(row)); }
  row(table: string, id: string): Row | undefined { return this.rows(table).find(r => r["id"] === id || r["uploadId"] === id); }
  requiredRow(table: string, id: string): Row {
    const row = this.row(table, id);
    if (!row) throw new Error(`missing ${table} row`);
    return row;
  }
  private boundary(name: string): void {
    if (!this.prepared) throw new Error("campaign_preparation_missing");
    if (this.failAt === name) throw new Error(`refused:${name}`);
  }
  async $transaction<T>(work: (tx: AvatarContactDatabase) => Promise<T>): Promise<T> {
    const before = copy(this.tables);
    try { return await work(this); }
    catch (error) { this.tables = before; throw error; }
    finally { this.prepared = false; this.mutations = undefined; }
  }
  async $queryRaw(sql: TemplateStringsArray | { sql: string; values: unknown[] }, ...tagValues: unknown[]): Promise<unknown[]> {
    const text = Array.isArray(sql) ? sql.join("?") : (sql as { sql: string }).sql;
    const values = Array.isArray(sql) ? tagValues : (sql as { values: unknown[] }).values;
    if (text.includes("campaign_prepare(")) {
      if (this.failAt === "prepare") throw new Error("refused:prepare");
      if (this.prepared) throw new Error("campaign_preparation_nested");
      this.prepared = true;
      this.mutations = JSON.parse(String(values[0])) as Row[];
      if (!this.mutations.length) throw new Error("campaign_preparation_shape");
      for (const mutation of this.mutations) {
        const key = mutation["key"] as Row;
        const exists = this.rows(String(mutation["table"])).some(r => Object.entries(key).every(([k, v]) => r[k] === v));
        if ((mutation["verb"] === "insert") === exists) throw new Error("campaign_preparation_stale");
      }
      this.afterPreparation?.();
      return [{ receipt: "receipt" }];
    }
    if (text.includes("campaign_finish(")) { this.boundary("finish"); this.prepared = false; return []; }
    if (text.includes("FROM public.campaign_preparations")) return this.prepared ? [{ ...this.receiptIdentity, mutations: this.mutations }] : [];
    if (text.includes("diagnostic_source_read")) {
      const key = JSON.parse(String(values[1])) as Row;
      return [{ row: json(this.rows(String(values[0])).find(r => Object.entries(key).every(([k, v]) => r[k] === v)) ?? null) }];
    }
    if (text.includes("diagnostic_source_lock_keys(")) throw new Error("diagnostic_intake_reception_selection");
    if (text.includes("diagnostic_source_lock_keys_before_intake(")) {
      const slots = JSON.parse(String(values[0])) as { table: string; key: { id?: string } }[];
      for (const id of this.requiredInitialUsers) {
        if (!slots.some(s => s.table === "users" && s.key.id === id)) throw new Error(`missing initial User dependency:${id}`);
      }
      return [{ keys: [...new Set(slots.map(s => namespaces[s.table]))].map(namespace => ({ namespace, key: 1 })) }];
    }
    if (text.includes("diagnostic_source_meta")) {
      const refs: Record<string, { table: string; columns: string[]; target: string[] }[]> = {
        users: [{ table: "users", columns: ["suspendedById"], target: ["id"] }, { table: "media_uploads", columns: ["avatarUploadId"], target: ["id"] }],
        media_uploads: [{ table: "users", columns: ["userId"], target: ["id"] }, { table: "dealerships", columns: ["businessId"], target: ["id"] }],
        listings: [{ table: "users", columns: ["sellerId"], target: ["id"] }],
      };
      return [{ namespace: namespaces[String(values[0])], refs: refs[String(values[0])] ?? [] }];
    }
    if (text.includes("FOR UPDATE") || text.includes("pg_advisory_xact_lock")) this.boundary("lock");
    if (text.includes("SELECT 1 FROM public.") || text.includes("pg_advisory_xact_lock")) return [];
    if (text.includes("UNION ALL SELECT 'listing_media'")) return [
      ...this.rows("users").filter(r => r["avatarUploadId"] === values[0]).map(r => ({ table: "users", id: r["id"], listingId: null })),
      ...this.rows("listing_media").filter(r => r["uploadId"] === values[1]).map(r => ({ table: "listing_media", id: r["id"], listingId: r["listingId"] })),
    ];
    if (text.includes("AS total")) {
      const ids = values[0] as string[];
      return [{ total: BigInt(this.rows("users").filter(r => ids.includes(String(r["avatarUploadId"]))).length +
        this.rows("listing_media").filter(r => ids.includes(String(r["uploadId"]))).length) }];
    }
    if (text.includes("FROM media_uploads")) return copy(this.rows("media_uploads").filter(r => (values[0] as string[]).includes(String(r["id"]))));
    if (text.includes("FROM users") || text.includes('FROM "users"')) return copy(this.rows("users").filter(r => r["id"] === values[0]));
    if (text.includes('FROM "dealerships"')) return copy(this.rows("dealerships").filter(r => r["id"] === values[0]));
    if (text.includes("FROM verified_contact_phones")) return this.rows("verified_contact_phones").filter(r => r["sellerId"] === values[0] && r["phone"] === values[1]);
    if (text.includes("FROM dealership_members")) return this.rows("dealership_members").filter(r => r["userId"] === values[0] || (r["dealershipId"] === values[1] && r["role"] === "owner"));
    throw new Error(`Unhandled database query: ${text}`);
  }
  async $executeRaw(sql: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    const text = sql.join("?");
    if (text.includes("'ADOPTED'")) {
      this.boundary("adopt");
      for (const id of values[0] as string[]) Object.assign(this.requiredRow("media_uploads", id), { state: "ADOPTED", claimToken: null, claimDeadline: null });
    } else if (text.includes("'RETIRED'")) {
      this.boundary("retire");
      Object.assign(this.requiredRow("media_uploads", String(values[1])), { state: "RETIRED", retiredAt: values[0], claimToken: null, claimDeadline: null });
    } else if (text.includes("INSERT INTO media_upload_cleanups")) {
      this.boundary("cleanup");
      if (!this.row("media_upload_cleanups", String(values[0]))) this.seed("media_upload_cleanups", {
        uploadId: values[0], key: values[1], objectKeys: values[2], writeProtocol: values[3], status: values[4],
      });
    } else throw new Error(`Unhandled database write: ${text}`);
    return 1;
  }
  private model(table: string) {
    return {
      findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
        const row = this.rows(table).find(r => Object.entries(where).every(([key, value]) =>
          key === "sellerId_phone" ? Object.entries(value as Row).every(([k, v]) => r[k] === v) : r[key] === value));
        if (table === "sessions" && row && include) {
          const user = this.row("users", String(row["userId"]));
          return { ...row, user: { ...user, dealershipMemberships: this.rows("dealership_members").filter(r => r["userId"] === row["userId"]).map(r => ({ ...r, dealership: this.row("dealerships", String(r["dealershipId"])) })) } };
        }
        return row ?? null;
      },
      findMany: async ({ where }: { where: Row }) => this.rows(table).filter(r => Object.entries(where).every(([k, v]) => r[k] === v))
        .sort((a, b) => new Date(String(b["confirmedAt"])).getTime() - new Date(String(a["confirmedAt"])).getTime() || String(b["id"]).localeCompare(String(a["id"]))),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        this.boundary(table);
        const row = this.row(table, where.id);
        if (!row) throw new Error("missing row");
        Object.assign(row, data); return row;
      },
      create: async ({ data }: { data: Row }) => { this.boundary(table); const row = { ...data, createdAt: new Date() }; this.seed(table, row); return row; },
      upsert: async ({ where, create, update }: { where: { sellerId_phone: Row }; create: Row; update: Row }) => {
        this.boundary(table);
        const row = this.rows(table).find(r => r["sellerId"] === where.sellerId_phone["sellerId"] && r["phone"] === where.sellerId_phone["phone"]);
        if (row) { Object.assign(row, update); return row; }
        this.seed(table, create); return create;
      },
    };
  }
  get user() { return this.model("users"); }
  get dealership() { return this.model("dealerships"); }
  get dealershipMember() { return this.model("dealership_members"); }
  get session() { return this.model("sessions"); }
  get verifiedContactPhone() { return this.model("verified_contact_phones"); }
  get auditLog() { return this.model("audit_logs"); }
  get contentReport() { return this.model("content_reports"); }
}

export const NOW = new Date("2026-10-25T00:00:00Z");
export const clock = { now: () => NOW };
export function avatarDatabase(): AvatarContactDatabase {
  const db = new AvatarContactDatabase();
  for (const id of ["seller", "admin", "foreign"]) db.seed("users", { id, role: id === "admin" ? "admin" : "buyer", avatarUploadId: null, avatarKey: null,
    avatarIndex: 7, nameNumber: 1234, displayName: null, deletionScheduledAt: null, suspendedAt: null, locale: "en" });
  for (const [id, state] of [["old", "ADOPTED"], ["new", "PREPARING"], ["foreign-upload", "AVAILABLE"]]) db.seed("media_uploads", {
    id, userId: id === "foreign-upload" ? "foreign" : "seller", businessId: null, key: `${id}.webp`, state,
    claimToken: state === "PREPARING" ? "token" : null, claimTargetType: "profile", claimTargetId: "seller",
    writeProtocol: "conditional-v1", objectKeys: [`${id}.webp`, `${id}-thumb.webp`],
  });
  Object.assign(db.requiredRow("users", "seller"), { avatarUploadId: "old", avatarKey: "old.webp" });
  return db;
}

// Compose only these Identity exports using their real module bindings. Import
// Identity through its released module/public entry points. No Nest app, Redis,
// queue, HTTP server or storage adapter is instantiated by this test composition.
import { MODULE_METADATA } from "@nestjs/common/constants";
import { IdentityModule } from "../../../identity/identity.module";
import { BUSINESS_AUTHORITY_PORT, IDENTITY_READ_PORT, IDENTITY_ADMIN_PORT,
  type BusinessAuthorityPort, type IdentityReadPort, type IdentityAdminPort, type ClockPort } from "../../../identity/identity.public";

export function identityPorts(db: PrismaService, currentClock: ClockPort = clock) {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Array<{
    provide?: unknown; useClass?: unknown; useExisting?: unknown;
  }>;
  const implementation = (token: unknown) => {
    const provider = providers.find(p => p.provide === token);
    const type = provider?.useClass ?? provider?.useExisting;
    if (typeof type !== "function") throw new Error("missing actual Identity binding");
    return type;
  };
  const Repository = implementation("IDENTITY_BUSINESS_AUTHORITY_REPOSITORY") as new (db: PrismaService) => unknown;
  const Authority = implementation(BUSINESS_AUTHORITY_PORT) as new (repo: unknown, clock: ClockPort) => BusinessAuthorityPort;
  const Read = implementation(IDENTITY_READ_PORT) as new (db: PrismaService) => IdentityReadPort;
  const Admin = implementation(IDENTITY_ADMIN_PORT) as new (db: PrismaService) => IdentityAdminPort;
  return { authority: new Authority(new Repository(db), currentClock), read: new Read(db), admin: new Admin(db) };
}
