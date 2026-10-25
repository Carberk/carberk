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
export function harness() {
  const row = { id: "order", audience: "listing_public", listingId: "listing", commissionerId: "seller", synthetic: true, erasedAt: null };
  const listing = { id: "listing", sellerId: "seller", businessId: null, deletedAt: null, vin: "VIN", brandId: "brand", modelId: "model", year: 2020 };
  const users = ["seller", "technician", "other"].map(id => ({ id, phoneVerifiedAt: now, emailVerifiedAt: null, suspendedAt: null as Date | null, deletionScheduledAt: null }));
  const grants: Prisma.DiagnosticOwnershipGrantGetPayload<object>[] = [];
  const components: Record<string, unknown>[] = [];
  const raws: { id: string; orderId: string; orderVersion: number; ownership?: { state: string; rightsUntil: Date } }[] = [];
  let command: DiagnosticSourceCommand | undefined;
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("diagnostic_source_project")) {
        const table = String(values[0]), key = JSON.parse(String(values[1])) as { id: string };
        const source = table === "diagnostic_ownership_grants" ? grants.find(grant => grant.id === key.id) ?? null : null;
        return [{ source, next: { ...source, ...JSON.parse(String(values.at(-1))) } }];
      }
      if (sql.includes("diagnostic_prepare_source")) { command = JSON.parse(String(values[0])) as DiagnosticSourceCommand; return [{ receipt: "receipt" }]; }
      if (sql.includes("SELECT scope FROM")) return [{ scope: [...(command?.roots ?? []), ...(command?.rows ?? [])] }];
      return [];
    },
    inspectionOrder: { findUnique: async () => row, findMany: async () => [row] },
    listing: { findUnique: async () => listing },
    user: { findUnique: async ({ where }: { where: { id: string } }) => users.find(u => u.id === where.id), findMany: async () => users },
    dealershipMember: { findUnique: async () => null },
    diagnosticIdentityRecord: { findFirst: async () => raws[0] ?? null, findMany: async ({ where }: { where: { orderVersion: { lt: number } } }) => raws.filter(r => r.orderVersion < where.orderVersion.lt) },
    diagnosticOwnershipGrant: {
      findMany: async () => grants,
      findUnique: async ({ where }: { where: { id?: string; orderId?: string } }) => grants.find(g => where.id ? g.id === where.id : g.orderId === where.orderId) ?? null,
      create: async ({ data }: { data: Prisma.DiagnosticOwnershipGrantGetPayload<object> }) => { grants.push({ ...data, erasedAt: null }); return data; },
    },
    diagnosticOwnershipComponent: { create: async ({ data }: { data: Record<string, unknown> }) => { components.push(data); return data; } },
  };
  const db = { $transaction: async <T>(work: (value: typeof tx) => Promise<T>) => work(tx) } as unknown as PrismaService;
  const business: BusinessAuthorityPort = {
    resolve: async subject => { if (subject.sessionId !== `${subject.userId}-session`) throw new Error("invalid session"); return { kind: "personal", userId: subject.userId }; },
    authorize: async () => { throw new Error("not a dealer"); },
  };
  const staff: StaffAuthorityPort = { authorize: async () => { throw new Error("no staff authority"); } } as unknown as StaffAuthorityPort;
  const publishers: PublisherBindingPort = { lock: async input => input, bind: async () => { throw new Error("no publisher lookup needed"); } };
  const runtime = { now: () => now, id: () => "grant", syntheticAllowed: () => true };
  const authority = new DiagnosticAuthority(staff, business, runtime, new CampaignDiagnosticAdmission(new ConfigService()));
  const intake = new PrismaDiagnosticIntake(db, authority, business, new DiagnosticPublicBindings(publishers), runtime);
  const subject = (userId = "seller") => ({ userId, sessionId: `${userId}-session` });
  const append = (grantId?: string, classification?: D.DiagnosticOwnershipClassification) => DiagnosticOwnershipCapture.append(tx as unknown as Prisma.TransactionClient,
    row as unknown as Prisma.InspectionOrderGetPayload<object>, "raw", 7, "technician", now, classification, grantId);
  return { intake, subject, grants, components, raws, listing, users, append };
}
