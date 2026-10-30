import type { Prisma } from "../generated/prisma/client/client";

/** Finite campaign-tracked mutations. SQL reads OLD and overlays proposed NEW.
 * Neither this intent nor its receipt grants source or campaign-private authority. */
export interface CampaignMutation {
  readonly table: string;
  readonly key: Readonly<Record<string, string>>;
  readonly verb: "insert" | "update" | "delete";
  readonly next: Readonly<Record<string, Prisma.InputJsonValue | null>> | null;
}

/** Outer transaction entry for ordinary excluded writes. Source commands prepare
 * through the same SQL protocol themselves; never nest these two interfaces. */
export async function withCampaignPreparation<T>(
  tx: Prisma.TransactionClient,
  mutations: readonly CampaignMutation[],
  work: () => Promise<T>,
): Promise<T> {
  const [row] = await tx.$queryRaw<{ receipt: string }[]>`
    SELECT public.campaign_prepare(${JSON.stringify(mutations)}::jsonb)::text AS receipt
  `;
  if (!row?.receipt) throw new Error("campaign_preparation_receipt");
  const result = await work();
  await tx.$queryRaw`SELECT public.campaign_finish(${row.receipt}::uuid)::text`;
  return result;
}
