import type { Prisma } from "../generated/prisma/client/client";

import type { DiagnosticSourceCommand, DiagnosticSourceRoot, DiagnosticSourceRow, DiagnosticSourceTuple } from "./diagnostic-source-command";

export type BusinessSourceInput = {
 readonly actorUserId: string; readonly sessionId: string; readonly businessId: string;
 readonly roots: readonly DiagnosticSourceRoot[];
} & (
 | { readonly operation: "member_create" | "member_replace"; readonly removedMemberId?: string; readonly member?: Readonly<{ id: string; userId: string; role: "owner" | "sales" }> }
 | { readonly operation: "member_remove" | "member_eligibility"; readonly memberId: string; readonly status?: "active" | "suspended" }
 | { readonly operation: "business_eligibility"; readonly status: string }
);

/** Business callers choose the actual transition and preallocated NEW member ID.
 * SQL owns the OLD projection, normalization, graph and trigger/FK effects. */
export async function businessSourceCommand(tx: Prisma.TransactionClient, input: BusinessSourceInput): Promise<DiagnosticSourceCommand> {
 const rows: DiagnosticSourceRow[] = [];
 const read = async (table: "dealership_members" | "dealerships", id: string, changes: DiagnosticSourceTuple) => {
  const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
   WITH target AS (SELECT public.diagnostic_source_project(
    public.diagnostic_source_read(${table}::text,jsonb_build_object('id',${id}::text)),
    public.diagnostic_source_meta(${table}::text)->'fields') AS source)
   SELECT source,public.diagnostic_source_normalize(${table}::text,coalesce(source,'{}')||${JSON.stringify(changes)}::jsonb) AS next FROM target
  `;
  if (!row) throw new Error("diagnostic_source_projection");
  return row;
 };
 const remove = async (id: string) => {
  const { source } = await read("dealership_members",id,{});
  if (!source) throw new Error("diagnostic_source_stale");
  rows.push({ table: "dealership_members", key: { id }, verb: "delete", expected: { source }, next: null });
 };
 if (input.operation === "member_remove") await remove(input.memberId);
 else if (input.operation === "member_eligibility") {
  const { source,next } = await read("dealership_members",input.memberId,{ status: input.status ?? "active" });
  if (!source) throw new Error("diagnostic_source_stale");
  rows.push({ table: "dealership_members", key: { id: input.memberId }, verb: "update", expected: { source }, next });
 } else if (input.operation === "business_eligibility") {
  const { source,next } = await read("dealerships",input.businessId,{ status: input.status });
  if (!source) throw new Error("diagnostic_source_stale");
  rows.push({ table: "dealerships", key: { id: input.businessId }, verb: "update", expected: { source }, next });
 } else if (input.operation === "member_create" || input.operation === "member_replace") {
  if (input.removedMemberId) await remove(input.removedMemberId);
  if (input.member) {
   const { source,next } = await read("dealership_members",input.member.id,{ ...input.member, dealershipId: input.businessId, status: "active" });
   if (source) throw new Error("diagnostic_source_stale");
   rows.push({ table: "dealership_members", key: { id: input.member.id }, verb: "insert", expected: "absent", next });
  }
 }
 return { operation: input.operation, roots: [{ table: "dealerships",key: { id: input.businessId } }, ...input.roots], rows, actorUserId: input.actorUserId,sessionId: input.sessionId,cutoff: null,campaign: null };
}
