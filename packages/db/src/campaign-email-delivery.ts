import type { Prisma, PrismaClient } from "../generated/prisma/client/client";

interface CampaignDelivery {
  namespace: string;
  transaction: Prisma.TransactionClient;
}

/**
 * Serializes synthetic delivery with reservation disposal. The action must finish
 * before the transaction releases its advisory fence. Ordinary mail is unchanged.
 * Missing namespaces and old profiles without a delivery journal fail closed.
 */
export async function withCampaignEmailDelivery<T>(
  db: PrismaClient,
  requestId: string,
  email: string,
  action: (campaign?: CampaignDelivery) => Promise<T>,
): Promise<T> {
  if (!email.toLowerCase().endsWith("@campaign897.invalid")) return action();
  const match = /^(buyer-a|owner|sales-a|coordinator)\.([a-f0-9]{32})\.([a-f0-9]{12})@campaign897\.invalid$/.exec(email);
  if (!match) throw new Error("Campaign delivery identity refused");
  const reservationId = match[2];
  const candidatePrefix = match[3];
  if (!reservationId || !candidatePrefix) throw new Error("Campaign delivery identity refused");
  const namespace = `cf_${reservationId}`;
  return db.$transaction(async transaction => {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${namespace}, 0))::text`;
    // Namespace is derived only from the fixed hex grammar above; values remain parameters.
    const rows = await transaction.$queryRawUnsafe<{ request_id: string }[]>(`
      SELECT d.request_id FROM "${namespace}".campaign_manifest m
      JOIN "${namespace}".campaign_entities e ON e.email=$1
      JOIN "${namespace}".campaign_delivery_ledger d ON d.email=e.email AND d.request_id=$2
      JOIN "${namespace}".campaign_records r ON r.table_name='otp_requests'
        AND r.row_key=jsonb_build_object('id',d.request_id) AND NOT r.deleted
      WHERE m.reservation_id=$3 AND left(m.candidate,12)=$4 AND m.profile='campaign897-identities-v1'
        AND m.state='identities' AND m.delivery_version=1`, email, requestId, reservationId, candidatePrefix);
    if (rows.length !== 1) throw new Error("Campaign delivery is unavailable or disposed");
    return action({ namespace, transaction });
  }, { timeout: 30000, maxWait: 5000 });
}
