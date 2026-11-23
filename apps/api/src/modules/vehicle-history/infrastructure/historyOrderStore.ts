import { HistoryOrderSchemas as H, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import type { PoolClient } from "pg";
import type { HistoryAgreementInput, HistoryOrderStore, HistoryProvider } from "../domain/HistoryOrder";

const activeOrders = `WITH active_orders AS (
  SELECT o.*, COALESCE(a."reservedProvider", o."reservedProvider") AS "activeProvider",
    COALESCE(a.state->'accepted'->-1->'offer', o.snapshot->'acceptedOffer') AS "activeOffer"
  FROM vehicle_history_orders o LEFT JOIN LATERAL
    (SELECT state, "reservedProvider" FROM history_vin_agreements WHERE "requestId" = o."requestId" ORDER BY version DESC LIMIT 1) a ON TRUE
)`;

export function historyOrderStore(client: PoolClient, requestId: string, assertActive: () => void): HistoryOrderStore {
  return {
    async read() {
      assertActive();
      const { rows } = await client.query<{ snapshot: H.HistoryAcceptedOrder; wallet: string; reservedProvider: HistoryProvider | null; agreement: unknown }>(
        `${activeOrders} SELECT snapshot, wallet, "activeProvider" AS "reservedProvider",
          (SELECT state FROM history_vin_agreements WHERE "requestId" = $1 ORDER BY version DESC LIMIT 1) AS agreement
          FROM active_orders WHERE "requestId" = $1`, [requestId]);
      const row = rows[0];
      if (!row) return null;
      const original = H.HistoryAcceptedOrderSchema.parse(row.snapshot);
      const agreement = row.agreement ? H.HistoryCorrectionStateSchema.parse(row.agreement) : null;
      const accepted = agreement?.accepted.at(-1);
      if (agreement && (!accepted || agreement.acceptedRevision !== accepted.revision)) throw new Error("Invalid accepted History revision");
      return { ...original, wallet: row.wallet, ...(row.reservedProvider ? { reservedProvider: row.reservedProvider } : {}),
        ...(agreement && accepted ? { agreement, acceptedOffer: accepted.offer, originalOffer: original.acceptedOffer } : {}) };
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
    async providerUsage(provider, periodStart, periodEnd, now, excludeCurrent = false) {
      assertActive();
      const { rows } = await client.query<{ used: number }>(`
        ${activeOrders} SELECT COALESCE(sum(1 + (
          SELECT count(*) FROM history_fulfilment_events f WHERE f."requestId" = o."requestId"
            AND f.input->>'kind' = 'company_correction' AND f.state->>'source' = 'new_source'
        )), 0)::int AS used FROM active_orders o
        WHERE "deliveryFrom" < $3 AND "deliveryBy" > $2
          AND (NOT $5::boolean OR "requestId" <> $6)
          AND ("activeProvider" = $1 OR ("activeProvider" IS NULL AND
            "activeOffer"->'preflight'->'providers' @> jsonb_build_array(jsonb_build_object('name', $1::text))))
          AND ("holdExpiresAt" > $4 OR EXISTS (SELECT 1 FROM history_payment_checks p
            WHERE p."requestId" = o."requestId" AND p."bookingCommitted"))`, [provider, periodStart, periodEnd, now, excludeCurrent, requestId]);
      return rows[0]?.used ?? 0;
    },
    async earlierPaidOrdersForSecondReport(provider, periodStart, periodEnd, confirmedAt, now) {
      assertActive();
      const { rows } = await client.query<{ earlier: number }>(`
        ${activeOrders} SELECT count(*)::int AS earlier FROM active_orders o
        JOIN history_payment_checks p ON p."requestId" = o."requestId" AND p."bookingCommitted"
        WHERE o."activeProvider" <> $1 AND o."deliveryFrom" >= $2 AND o."deliveryBy" <= $3 AND o."deliveryBy" > $6
          AND o."activeOffer"->'preflight'->'providers' @> jsonb_build_array(jsonb_build_object('name', $1::text))
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
    async agreementAttempt(key) {
      assertActive();
      const { rows } = await client.query<{ input: HistoryAgreementInput }>(
        'SELECT input FROM history_vin_agreements WHERE "requestId" = $1 AND "attemptKey" = $2', [requestId, key]);
      return rows[0]?.input ?? null;
    },
    async saveAgreement(write) {
      assertActive();
      const state = H.HistoryCorrectionStateSchema.parse(write.state);
      await client.query(`INSERT INTO history_vin_agreements
        ("requestId", version, "attemptKey", input, state, "reservedProvider", "actorId", "assignmentVersion", "recordedAt")
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`, [requestId, state.version,
        "attemptKey" in write.input ? write.input.attemptKey : null, JSON.stringify(write.input), JSON.stringify(state),
        write.provider, write.actorId, write.assignmentVersion, write.recordedAt]);
    },
    async fulfilment() {
      assertActive();
      const { rows } = await client.query<{ state: unknown }>(
        'SELECT state FROM history_fulfilment_events WHERE "requestId" = $1 ORDER BY version DESC LIMIT 1', [requestId]);
      return rows[0] ? H.HistoryFulfilmentIntentSchema.parse(rows[0].state) : null;
    },
    async fulfilmentAttempt(key) {
      assertActive();
      const { rows } = await client.query<{ input: unknown }>(
        'SELECT input FROM history_fulfilment_events WHERE "requestId" = $1 AND "attemptKey" = $2', [requestId, key]);
      return rows[0] ? H.HistoryFulfilmentMutationSchema.parse(rows[0].input) : null;
    },
    async hasEarlierPaidWork(operatorId, confirmedAt, now) {
      assertActive();
      const { rows } = await client.query<{ earlier: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM history_payment_checks p
          JOIN vehicle_history_requests r ON r.id = p."requestId"
          JOIN vehicle_history_orders o ON o."requestId" = p."requestId"
          LEFT JOIN LATERAL (
            SELECT state FROM history_fulfilment_events WHERE "requestId" = p."requestId" ORDER BY version DESC LIMIT 1
          ) f ON TRUE
          WHERE p."bookingCommitted" AND o."deliveryBy" > $4
            AND r."assignedOperatorId" = $1 AND (p."confirmedAt", p."requestId") < ($2::timestamptz, $3::text)
            AND COALESCE(f.state->>'status', '') NOT IN ('obtained', 'recovery')
        ) AS earlier`, [operatorId, confirmedAt, requestId, now]);
      return rows[0]?.earlier ?? false;
    },
    async saveFulfilment({ input, state, actorId, assignmentVersion }) {
      assertActive();
      await client.query(`INSERT INTO history_fulfilment_events
        ("requestId", version, "attemptKey", input, state, "actorId", "assignmentVersion", "recordedAt")
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [requestId, state.version, input.attemptKey, JSON.stringify(input), JSON.stringify(H.HistoryFulfilmentIntentSchema.parse(state)),
        actorId, assignmentVersion, state.recordedAt]);
    },
  };
}
