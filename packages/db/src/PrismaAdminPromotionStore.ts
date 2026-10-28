import { Prisma, type PrismaClient } from "../generated/prisma/client/client";

import { withDiagnosticSourceCommand, type DiagnosticSourceCommand, type DiagnosticSourceTuple } from "./diagnostic-source-command";
import { adminPromotionSourceCommand, maintenanceAudit, maintenanceAuditDate, type MaintenanceSelector } from "./maintenance-source-command";
import type { PromoteAdminDeps, PromoteAdminTransaction, PromoteAdminUser } from "./promote-admin";

type SelectedUser = PromoteAdminUser & { email: string | null; source: DiagnosticSourceTuple };
type AuditInput = Parameters<PromoteAdminTransaction["createAuditLog"]>[0];

/** Owns the single finite promotion transaction. Application writes are buffered
 * until the complete source graph has been prepared, before any resource lock. */
export class PrismaAdminPromotionStore implements PromoteAdminDeps {
  constructor(private readonly prisma: PrismaClient, private readonly candidate: string) {}

  private async reservation(tx: Prisma.TransactionClient, user: SelectedUser): Promise<void> {
    const match = user.email?.match(/^[a-z-]+\.([a-f0-9]{32})\.[a-f0-9]{12}@campaign897\.invalid$/);
    if (!match) return;
    const namespace = `cf_${match[1]}`;
    const [binding] = await tx.$queryRawUnsafe<{ valid: boolean }[]>(`
      SELECT EXISTS(SELECT 1 FROM "${namespace}".campaign_manifest m
        JOIN "${namespace}".campaign_entities e ON e.user_id=$1 AND e.email=$2
        WHERE m.delivery_version<>3 OR (m.profile='campaign897-full-v3' AND m.state='identities' AND m.candidate=$3)) AS valid`,
    user.id, user.email, this.candidate);
    if (!binding?.valid) throw new Error("Campaign promotion binding refused");
  }

  private async select(tx: Prisma.TransactionClient, selector: MaintenanceSelector, lock: boolean): Promise<SelectedUser[]> {
    // The only SQL fragment is a private boolean, never caller SQL.
    const suffix = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const users = selector.channel === "phone"
      ? await tx.$queryRaw<SelectedUser[]>`SELECT id,role,"emailVerifiedAt",email,
          public.diagnostic_source_project(to_jsonb(users),public.diagnostic_source_meta('users')->'fields') AS source FROM public.users WHERE phone=${selector.value} ${suffix}`
      : await tx.$queryRaw<SelectedUser[]>`SELECT id,role,"emailVerifiedAt",email,
          public.diagnostic_source_project(to_jsonb(users),public.diagnostic_source_meta('users')->'fields') AS source FROM public.users
          WHERE public.diagnostic_maintenance_email(email)=${selector.value} ORDER BY id LIMIT 2 ${suffix}`;
    for (const user of users) await this.reservation(tx, user);
    return users;
  }

  private async graph(tx: Prisma.TransactionClient, command: DiagnosticSourceCommand, userId: string): Promise<string> {
    // Audit identities are transaction-derived absent keys. All persisted graph
    // rows remain comparable across the aborted and read-only transactions.
    const [value] = await tx.$queryRaw<{ graph: string }[]>`
      SELECT coalesce(jsonb_agg(CASE WHEN e->>'table'='users' AND e->'key'->>'id'=${userId}
        THEN jsonb_set(e,'{row}',(e->'row')-'role') ELSE e END ORDER BY e->>'table',(e->'key')::text),'[]')::text AS graph
      FROM jsonb_array_elements(public.diagnostic_source_scope(${JSON.stringify(command)}::jsonb)) e
      WHERE NOT(e->>'table'='audit_logs' AND e->'key'->'id'=public.diagnostic_maintenance_audit(${JSON.stringify(command)}::jsonb)->'id')`;
    if (!value) throw new Error("Promotion graph unavailable");
    return value.graph;
  }

