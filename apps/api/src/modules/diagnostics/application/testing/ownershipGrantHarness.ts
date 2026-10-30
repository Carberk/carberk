import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import type { DiagnosticSourceCommand, PrismaService, Prisma } from "@auto-tm/db";
import type { BusinessAuthorityPort, PublisherBindingPort, StaffAuthorityPort } from "../../../identity/identity.public";
import { DiagnosticAuthority } from "../../infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "../../infrastructure/campaignDiagnosticAdmission";
import { DiagnosticPublicBindings } from "../../infrastructure/DiagnosticPublicBindings";
import { PrismaDiagnosticIntake } from "../../infrastructure/PrismaDiagnosticIntake";
import { DiagnosticOwnershipCapture } from "../../infrastructure/DiagnosticOwnershipCapture";

const now = new Date("2026-10-23T12:00:00.000Z");
export const rights: D.DiagnosticIdentityRights = { category: "vehicle_observation", purpose: "Restricted ownership comparison", basis: "Explicit seller grant",
  provenance: "Authenticated seller supplies this grant", identifiability: "personal", use: ["service"],
  schedule: { kind: "until", until: "2026-11-23T12:00:00.000Z", reason: "Seller supplied end" }, supplierRestrictions: "Service comparison only", hold: null };
/** Finite database boundary responses for caller orchestration only. No SQL semantics. */
export function diagnosticProtocol(options: {
  changed?: boolean;
  scope?: () => unknown[];
  project?: (table: string, key: { id: string }) => unknown;
  prepared?: (command: DiagnosticSourceCommand) => void;
} = {}) {
  let reads = 0;
  let command: DiagnosticSourceCommand | undefined;
  const events: string[] = [];
  return {
    events,
    command: () => command,
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("diagnostic_source_project")) {
        const source = options.project?.(String(values[0]), JSON.parse(String(values[1])) as { id: string }) ?? null;
        return [{ source, next: { ...source as object, ...JSON.parse(String(values.at(-1))) } }];
      }
      if (sql.includes("diagnostic_source_scope")) {
        reads++; events.push("discover");
        return [{ scope: [{ table: "inspection_orders", key: { id: options.changed && reads > 1 ? "replaced" : "visit" } }, { table: "listings", key: { id: "retained-listing" } }], keys: [], campaigns: [], mutations: [] }];
      }
      if (sql.includes("diagnostic_source_registry")) return [{ table: "listings", namespace: 897500 }, { table: "inspection_orders", namespace: 897600 }];
      if (sql.includes("pg_advisory_xact_lock")) events.push(`keys:${values[1]}`);
      if (sql.includes("diagnostic_assert_source") && (values[0] !== "owned-receipt" || values[1] !== (command?.operation ?? "order_change"))) throw new Error("diagnostic_source_receipt");
      if (sql.includes("campaign_prepare")) return [{ receipt: "campaign-receipt" }];
      if (sql.includes("diagnostic_prepare_source")) {
        command = JSON.parse(String(values[0])) as DiagnosticSourceCommand;
        options.prepared?.(command);
        return [{ receipt: "owned-receipt" }];
      }
      if (sql.includes("SELECT scope FROM")) return [{ scope: options.scope?.() ?? [...(command?.roots ?? []), ...(command?.rows ?? [])] }];
      return [];
    },
    $queryRawUnsafe: async (sql: string, key: string) => { events.push(`${sql.includes("public.listings") ? "listing" : "order"}:${key}`); return []; },
    $executeRawUnsafe: async () => 0,
  };
}

