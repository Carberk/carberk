import { HistoryOrderSchemas as H, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import type { PoolClient } from "pg";
import type { HistoryOrderStore, HistoryProvider } from "../domain/HistoryOrder";

export function historyOrderStore(client: PoolClient, requestId: string, assertActive: () => void): HistoryOrderStore {
  return {
    async read() {
      assertActive();
      const { rows } = await client.query<{ snapshot: H.HistoryAcceptedOrder; wallet: string; reservedProvider: HistoryProvider | null }>(
        'SELECT snapshot, wallet, "reservedProvider" FROM vehicle_history_orders WHERE "requestId" = $1', [requestId]);
      const row = rows[0];
      return row ? { ...H.HistoryAcceptedOrderSchema.parse(row.snapshot), wallet: row.wallet,
        ...(row.reservedProvider ? { reservedProvider: row.reservedProvider } : {}) } : null;
    },
    async serialize(operation) {
      assertActive();
      await client.query("SELECT pg_advisory_xact_lock(1181, 7)");
      assertActive();
      return operation();
    },
    async capacity(day, from, by, now) {
      assertActive();
      const { rows } = await client.query<{ total: number; morning: number; overlapping: number }>(`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE "deliveryBy" <= ($1 || 'T10:00:00+05:00')::timestamptz)::int AS morning,
          count(*) FILTER (WHERE "deliveryFrom" < $3 AND "deliveryBy" > $2)::int AS overlapping
        FROM vehicle_history_orders o WHERE "deliveryDay" = $1 AND ("holdExpiresAt" > $4 OR EXISTS
          (SELECT 1 FROM history_payment_checks p WHERE p."requestId" = o."requestId" AND p."bookingCommitted"))`, [day, from, by, now]);
      return rows[0] ?? { total: 0, morning: 0, overlapping: 0 };
    },
    async providerUsage(provider, periodStart, periodEnd, now) {
      assertActive();
      const { rows } = await client.query<{ used: number }>(`
        SELECT count(*)::int AS used FROM vehicle_history_orders o
        WHERE "deliveryFrom" < $3 AND "deliveryBy" > $2
          AND ("reservedProvider" = $1 OR ("reservedProvider" IS NULL AND
            snapshot->'acceptedOffer'->'preflight'->'providers' @> jsonb_build_array(jsonb_build_object('name', $1::text))))
          AND ("holdExpiresAt" > $4 OR EXISTS (SELECT 1 FROM history_payment_checks p
            WHERE p."requestId" = o."requestId" AND p."bookingCommitted"))`, [provider, periodStart, periodEnd, now]);
      return rows[0]?.used ?? 0;
    },
    async earlierPaidOrdersForSecondReport(provider, periodStart, periodEnd, confirmedAt, now) {
      assertActive();
      const { rows } = await client.query<{ earlier: number }>(`
        SELECT count(*)::int AS earlier FROM vehicle_history_orders o
        JOIN history_payment_checks p ON p."requestId" = o."requestId" AND p."bookingCommitted"
        WHERE o."reservedProvider" <> $1 AND o."deliveryFrom" >= $2 AND o."deliveryBy" <= $3 AND o."deliveryBy" > $6
          AND o.snapshot->'acceptedOffer'->'preflight'->'providers' @> jsonb_build_array(jsonb_build_object('name', $1::text))
          AND (p."confirmedAt", o."requestId") < ($4::timestamptz, $5::text)`, [provider, periodStart, periodEnd, confirmedAt, requestId, now]);
      return rows[0]?.earlier ?? 0;
    },
    async create(stored, provider) {
      assertActive();
      const { wallet, ...order } = stored;
      const snapshot = H.HistoryAcceptedOrderSchema.parse(order);
      await client.query(`INSERT INTO vehicle_history_orders
        ("requestId", id, snapshot, wallet, "deliveryDay", "deliveryFrom", "deliveryBy", "holdExpiresAt", "reservedProvider")
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)`, [requestId, order.id, JSON.stringify(snapshot), wallet,
        order.deliveryDay, order.acceptedOffer.proposal.deliveryFrom, order.acceptedOffer.proposal.deliveryBy, order.holdExpiresAt, provider]);
    },
    async paymentChecks() {
      assertActive();
      const { rows } = await client.query<{ input: unknown; actorId: string; version: number; checkedAt: Date; confirmedAt: Date | null; bookingCommitted: boolean }>(
        'SELECT input, "actorId", version, "checkedAt", "confirmedAt", "bookingCommitted" FROM history_payment_checks WHERE "requestId" = $1 ORDER BY version', [requestId]);
      return rows.map((row) => P.HistoryPaymentCheckSchema.parse({ ...row, checkedAt: row.checkedAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null }));
    },
    async savePaymentCheck(check) {
      assertActive();
      await client.query(`INSERT INTO history_payment_checks
        ("requestId", "orderId", "attemptKey", version, "actorId", input, "checkedAt", "confirmedAt", "bookingCommitted")
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`, [requestId, check.input.orderId, check.input.attemptKey,
        check.version, check.actorId, JSON.stringify(check.input), check.checkedAt, check.confirmedAt, check.bookingCommitted]);
    },
    async submittedProofIds() {
      assertActive();
      const { rows } = await client.query<{ id: string }>('SELECT id FROM history_private_files WHERE "requestId" = $1 AND status = $2', [requestId, "submitted"]);
      return rows.map((row) => row.id);
    },
  };
}
