import { HistoryOrderSchemas as H, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import type { PoolClient } from "pg";
import type { HistoryAgreementInput, HistoryOrderStore, HistoryProvider, HistoryRecoveryCommand } from "../domain/HistoryOrder";

import { historyReportStore } from "./historyReportStore";

const activeOrders = `WITH active_orders AS (
  SELECT o.*,
    COALESCE(CASE WHEN b."requestId" IS NULL OR (a.state->>'acceptedRevision')::int > b."acceptedRevision"
      THEN a."reservedProvider" END, b."bookingProvider", o."reservedProvider") AS "activeProvider",
    COALESCE(b."bookingDay", o."deliveryDay") AS "activeDay",
    COALESCE(b."bookingFrom", o."deliveryFrom") AS "activeFrom",
    COALESCE(b."bookingBy", o."deliveryBy") AS "activeBy",
    b."requestId" IS NOT NULL AS "replacementBooked",
    COALESCE(a.state->'accepted'->-1->'offer', o.snapshot->'acceptedOffer') AS "activeOffer"
  FROM vehicle_history_orders o LEFT JOIN LATERAL
    (SELECT state, "reservedProvider" FROM history_vin_agreements WHERE "requestId" = o."requestId" ORDER BY version DESC LIMIT 1) a ON TRUE
  LEFT JOIN history_replacement_events b ON b."requestId" = o."requestId" AND b."bookingDay" IS NOT NULL
)`;
const hasBooking = `(o."replacementBooked" OR EXISTS (
  SELECT 1 FROM history_payment_checks p WHERE p."requestId" = o."requestId" AND p."bookingCommitted"))`;

export const dueHistoryRecovery = `${activeOrders}
  SELECT o."requestId" FROM active_orders o JOIN vehicle_history_requests r ON r.id = o."requestId"
  LEFT JOIN LATERAL (
    SELECT state FROM history_recovery_events WHERE "requestId" = r.id ORDER BY version DESC LIMIT 1
  ) h ON TRUE
  WHERE r."requesterId" = ANY($1::text[]) AND r.id > $3 AND ${hasBooking}
    AND NOT EXISTS (
      SELECT 1 FROM history_report_artifacts a WHERE a."requestId" = r.id AND a."deliveredAt" IS NOT NULL
    )
    AND CASE h.state->>'status'
      WHEN 'refund_decision_pending' THEN FALSE
      WHEN 'agreed' THEN (h.state->>'agreedDeadline')::timestamptz <= $2
      WHEN 'offered' THEN (h.state->>'offeredDeadline')::timestamptz <= $2
      ELSE o."activeBy" <= $2
    END
  ORDER BY r.id LIMIT 50`;

export function historyOrderStore(client: PoolClient, requestId: string, assignmentVersion: number, assertActive: () => void): HistoryOrderStore {
  return {
    assignmentVersion,
    reportArtifacts: historyReportStore(client, requestId, assertActive),
    async read() {
      assertActive();
      const { rows } = await client.query<{ snapshot: H.HistoryAcceptedOrder; wallet: string; reservedProvider: HistoryProvider | null; agreement: unknown; replacement: unknown; replacementAssignment: number; replacementRevision: number }>(
        `${activeOrders} SELECT snapshot, wallet, "activeProvider" AS "reservedProvider",
          (SELECT state FROM history_vin_agreements WHERE "requestId" = $1 ORDER BY version DESC LIMIT 1) AS agreement,
          r.state AS replacement, r."assignmentVersion" AS "replacementAssignment", r."acceptedRevision" AS "replacementRevision"
          FROM active_orders o LEFT JOIN LATERAL (
            SELECT state, "assignmentVersion", "acceptedRevision" FROM history_replacement_events
            WHERE "requestId" = $1 ORDER BY version DESC LIMIT 1
          ) r ON TRUE WHERE o."requestId" = $1`, [requestId]);
      const row = rows[0];
      if (!row) return null;
      const original = H.HistoryAcceptedOrderSchema.parse(row.snapshot);
      const agreement = row.agreement ? H.HistoryCorrectionStateSchema.parse(row.agreement) : null;
      const accepted = agreement?.accepted.at(-1);
      if (agreement && (!accepted || agreement.acceptedRevision !== accepted.revision)) throw new Error("Invalid accepted History revision");
      const replacement = row.replacement ? { state: H.HistoryReplacementStateSchema.parse(row.replacement),
        current: row.replacementAssignment === assignmentVersion && row.replacementRevision === (agreement?.acceptedRevision ?? 0) } : null;
      return { ...original, wallet: row.wallet, ...(replacement ? { replacement } : {}), ...(row.reservedProvider ? { reservedProvider: row.reservedProvider } : {}),
        ...(agreement && accepted ? { agreement, acceptedOffer: accepted.offer, originalOffer: original.acceptedOffer } : {}) };
    },
    async serialize(operation) {
      assertActive();
      await client.query("SELECT pg_advisory_xact_lock(1181, 7)");
      assertActive();
      return operation();
    },
    async capacity(day, from, by, now, excludeCurrent = false) {
      assertActive();
      const { rows } = await client.query<{ total: number; morning: number; overlapping: number }>(`
        ${activeOrders} SELECT count(*)::int AS total,
          count(*) FILTER (WHERE "activeBy" <= ($1 || 'T10:00:00+05:00')::timestamptz)::int AS morning,
          count(*) FILTER (WHERE "activeFrom" < $3 AND "activeBy" > $2)::int AS overlapping
        FROM active_orders o WHERE "activeDay" = $1 AND (NOT $5::boolean OR "requestId" <> $6)
          AND (LEAST("holdExpiresAt", "deliveryBy") > $4 OR ${hasBooking})`, [day, from, by, now, excludeCurrent, requestId]);
      return rows[0] ?? { total: 0, morning: 0, overlapping: 0 };
    },
    async providerUsage(provider, periodStart, periodEnd, now, { excludeCurrent = false, unreserved = "all" } = {}) {
      assertActive();
      const unreservedMode = typeof unreserved === "string" ? unreserved : "earlier_paid";
      const confirmedBefore = typeof unreserved === "string" ? null : unreserved.confirmedBefore;
      const { rows } = await client.query<{ used: number }>(`
        ${activeOrders}, booked_usage AS (
          SELECT COALESCE(sum(1 + (
            SELECT count(*) FROM history_fulfilment_events f WHERE f."requestId" = o."requestId"
              AND f.input->>'kind' = 'company_correction' AND f.state->>'source' = 'new_source'
              AND f."recoveryQuotaProvider" IS NULL
          )), 0) AS used FROM active_orders o
          WHERE "activeFrom" < $3 AND "activeBy" > $2
            AND (NOT $5::boolean OR "requestId" <> $6)
            AND ("activeProvider" = $1 OR ("activeProvider" IS NULL
              AND "activeOffer"->'preflight'->'providers' @> jsonb_build_array(jsonb_build_object('name', $1::text))
              AND ($7 = 'all' OR ($7 = 'earlier_paid' AND o."activeBy" > $4
                AND o."activeFrom" >= $2 AND o."activeBy" <= $3 AND EXISTS (
                  SELECT 1 FROM history_payment_checks older
                  WHERE older."requestId" = o."requestId" AND (older."bookingCommitted" OR o."replacementBooked")
                    AND older."confirmedAt" IS NOT NULL
                    AND ($8::timestamptz IS NULL OR (older."confirmedAt", older."requestId") < ($8::timestamptz, $6::text))
                )))))
            AND (LEAST("holdExpiresAt", "deliveryBy") > $4 OR ${hasBooking})
        ), recovery_usage AS (
          SELECT count(*) AS used FROM history_fulfilment_events quota
          WHERE quota."recoveryQuotaProvider" = $1 AND quota."recordedAt" >= $2 AND quota."recordedAt" < $3
            AND (NOT $5::boolean OR quota."requestId" <> $6)
            AND NOT EXISTS (
              SELECT 1 FROM history_fulfilment_events reconciled
              WHERE reconciled."requestId" = quota."requestId" AND reconciled.version > quota.version
                AND reconciled.state->>'attempt' = quota.state->>'attempt'
                AND reconciled.state->>'status' = 'retry_ready'
            )
        )
        SELECT (booked_usage.used + recovery_usage.used)::int AS used FROM booked_usage CROSS JOIN recovery_usage`,
      [provider, periodStart, periodEnd, now, excludeCurrent, requestId, unreservedMode, confirmedBefore]);
      return rows[0]?.used ?? 0;
    },
    async earlierPaidOrdersForSecondReport(provider, periodStart, periodEnd, confirmedAt, now) {
      assertActive();
      const { rows } = await client.query<{ earlier: number }>(`
        ${activeOrders} SELECT count(*)::int AS earlier FROM active_orders o
        JOIN history_payment_checks p ON p."requestId" = o."requestId" AND p."confirmedAt" IS NOT NULL AND (p."bookingCommitted" OR o."replacementBooked")
        WHERE o."activeProvider" <> $1 AND o."activeFrom" >= $2 AND o."activeBy" <= $3 AND o."activeBy" > $6
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
    async replacementAttempt(key) {
      assertActive();
      const { rows } = await client.query<{ input: H.HistoryReplacementMutation }>(
        'SELECT input FROM history_replacement_events WHERE "requestId" = $1 AND "attemptKey" = $2', [requestId, key]);
      return rows[0]?.input ?? null;
    },
    async saveReplacement({ input, state, actorId, acceptedRevision, recordedAt, booking }) {
      assertActive();
      const window = state.status === "accepted" ? state.window : null;
      await client.query(`INSERT INTO history_replacement_events
        ("requestId", version, "attemptKey", input, state, "actorId", "assignmentVersion", "acceptedRevision", "recordedAt",
          "bookingDay", "bookingFrom", "bookingBy", "bookingProvider")
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [requestId, state.version, input.attemptKey, JSON.stringify(input), JSON.stringify(H.HistoryReplacementStateSchema.parse(state)),
        actorId, assignmentVersion, acceptedRevision, recordedAt, booking?.day ?? null, window?.deliveryFrom ?? null,
        window?.deliveryBy ?? null, booking?.provider ?? null]);
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
    async hasEarlierPaidWork(confirmedAt, now, stage = "fulfilment") {
      assertActive();
      const { rows } = await client.query<{ earlier: boolean }>(`
        ${activeOrders} SELECT EXISTS (
          SELECT 1 FROM history_payment_checks p
          JOIN vehicle_history_requests r ON r.id = p."requestId"
          JOIN active_orders o ON o."requestId" = p."requestId"
          LEFT JOIN LATERAL (
            SELECT state FROM history_fulfilment_events WHERE "requestId" = p."requestId" ORDER BY version DESC LIMIT 1
          ) f ON TRUE
          LEFT JOIN LATERAL (
            SELECT state FROM history_recovery_events WHERE "requestId" = p."requestId" ORDER BY version DESC LIMIT 1
          ) h ON TRUE
          WHERE p."confirmedAt" IS NOT NULL AND (p."bookingCommitted" OR o."replacementBooked")
            AND CASE h.state->>'status'
              WHEN 'refund_decision_pending' THEN FALSE
              WHEN 'offered' THEN FALSE
              WHEN 'agreed' THEN (h.state->>'agreedDeadline')::timestamptz > $3
              ELSE o."activeBy" > $3
            END
            AND r."assignedOperatorId" = (SELECT "assignedOperatorId" FROM vehicle_history_requests WHERE id = $2)
            AND ($1::timestamptz IS NULL OR (p."confirmedAt", p."requestId") < ($1::timestamptz, $2::text))
            AND CASE WHEN f.state->>'status' = 'recovery'
              THEN h.state->>'status' = 'agreed' AND f.state->>'reason' = 'company_error'
              WHEN $4 = 'delivery' THEN NOT EXISTS (
                SELECT 1 FROM history_report_artifacts report
                WHERE report."requestId" = p."requestId" AND report."orderId" = p."orderId" AND report."deliveredAt" IS NOT NULL
              )
              ELSE COALESCE(f.state->>'status', '') <> 'obtained'
            END
        ) AS earlier`, [confirmedAt, requestId, now, stage]);
      return rows[0]?.earlier ?? false;
    },
    async saveFulfilment({ input, state, actorId, assignmentVersion, recoveryQuotaProvider = null }) {
      assertActive();
      await client.query(`INSERT INTO history_fulfilment_events
        ("requestId", version, "attemptKey", input, state, "actorId", "assignmentVersion", "recordedAt", "recoveryQuotaProvider")
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
      [requestId, state.version, input.attemptKey, JSON.stringify(input), JSON.stringify(H.HistoryFulfilmentIntentSchema.parse(state)),
        actorId, assignmentVersion, state.recordedAt, recoveryQuotaProvider]);
    },
    async recovery() {
      assertActive();
      const { rows } = await client.query<{ state: unknown }>(
        'SELECT state FROM history_recovery_events WHERE "requestId" = $1 ORDER BY version DESC LIMIT 1', [requestId]);
      return rows[0] ? H.HistoryRecoveryStateSchema.parse(rows[0].state) : null;
    },
    async recoveryAttempt(key) {
      assertActive();
      const { rows } = await client.query<{ input: HistoryRecoveryCommand; actorId: string }>(
        'SELECT input, "actorId" FROM history_recovery_events WHERE "requestId" = $1 AND "attemptKey" = $2', [requestId, key]);
      return rows[0] ?? null;
    },
    async saveRecovery(state, now, command) {
      assertActive();
      await client.query(`INSERT INTO history_recovery_events
        ("requestId", version, state, "recordedAt", "attemptKey", input, "actorId", "assignmentVersion")
        VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8)`, [requestId, state.version,
        JSON.stringify(H.HistoryRecoveryStateSchema.parse(state)), now, command?.input.attemptKey ?? null,
        command ? JSON.stringify(command.input) : null, command?.actorId ?? null, command?.assignmentVersion ?? null]);
    },
  };
}
