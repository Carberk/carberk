import { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import type { PoolClient } from "pg";
import type { HistoryOrderStore, StoredHistoryOrder } from "../domain/HistoryOrder";

export function historyOrderStore(client: PoolClient, requestId: string, assertActive: () => void): HistoryOrderStore {
  return {
    async read() {
      assertActive();
      const { rows } = await client.query<{ snapshot: H.HistoryAcceptedOrder; wallet: string }>(
        'SELECT snapshot, wallet FROM vehicle_history_orders WHERE "requestId" = $1', [requestId]);
      const row = rows[0];
      return row ? { ...H.HistoryAcceptedOrderSchema.parse(row.snapshot), wallet: row.wallet } : null;
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
        FROM vehicle_history_orders WHERE "deliveryDay" = $1 AND "holdExpiresAt" > $4`, [day, from, by, now]);
      return rows[0] ?? { total: 0, morning: 0, overlapping: 0 };
    },
    async create(stored: StoredHistoryOrder) {
      assertActive();
      const { wallet, ...order } = stored;
      const snapshot = H.HistoryAcceptedOrderSchema.parse(order);
      await client.query(`INSERT INTO vehicle_history_orders
        ("requestId", id, snapshot, wallet, "deliveryDay", "deliveryFrom", "deliveryBy", "holdExpiresAt")
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`, [requestId, order.id, JSON.stringify(snapshot), wallet,
        order.deliveryDay, order.acceptedOffer.proposal.deliveryFrom, order.acceptedOffer.proposal.deliveryBy, order.holdExpiresAt]);
    },
  };
}
