import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";

import { ListingDraft } from "../domain/ListingDraft";
import type { ListingDraftRepository } from "../domain/ports/ListingDraftRepository";

interface DraftDependency { table: string; key: Record<string, string>; row: unknown }
interface DraftKey { namespace: number; key: number }

const DRAFT_LIMIT_TRANSACTION = { maxWait: 5_000, timeout: 5_000 } as const;

@Injectable()
export class PrismaListingDraftRepository implements ListingDraftRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership) {}

  async save(draft: ListingDraft): Promise<ListingDraft> {
    return this.prisma.$transaction(async (tx) => this.prepared(tx, draft.id, "insert", draft, undefined, async () => {
      const row = await tx.listingDraft.create({ data: {
        id: draft.id, userId: draft.userId, businessId: draft.businessId ?? null,
        payload: draft.payload as Prisma.InputJsonValue, createdAt: draft.createdAt, updatedAt: draft.updatedAt,
      } });
      return this.toDomain(row);
    }), DRAFT_LIMIT_TRANSACTION);
  }

  async saveWithinLimit(draft: ListingDraft, limit: number, actor?: ListingActor): Promise<ListingDraft | null> {
    return this.prisma.$transaction(async (tx) => {
      return this.prepared(tx, draft.id, "insert", draft, actor, async () => {
        // Retain the User-first count fence after the complete prefix.
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${draft.userId} FOR UPDATE`;
        const owned = await tx.listingDraft.count({ where: draft.businessId ? { businessId: draft.businessId } : { userId: draft.userId, businessId: null } });
        if (owned >= limit) return null;
        const row = await tx.listingDraft.create({ data: {
          id: draft.id, userId: draft.userId, businessId: draft.businessId ?? null,
          payload: draft.payload as Prisma.InputJsonValue, createdAt: draft.createdAt, updatedAt: draft.updatedAt,
        } });
        return this.toDomain(row);
      });
    }, DRAFT_LIMIT_TRANSACTION);
  }

  async findById(id: string): Promise<ListingDraft | null> {
    const row = await this.prisma.listingDraft.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByUserId(
    userId: string,
    opts?: { cursor?: { timestamp: string; id: string } | undefined; limit?: number | undefined },
  ): Promise<{ items: ListingDraft[]; nextCursor?: { timestamp: string; id: string } | undefined }> {
    const take = (opts?.limit ?? 20) + 1;

    const rows = await this.prisma.listingDraft.findMany({
      where: { userId, businessId: null },
      take,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(opts?.cursor
        ? {
            skip: 1,
            cursor: { id: opts.cursor.id },
          }
        : {}),
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? { timestamp: last.updatedAt.toISOString(), id: last.id }
      : undefined;

    return { items: items.map((r) => this.toDomain(r as { id: string; userId: string; payload: unknown; createdAt: Date; updatedAt: Date })), nextCursor };
  }

  async update(draft: ListingDraft, actor?: ListingActor): Promise<ListingDraft> {
    return this.prisma.$transaction(async (tx) => this.prepared(tx, draft.id, "update", draft, actor, async () => {
      const row = await tx.listingDraft.update({ where: { id: draft.id }, data: {
        payload: draft.payload as Prisma.InputJsonValue, updatedAt: draft.updatedAt,
      } });
      return this.toDomain(row);
    }), DRAFT_LIMIT_TRANSACTION);
  }

  async delete(id: string, actor?: ListingActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => this.prepared(tx, id, "delete", undefined, actor, async () => {
      await tx.listingDraft.delete({ where: { id } });
    }), DRAFT_LIMIT_TRANSACTION);
  }

  /** Ordinary draft writes have no diagnostic source operation. The campaign
   * receipt owns the table/namespace prefix; registry keys below only serialize
   * dependencies with the accepted source writers. They grant no authority.
   */
  private async prepared<T>(
    tx: Prisma.TransactionClient,
    id: string,
    verb: "insert" | "update" | "delete",
    draft: ListingDraft | undefined,
    actor: ListingActor | undefined,
    work: (stored: ListingDraft | null) => Promise<T>,
  ): Promise<T> {
    // PostgreSQL cancels waits before Prisma's transaction deadline.
    await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
    const stored = await tx.listingDraft.findUnique({ where: { id } });
    if (verb === "update" && stored && draft && (stored.userId !== draft.userId || stored.businessId !== (draft.businessId ?? null))) {
      throw new Error("draft_owner_changed");
    }
    const next = verb === "delete" ? null : draft ? {
      id, userId: draft.userId, businessId: draft.businessId ?? null,
      payload: draft.payload as Prisma.InputJsonValue,
      createdAt: (verb === "update" && stored ? stored.createdAt : draft.createdAt).toISOString(), updatedAt: draft.updatedAt.toISOString(),
    } : null;
    // Missing UPDATE/DELETE still reaches Prisma's existing P2025 behavior.
    const mutations: CampaignMutation[] = stored || verb === "insert"
      // An occupied create slot still reaches Prisma's P2002. Campaign
      // preparation covers its OLD/attempted NEW namespaces as an overlay.
      ? [{ table: "listing_drafts", key: { id }, verb: verb === "insert" && stored ? "update" : verb, next }]
      : [];
    const discover = async () => {
      const [result] = await tx.$queryRaw<{ scope: DraftDependency[]; keys: DraftKey[] }[]>`
        WITH RECURSIVE
        input AS (SELECT ${id}::text id, ${JSON.stringify(next)}::jsonb proposed,
          ${actor?.userId ?? null}::text actor, ${actor?.sessionId ?? null}::text session,
          ${actor?.businessId ?? null}::text business),
        old AS (SELECT to_jsonb(d) row FROM public.listing_drafts d, input i WHERE d.id=i.id),
        subjects AS (
          SELECT proposed->>'userId' id FROM input UNION SELECT row->>'userId' FROM old
          UNION SELECT actor FROM input
          UNION SELECT s."userId" FROM public.sessions s, input i WHERE s.id=i.session
        ),
        businesses AS (
          SELECT proposed->>'businessId' id FROM input UNION SELECT row->>'businessId' FROM old
          UNION SELECT business FROM input
          UNION SELECT m."dealershipId" FROM public.dealership_members m WHERE m."userId" IN (SELECT id FROM subjects)
        ),
        payload_ids AS (
          SELECT value #>> '{}' id FROM input i,
            LATERAL jsonb_path_query(coalesce(i.proposed->'payload','{}'), '$.** ? (@.type() == "string")') value
          UNION SELECT value #>> '{}' FROM old o,
            LATERAL jsonb_path_query(o.row->'payload', '$.** ? (@.type() == "string")') value
        ),
        videos AS (
          SELECT s.id FROM public.video_upload_sessions s, input i
          WHERE (s."targetKind"='draft' AND s."targetId"=i.id) OR s.id IN (SELECT id FROM payload_ids)
        ),
        roots(t,k) AS (
          SELECT 'listing_drafts',jsonb_build_object('id',id) FROM input
          UNION SELECT 'users',jsonb_build_object('id',id) FROM subjects WHERE id IS NOT NULL
          UNION SELECT 'sessions',jsonb_build_object('id',session) FROM input WHERE session IS NOT NULL
          UNION SELECT 'dealerships',jsonb_build_object('id',id) FROM businesses WHERE id IS NOT NULL
          UNION SELECT 'dealership_members',jsonb_build_object('id',m.id) FROM public.dealership_members m
            WHERE m."userId" IN (SELECT id FROM subjects)
              OR (m.role='owner' AND m."dealershipId" IN (SELECT id FROM businesses))
          UNION SELECT 'video_upload_sessions',jsonb_build_object('id',id) FROM videos
          UNION SELECT 'video_generations',jsonb_build_object('id',g.id) FROM public.video_generations g, input i
            WHERE g."listingId"=i.id OR g."sessionId" IN (SELECT id FROM videos) OR g.id IN (SELECT id FROM payload_ids)
        ),
        dependencies(t,k) AS (
          SELECT t,k FROM roots
          UNION
          SELECT ref->>'table', target.key FROM dependencies d,
            LATERAL jsonb_array_elements(public.diagnostic_source_meta(d.t)->'refs') ref,
            LATERAL (SELECT jsonb_object_agg(b.value,public.diagnostic_source_read(d.t,d.k)->a.value) key
              FROM jsonb_array_elements_text(ref->'columns') WITH ORDINALITY a(value,n)
              JOIN jsonb_array_elements_text(ref->'target') WITH ORDINALITY b(value,n) USING(n)) target
          WHERE target.key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_each(target.key) v WHERE v.value='null')
        ),
        inventory AS (SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'key',k,
          'row',public.diagnostic_source_read(t,k)) ORDER BY t COLLATE "C",k::text),'[]') scope FROM dependencies),
        keys AS (
          -- Empty rows is deliberate: use the accepted key encoding only, with
          -- no source mutation or invented diagnostic operation/receipt.
          SELECT value key FROM inventory, LATERAL jsonb_array_elements(public.diagnostic_source_lock_keys(scope,'{"rows":[]}'::jsonb))
          UNION SELECT jsonb_build_object('namespace',897300,'key',hashtext(jsonb_build_array('unique',
            jsonb_build_array('userId'),jsonb_build_object('userId',id))::text)) FROM subjects WHERE id IS NOT NULL
          UNION SELECT jsonb_build_object('namespace',897300,'key',hashtext(jsonb_build_array('owner',id)::text)) FROM businesses WHERE id IS NOT NULL
        )
        SELECT scope,(SELECT coalesce(jsonb_agg(key ORDER BY (key->>'namespace')::int,(key->>'key')::int),'[]') FROM keys) keys FROM inventory
      `;
      if (!result || result.scope.length > 1000) throw new Error("draft_dependency_scope");
      return result;
    };
    const before = await discover();
    return withCampaignPreparation(tx, mutations, async () => {
      // Lock each namespace's absence/unique keys, then its rows, in the same
      // order as source preparation. Never add dependencies after a wait.
      const tables = [...new Set(before.scope.map(entry => entry.table))];
      const namespaces = [...new Set(before.keys.map(key => key.namespace))];
      const metadata = await tx.$queryRaw<{ table: string; namespace: number }[]>`
        SELECT value->>'table' AS table,(value->>'namespace')::int AS namespace
        FROM jsonb_array_elements(public.diagnostic_source_registry())
        WHERE value->>'table'=ANY(${tables}::text[]) OR (value->>'namespace')::int=ANY(${namespaces}::int[])
        ORDER BY (value->>'namespace')::int
      `;
      if (tables.some(table => !metadata.some(meta => meta.table === table)) || namespaces.some(namespace => !metadata.some(meta => meta.namespace === namespace))) throw new Error("draft_dependency_table");
      for (const meta of metadata) {
        for (const key of before.keys.filter(key => key.namespace === meta.namespace)) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(${key.namespace}::int,${key.key}::int)`;
        }
        // The relation comes exclusively from the accepted SQL registry.
        const table = Prisma.raw(`"${meta.table.replaceAll('"', '""')}"`);
        for (const entry of before.scope.filter(entry => entry.table === meta.table)) {
          await tx.$queryRaw(Prisma.sql`SELECT 1 FROM public.${table} s WHERE to_jsonb(s) @> ${JSON.stringify(entry.key)}::jsonb FOR UPDATE`);
        }
      }
      const after = await discover();
      if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("draft_dependencies_changed");
      const current = await tx.listingDraft.findUnique({ where: { id } });
      if (JSON.stringify(current) !== JSON.stringify(stored)) throw new Error("draft_dependencies_changed");
      const resource = current ?? draft;
      if (resource?.businessId) {
        if (!actor) throw new Error("Business draft requires current actor");
        await assertListingOwnership(this.ownership, actor, {
          userId: resource.userId, businessId: resource.businessId,
        }, tx);
      } else if (actor && resource) {
        await assertListingOwnership(this.ownership, actor, { userId: resource.userId }, tx);
      }
      return work(current ? this.toDomain(current) : null);
    });
  }

  private toDomain(row: {
    id: string;
    userId: string;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
    businessId?: string | null;
  }): ListingDraft {
    return new ListingDraft(
      row.id,
      row.userId,
      row.payload as Record<string, unknown>,
      row.createdAt,
      row.updatedAt,
      row.businessId ?? undefined,
    );
  }
}