export function harness() {
  const row = { id: "00000000-0000-4000-8000-000000000001", centerId: "00000000-0000-4000-8000-000000000002", templateVersionId: "00000000-0000-4000-8000-000000000003", version: 0, status: "arrived", createdAt: now, updatedAt: now, observedVehicle: null, physicalAuthorization: null, publicationAuthorization: null, associationValidatedAt: null, audience: "listing_public", listingId: "listing", commissionerId: "seller", synthetic: true, erasedAt: null };
  const listing = { id: "listing", sellerId: "seller", businessId: null, deletedAt: null, vin: "VIN", brandId: "brand", modelId: "model", year: 2020 };
  const users = ["seller", "technician", "other"].map(id => ({ id, phoneVerifiedAt: now, emailVerifiedAt: null, suspendedAt: null as Date | null, deletionScheduledAt: null }));
  const grants: Prisma.DiagnosticOwnershipGrantGetPayload<object>[] = [];
  const audits: Record<string, unknown>[] = [];
  const components: Record<string, unknown>[] = [];
  const raws: { id: string; orderId: string; orderVersion: number; ownership?: { state: string; rightsUntil: Date } }[] = [];
  let clock = now;
  let executionTime: Date | undefined;
  const protocol = diagnosticProtocol({
    scope: () => [...(protocol.command()?.roots ?? []), ...(protocol.command()?.rows ?? []), { table: "diagnostic_centers", key: { id: row.centerId } }],
    project: (table, key) => table === "diagnostic_ownership_grants" ? grants.find(grant => grant.id === key.id) : table === "inspection_orders" ? row : null,
    prepared: () => { if (executionTime) clock = executionTime; },
  });
  const tx = {
    ...protocol,
    inspectionOrder: { findUnique: async () => row, findMany: async () => [row], update: async ({ data }: { data: object }) => Object.assign(row, data) },
    diagnosticOrderAssignment: { findMany: async () => [{ capability: "diagnostics.technician" }] },
    diagnosticCenterAssignment: { findUnique: async () => ({ qualifiedUntil: new Date("2027-01-01"), revokedAt: null }) },
    diagnosticAudit: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
    listing: { findUnique: async () => listing },
    user: { findUnique: async ({ where }: { where: { id: string } }) => users.find(u => u.id === where.id), findMany: async () => users },
    dealershipMember: { findUnique: async () => null },
    diagnosticIdentityRecord: { create: async ({ data }: { data: typeof raws[number] }) => { raws.push(data); return data; }, findFirst: async () => raws[0] ?? null, findMany: async ({ where }: { where: { orderVersion: { lt: number } } }) => raws.filter(r => r.orderVersion < where.orderVersion.lt) },
    diagnosticOwnershipGrant: {
      findMany: async () => grants,
      findUnique: async ({ where }: { where: { id?: string; orderId?: string } }) => grants.find(g => where.id ? g.id === where.id : g.orderId === where.orderId) ?? null,
      create: async ({ data }: { data: Prisma.DiagnosticOwnershipGrantGetPayload<object> }) => { grants.push({ ...data, erasedAt: null }); return data; },
    },
    diagnosticOwnershipComponent: { create: async ({ data }: { data: Record<string, unknown> }) => { components.push(data); return data; } },
  };
  const db = { $transaction: async <T>(work: (value: typeof tx) => Promise<T>) => {
    const original = { ...row }, lengths = [grants.length, raws.length, components.length, audits.length];
    try { return await work(tx); }
    catch (error) { Object.assign(row, original); [grants.length, raws.length, components.length, audits.length] = lengths as [number, number, number, number]; throw error; }
  } } as unknown as PrismaService;
  const business: BusinessAuthorityPort = {
    resolve: async subject => { if (subject.sessionId !== `${subject.userId}-session`) throw new Error("invalid session"); return { kind: "personal", userId: subject.userId }; },
    authorize: async () => { throw new Error("not a dealer"); },
  };
  const staff: StaffAuthorityPort = { authorize: async () => ({}) } as unknown as StaffAuthorityPort;
  const publishers: PublisherBindingPort = { lock: async input => input, bind: async () => { throw new Error("no publisher lookup needed"); } };
  const runtime = { now: () => clock, id: () => "grant", syntheticAllowed: () => true };
  const authority = new DiagnosticAuthority(staff, business, runtime, new CampaignDiagnosticAdmission(new ConfigService()));
  const intake = new PrismaDiagnosticIntake(db, authority, business, new DiagnosticPublicBindings(publishers), runtime);
  const subject = (userId = "seller") => ({ userId, sessionId: `${userId}-session` });
  const append = (grantId?: string, classification?: D.DiagnosticOwnershipClassification) => DiagnosticOwnershipCapture.append(tx as unknown as Prisma.TransactionClient,
    row as unknown as Prisma.InspectionOrderGetPayload<object>, "raw", 7, "technician", now, classification, grantId);
  return { intake, subject, row, audits, grants, components, raws, listing, users, append, protocol, executeAt: (at: Date) => { executionTime = at; } };
}