  async transaction<T>(work: (tx: PromoteAdminTransaction) => Promise<T>): Promise<T> {
    let stale: { selector: MaintenanceSelector; userId: string; graph: string; source: DiagnosticSourceTuple } | undefined;
    let preparationPending = false;
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('autotm.admin_promote_candidate',${this.candidate},true)`;
        const pending: {
          selector?: MaintenanceSelector; selected: SelectedUser[];
          roleWrite?: { userId: string; role: string }; auditWrite?: AuditInput;
        } = { selected: [] };
        const read = async (value: MaintenanceSelector) => {
          if (pending.selector) throw new Error("Promotion selector reused");
          pending.selector = value;
          pending.selected = await this.select(tx, value, false);
          return pending.selected;
        };
        const result = await work({
          findUserByPhone: async value => (await read({ channel: "phone", value }))[0] ?? null,
          findUsersByEmail: value => read({ channel: "email", value }),
          updateUserRole: async (userId, role) => {
            if (pending.roleWrite) throw new Error("Promotion role write reused");
            pending.roleWrite = { userId, role };
          },
          createAuditLog: async data => {
            if (pending.auditWrite) throw new Error("Promotion audit reused");
            pending.auditWrite = data;
          },
        });
        const { selector, selected, roleWrite, auditWrite } = pending;
        if (!selector) return result;
        if (!roleWrite && !auditWrite) {
          // Dry-run, refusal and existing-admin outcomes are confirmed with the
          // same locked selector, never by preparing a write-free command.
          if (selector.channel === "email") {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(897100,hashtext(jsonb_build_array('canonical_email',${selector.value}::text)::text))::text`;
          }
          const locked = await this.select(tx, selector, true);
          if (JSON.stringify(locked) !== JSON.stringify(selected)) throw new Error("Promotion selector changed");
          return result;
        }
        const user = selected[0];
        if (selected.length !== 1 || !user || !roleWrite || !auditWrite || roleWrite.userId !== user.id || roleWrite.role !== "admin") {
          throw new Error("Promotion plan refused");
        }
        const reason = auditWrite.details["reason"];
        if (typeof reason !== "string" || auditWrite.actorId !== null || auditWrite.action !== "ADMIN_BOOTSTRAP_PROMOTE" ||
            auditWrite.targetType !== "user" || auditWrite.targetId !== user.id || JSON.stringify(auditWrite.details) !== JSON.stringify({
              reason, before: { role: user.role }, after: { role: "admin" },
            })) throw new Error("Promotion audit refused");
        const selectedSelector = selector;
        const command = await adminPromotionSourceCommand(tx, { userId: user.id, selector: selectedSelector, reason, source: user.source });
        stale = { selector, userId: user.id, graph: await this.graph(tx, command, user.id), source: user.source };
        const audit = await maintenanceAudit(tx, command);
        preparationPending = true;
        await withDiagnosticSourceCommand(tx, command, async () => {
          preparationPending = false;
          const locked = await this.select(tx, selectedSelector, true);
          if (JSON.stringify(locked) !== JSON.stringify(selected)) throw new Error("Promotion selector changed");
          await tx.user.update({ where: { id: user.id }, data: { role: "admin" } });
          await tx.auditLog.create({ data: { ...audit, createdAt: maintenanceAuditDate(audit.createdAt) } });
        });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      // Only a reached stale preparation may become the documented winner
      // no-op. Audit/DML/finish failures always retain their original error.
      const message = error instanceof Error ? error.message : "";
      if (!preparationPending || !stale || !/diagnostic_source_(stale|graph_changed)/.test(message)) throw error;
      const prior = stale;
      return this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('autotm.admin_promote_candidate',${this.candidate},true)`;
        if (prior.selector.channel === "email") {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(897100,hashtext(jsonb_build_array('canonical_email',${prior.selector.value}::text)::text))::text`;
        }
        const users = await this.select(tx, prior.selector, true);
        const user = users[0];
        if (users.length !== 1 || !user || user.id !== prior.userId || user.role !== "admin" ||
            (prior.selector.channel === "email" && !user.emailVerifiedAt)) throw error;
        const withoutRole = (source: DiagnosticSourceTuple) => Object.fromEntries(Object.entries(source).filter(([field]) => field !== "role"));
        if (JSON.stringify(withoutRole(user.source)) !== JSON.stringify(withoutRole(prior.source))) throw error;
        const command = await adminPromotionSourceCommand(tx, { userId: user.id, selector: prior.selector, reason: "read-only confirmation" });
        if (await this.graph(tx, command, user.id) !== prior.graph) throw error;
        const refuse = async (): Promise<never> => { throw error; };
        return work({ findUserByPhone: async value => {
          if (prior.selector.channel !== "phone" || value !== prior.selector.value) throw error;
          return user;
        }, findUsersByEmail: async value => {
          if (prior.selector.channel !== "email" || value !== prior.selector.value) throw error;
          return users;
        }, updateUserRole: refuse, createAuditLog: refuse });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    }
  }
}
