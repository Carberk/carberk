import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_CHECK_PORT, IDENTITY_READ_PORT, type IdentityCheckPort, type IdentityReadPort } from "../../identity/identity.public";
import { coversHistoryFormat, checkFulfilmentVersion } from "../domain/HistoryFulfilment";
import { bookedPayment, type HistoryOrderStore, type HistoryRecoveryCommand } from "../domain/HistoryOrder";
import { refundReview, settleHistoryRecovery } from "../domain/HistoryRecovery";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";

@Injectable()
export class DecideHistoryRecovery {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  async execute(actor: HistoryMessageActor, id: string, input: HistoryRecoveryCommand) {
    const current = await this.access.run(actor, id, async (owner, actorId, _id, participant, _waiting, _offer, orders) => {
      const [requester, deleting] = await Promise.all([this.identity.findUserById(owner), this.checks.isDeletionScheduled(owner)]);
      if (!requester || requester.deleted || requester.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      if (order?.id !== input.orderId || !bookedPayment(order, await orders.paymentChecks())) return null;
      const delivered = !!await orders.reportArtifacts.delivered(order.id);
      const intent = await orders.fulfilment();
      const previous = await orders.recoveryAttempt(input.attemptKey);
      const state = await settleHistoryRecovery(orders, order, this.clock.now(), delivered, intent);
      if (!state) return null;
      if (previous) return previous.actorId === actorId && isDeepStrictEqual(previous.input, input) ? state : null;
      if (delivered || state.version !== input.expectedVersion || state.version === 2147483647) return null;
      const now = this.clock.now();
      const cutoff = state.status === "offered" ? state.offeredDeadline : state.status === "agreed" ? state.agreedDeadline : null;
      if (cutoff && now >= new Date(cutoff)) {
        await settleHistoryRecovery(orders, order, now, false, intent);
        return null;
      }
      const next = recoveryDecision(state, input, intent, now);
      if (!next) return null;
      if (next.agreedFormat && next.agreedFormat !== state.agreedFormat && intent) {
        await applyFormatAgreement(orders, intent, next.agreedFormat, actorId, now);
      }
      await orders.saveRecovery(next, now, { input, actorId, assignmentVersion: participant.assignmentVersion });
      return next;
    });
    if (!current) throw new HistoryRequestError("HISTORY_RECOVERY_CONFLICT");
    return current;
  }
}

function recoveryDecision(state: H.HistoryRecoveryState, input: HistoryRecoveryCommand, intent: H.HistoryFulfilmentIntent | null,
  now: Date): H.HistoryRecoveryState | null {
  const next = { ...state, version: state.version + 1 };
  switch (input.kind) {
    case "company_error_refund":
      return state.status !== "refund_decision_pending" && intent?.status === "recovery" && intent.reason === "company_error"
        ? refundReview(state, "company_error", now) : null;
    case "propose_format": {
      const report = intent && "report" in intent ? intent.report : null;
      return (state.status === "offered" || state.status === "agreed") && !state.agreedFormat && state.originalFormat !== input.format
        && (state.failure === "format_unavailable" || state.failure === "file_delivery")
        && state.proposedFormat !== input.format && report && coversHistoryFormat(input.format, report.format)
        ? { ...next, proposedFormat: input.format } : null;
    }
    case "decline":
      return state.status === "offered" ? refundReview(state, "declined", now) : null;
    case "accept":
      return state.status === "offered" && state.offeredDeadline === input.deadline && (state.proposedFormat ?? state.originalFormat) === input.format
        ? { ...next, status: "agreed", agreedDeadline: input.deadline, agreedAt: now.toISOString(), agreedFormat: state.proposedFormat } : null;
    case "accept_format":
      return state.status === "agreed" && state.agreedDeadline === input.deadline && state.proposedFormat === input.format && !state.agreedFormat
        ? { ...next, agreedFormat: input.format } : null;
  }
}

async function applyFormatAgreement(orders: HistoryOrderStore, intent: H.HistoryFulfilmentIntent,
  format: H.HistoryRecoveryState["originalFormat"], actorId: string, now: Date) {
  checkFulfilmentVersion(intent, intent.version);
  const report = "report" in intent ? intent.report : null;
  if (!report || !coversHistoryFormat(format, report.format)) throw new HistoryRequestError("HISTORY_RECOVERY_CONFLICT");
  const { id, version, attempt, source, funding, accepted } = intent;
  await orders.saveFulfilment({ input: { kind: "recovery_format", attemptKey: randomUUID(), format },
    state: { id, version: version + 1, attempt, source, funding, accepted: { ...accepted, format }, status: "obtained",
      report, recordedAt: now.toISOString() }, actorId, assignmentVersion: orders.assignmentVersion });
}
