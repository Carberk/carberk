import type { Prisma } from "@auto-tm/db";
import { ServiceMessagingSchemas } from "@auto-tm/contracts";
import { StaffAuthorityDenied, type StaffAuthorityPort } from "../../../identity/identity.public";
import { ServiceDenied, type ServiceScope } from "../../domain/serviceAccess";
import type { ServiceRuntime, ServiceSubject } from "../../domain/ports/ServiceMessagingPort";
import { addStaffedHour, ashgabatDay, HistoryDenied, normalizeVin, receiptOutcome, recoveryOutcome, staffed, validateHistoryWindow } from "../../domain/history/HistoryPolicy";
import { assertServiceRights } from "../../domain/ServiceRights";

type Tx = Prisma.TransactionClient;
type Context = { tx: Tx; scope: ServiceScope; subject: ServiceSubject; audience: "customer" | "staff"; staff: StaffAuthorityPort; runtime: ServiceRuntime };
function deny(): never { throw new ServiceDenied("INVALID_MESSAGE"); }
function conflict(): never { throw new ServiceDenied("IDEMPOTENCY_CONFLICT"); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Called only while the shared service principal, owner and conversation locks
 * are held. Cross-request capacity also locks its named day/provider rows. */
export async function historyCommand(context: Context, command: ServiceMessagingSchemas.HistoryCommand): Promise<void> {
 const { tx, scope, subject, audience, runtime, staff } = context, now = runtime.now();
 if (scope.purpose !== "history") throw new ServiceDenied("NO_ACCESS");
 const customer = ["accept", "payment", "recovery"].includes(command.kind);
 if ((customer && audience !== "customer") || (!customer && audience !== "staff")) throw new ServiceDenied("NO_ACCESS");
 if ("expectedAssignmentVersion" in command && command.expectedAssignmentVersion !== scope.assignmentVersion) throw new ServiceDenied("STALE_ASSIGNMENT");
 try {
  if (command.kind === "capacity") {
   if (command.morningLimit > command.slotLimit || command.providers.some(row => row.consumed > row.allowance) || new Set(command.providers.map(row => row.provider)).size !== command.providers.length) deny();
   if (![ashgabatDay(now), ashgabatDay(new Date(now.getTime()+86400000))].includes(command.day)) deny();
   // Serialize edits with quote acceptance; lowering below existing usage never evicts bookings.
   await tx.historyCapacityDay.upsert({ where: { day: command.day }, create: { day: command.day, slotLimit: command.slotLimit, morningLimit: command.morningLimit, evidence: command.evidence }, update: {} });
   await tx.$queryRaw`SELECT day FROM history_capacity_days WHERE day=${command.day} FOR UPDATE`;
   await tx.historyCapacityDay.update({ where: { day: command.day }, data: { slotLimit: command.slotLimit, morningLimit: command.morningLimit, evidence: command.evidence } });
   for (const row of [...command.providers].sort((a,b) => a.provider.localeCompare(b.provider))) await tx.historyProviderAllowance.upsert({ where: { provider_day: { provider: row.provider, day: command.day } }, create: { ...row, resetAt: new Date(row.resetAt), day: command.day }, update: { allowance: row.allowance, consumed: row.consumed, resetAt: new Date(row.resetAt), evidence: row.evidence } });
  } else if (command.kind === "quote") {
   const vin = normalizeVin(command.vin), start = new Date(command.windowStart), end = new Date(command.windowEnd);
   if (command.preflightOutcome === "available") validateHistoryWindow(now, start, end, command.feasible);
   const existing = await tx.historyQuote.findUnique({ where: { id: command.quoteId } });
   const data = { requestId: scope.resourceId, vin, amount: 100, providers: command.providers, preflightOutcome: command.preflightOutcome, preflightEvidence: command.preflightEvidence, refundRule: command.refundRule, windowStart: start, windowEnd: end, feasible: command.feasible };
   if (existing) {
    if (!same({ requestId: existing.requestId, vin: existing.vin, amount: existing.amount, providers: existing.providers, preflightOutcome: existing.preflightOutcome, preflightEvidence: existing.preflightEvidence, refundRule: existing.refundRule, windowStart: existing.windowStart, windowEnd: existing.windowEnd, feasible: existing.feasible }, data)) conflict();
    return;
   }
   const currentOrder = await tx.historyOrder.findUnique({ where: { requestId: scope.resourceId }, include: { quote: true, purchase: true } });
   if (currentOrder && (currentOrder.paidAt || currentOrder.purchase || !["expired", "review"].includes(currentOrder.state) || currentOrder.quote.vin !== vin || !same(currentOrder.quote.providers, command.providers) || currentOrder.quote.refundRule !== command.refundRule)) deny();
   await tx.historyQuote.updateMany({ where: { requestId: scope.resourceId, acceptedAt: null, supersededAt: null }, data: { supersededAt: now } });
   await tx.historyQuote.create({ data: { ...data, id: command.quoteId, offeredById: subject.userId } });
   await tx.vehicleHistoryRequest.update({ where: { id: scope.resourceId }, data: { proposedVin: vin } });
  } else if (command.kind === "accept") {
   const quote = await tx.historyQuote.findUnique({ where: { id: command.quoteId } });
   if (!quote || quote.requestId !== scope.resourceId || quote.erasedAt || quote.supersededAt || quote.preflightOutcome !== "available") deny();
   if (!same([quote.vin, quote.providers, quote.amount, quote.refundRule, quote.windowStart.toISOString(), quote.windowEnd.toISOString()], [command.vin, command.providers, command.amount, command.refundRule, command.windowStart, command.windowEnd])) conflict();
   const prior = await tx.historyOrder.findUnique({ where: { requestId: scope.resourceId } });
   if (prior?.quoteId === quote.id) return;
   const acceptedBooking = prior ? await tx.historyBooking.findUnique({ where: { orderId_clientBookingId: { orderId: prior.id, clientBookingId: quote.id } } }) : null;
   if (acceptedBooking) return;
   const receipt = prior ? await tx.historyPayment.findFirst({ where: { orderId: prior.id, verifiedFunds: true, amount: 100, confirmedAt: { not: null }, receivedAt: { not: null } }, orderBy: { confirmedAt: "asc" } }) : null;
   if (prior && (prior.paidAt || !["review", "expired"].includes(prior.state) || !receipt?.confirmedAt || !receipt.receivedAt || receipt.receivedAt > receipt.confirmedAt || !staffed(receipt.confirmedAt) || !staffed(now))) deny();
   validateHistoryWindow(now, quote.windowStart, quote.windowEnd, quote.feasible);
   assertServiceRights("history", { category: "payment_evidence", visibility: "staff", contentType: "image/webp", sizeBytes: 1, filename: "order", rights: command.rights }, now);
   const day = ashgabatDay(quote.windowStart), morning = day !== ashgabatDay(now);
   await tx.$queryRaw`SELECT day FROM history_capacity_days WHERE day=${day} FOR UPDATE`;
   const capacity = await tx.historyCapacityDay.findUnique({ where: { day } });
   if (!capacity || capacity.mode !== "synthetic") deny();
   await tx.historyOrder.updateMany({ where: { day, state: "held", holdExpiresAt: { lte: now } }, data: { state: "expired", version: { increment: 1 } } });
   const active = { day, state: { in: ["held", "paid", "purchasing", "purchase_uncertain", "fulfilling", "recovery"] } };
   if (await tx.historyOrder.count({ where: active }) >= capacity.slotLimit || (morning && await tx.historyOrder.count({ where: { ...active, morning: true } }) >= capacity.morningLimit)) deny();
   for (const provider of [...command.providers].sort()) {
    await tx.$queryRaw`SELECT provider FROM history_provider_allowances WHERE provider=${provider} AND day=${day} FOR UPDATE`;
    const allowance = await tx.historyProviderAllowance.findUnique({ where: { provider_day: { provider, day } } });
    // Other-channel consumption is explicit. Unpurchased active bookings reserve this provider.
    const reserved = await tx.historyOrder.count({ where: { ...active, quote: { providers: { array_contains: provider } }, purchase: { is: null } } });
    if (!allowance || allowance.mode !== "synthetic" || allowance.resetAt > quote.windowStart || allowance.consumed + reserved >= allowance.allowance) deny();
   }
   await tx.historyQuote.update({ where: { id: quote.id }, data: { acceptedAt: now } });
   if (prior && receipt?.confirmedAt && receipt.receivedAt) {
    await tx.historyBooking.create({ data: { id: runtime.id(), orderId: prior.id, clientBookingId: quote.id, vin: quote.vin, providers: quote.providers as Prisma.InputJsonValue, amount: 100, refundRule: quote.refundRule, windowStart: quote.windowStart, windowEnd: quote.windowEnd, acceptedAt: now } });
    await tx.historyOrder.update({ where: { id: prior.id }, data: { day, morning, state: "paid", promiseAt: quote.windowEnd, paidAt: receipt.confirmedAt, receivedAt: receipt.receivedAt, rights: command.rights, version: { increment: 1 } } });
    await tx.historyPayment.update({ where: { id: receipt.id }, data: { state: "confirmed" } });
   } else await tx.historyOrder.create({ data: { id: runtime.id(), requestId: scope.resourceId, quoteId: quote.id, day, morning, holdExpiresAt: new Date(now.getTime()+7200000), promiseAt: quote.windowEnd, rights: command.rights } });
  } else {
   const order = await tx.historyOrder.findUnique({ where: { id: command.orderId }, include: { quote: true, purchase: true, refund: true } });
   if (!order || order.requestId !== scope.resourceId || order.erasedAt) throw new ServiceDenied("NO_ACCESS");
   if (command.kind === "payment") {
    const prior = await tx.historyPayment.findUnique({ where: { orderId_clientPaymentId: { orderId: order.id, clientPaymentId: command.clientPaymentId } } });
    if (prior) { if (prior.claim !== command.claim || prior.attachmentId !== (command.attachmentId ?? null)) conflict(); return; }
    if (command.attachmentId) {
     const file = await tx.serviceAttachment.findUnique({ where: { id: command.attachmentId } });
     if (!file || file.conversationId !== scope.conversationId || file.uploaderId !== subject.userId || file.lifecycleEpoch !== scope.lifecycleEpoch || file.category !== "payment_evidence" || file.removedAt || !["staged","adopted"].includes(file.state) || !file.objectKey) deny();
    }
    await tx.historyPayment.create({ data: { id: runtime.id(), orderId: order.id, clientPaymentId: command.clientPaymentId, claim: command.claim, attachmentId: command.attachmentId ?? null } });
   } else {
    if (command.expectedVersion !== order.version) throw new ServiceDenied("STALE_ASSIGNMENT");
    if (command.kind === "verify") {
     await staff.authorize({ ...subject, capability: "history.payment.verify" }, tx);
     const payment = await tx.historyPayment.findUnique({ where: { id: command.paymentId } });
     if (!payment || payment.orderId !== order.id) deny();
     if (payment.state === "confirmed") return;
     const receivedAt = new Date(command.receivedAt);
     await tx.$queryRaw`SELECT day FROM history_capacity_days WHERE day=${order.day} FOR UPDATE`;
     const current = await tx.historyOrder.findUniqueOrThrow({ where: { id: order.id } });
     const outcome = receiptOutcome({ expiresAt: current.holdExpiresAt, active: current.state === "held" }, { receivedAt, verifiedAt: now, amount: command.amount, verifiedFunds: command.verifiedFunds });
     await tx.historyPayment.update({ where: { id: payment.id }, data: { amount: command.amount, receivedAt, confirmedAt: now, confirmedById: subject.userId, evidence: command.evidence, verifiedFunds: command.verifiedFunds, state: outcome === "paid" ? "confirmed" : "review" } });
     if (current.paidAt) { await tx.historyPayment.update({ where: { id: payment.id }, data: { state: "duplicate" } }); }
     else await tx.historyOrder.update({ where: { id: order.id }, data: { state: outcome, ...(outcome === "paid" ? { paidAt: now, receivedAt } : {}), version: { increment: 1 } } });
    } else if (command.kind === "purchase") {
     if (order.purchase) return;
     if (order.state !== "paid" || !order.paidAt || !order.quote.vin) deny();
     // A shared advisory lock fences the global paid FIFO across independent requests.
     await tx.$queryRaw`SELECT pg_advisory_xact_lock(897912)`;
     const first = await tx.historyOrder.findFirst({ where: { state: "paid" }, orderBy: [{ paidAt: "asc" }, { id: "asc" }] });
     if (first?.id !== order.id) deny();
     for (const provider of ServiceMessagingSchemas.HistoryCommandSchema.options[1].shape.providers.parse(order.quote.providers).sort()) {
      await tx.$queryRaw`SELECT provider FROM history_provider_allowances WHERE provider=${provider} AND day=${order.day} FOR UPDATE`;
      const allowance = await tx.historyProviderAllowance.findUnique({ where: { provider_day: { provider, day: order.day } } });
      if (!allowance || allowance.consumed >= allowance.allowance || allowance.resetAt > now) deny();
      await tx.historyProviderAllowance.update({ where: { provider_day: { provider, day: order.day } }, data: { consumed: { increment: 1 } } });
     }
     await tx.historyPurchaseIntent.create({ data: { id: runtime.id(), orderId: order.id, vin: order.quote.vin, providers: order.quote.providers as Prisma.InputJsonValue, createdById: subject.userId } });
     await tx.historyOrder.update({ where: { id: order.id }, data: { state: "purchasing", version: { increment: 1 } } });
    } else if ((command.kind === "purchase_uncertain" || command.kind === "purchase_completed" || command.kind === "purchase_no_data")) {
     if (!order.purchase || !["purchasing", "purchase_uncertain"].includes(order.state) || !["prepared", "uncertain"].includes(order.purchase.state)) deny();
     if (command.kind === "purchase_completed" && !("reference" in command && command.reference)) deny();
     await tx.historyPurchaseIntent.update({ where: { id: order.purchase.id }, data: { state: command.kind === "purchase_uncertain" ? "uncertain" : command.kind === "purchase_completed" ? "completed" : "no_data", externalReference: command.reference ?? null, reconciledAt: command.kind === "purchase_uncertain" ? null : now } });
     const state = command.kind === "purchase_uncertain" ? "purchase_uncertain" : command.kind === "purchase_completed" ? "fulfilling" : "refund_pending";
     await tx.historyOrder.update({ where: { id: order.id }, data: { state, version: { increment: 1 } } });
     if (state === "refund_pending") await tx.historyRefund.upsert({ where: { orderId: order.id }, create: { orderId: order.id, reason: command.reason }, update: {} });
    } else if (command.kind === "missed") {
     if (!order.paidAt || ["delivered","refunded"].includes(order.state) || (order.recoveryDeadline ?? order.promiseAt) > now) deny();
     await tx.historyOrder.update({ where: { id: order.id }, data: { escalatedAt: order.escalatedAt ?? now, state: order.recoveryUsed ? "refund_pending" : order.state, version: { increment: 1 } } });
     if (order.recoveryUsed) await tx.historyRefund.upsert({ where: { orderId: order.id }, create: { orderId: order.id, reason: command.reason }, update: {} });
    } else if (command.kind === "recovery_offer") {
     if (!order.escalatedAt || !order.paidAt || order.recoveryUsed || ["delivered", "refunded", "refund_pending"].includes(order.state)) deny();
     // Refresh only an expired offer; an active offer is immutable for the customer's review.
     if (order.recoveryOfferExpiresAt && order.recoveryOfferExpiresAt > now) return;
     await tx.historyOrder.update({ where: { id: order.id }, data: { recoveryOfferedAt: now, recoveryOfferedDeadline: addStaffedHour(now), recoveryOfferExpiresAt: new Date(now.getTime()+60000), version: { increment: 1 } } });
    } else if (command.kind === "recovery") {
     if (!order.escalatedAt || !order.paidAt || ["delivered","refunded","refund_pending"].includes(order.state)) deny();
     const deadline = command.deadline ? new Date(command.deadline) : null;
     const result = recoveryOutcome({ recoveryUsed: order.recoveryUsed, customerAgreed: command.agree, deadline, offeredAt: order.recoveryOfferedAt, offeredDeadline: order.recoveryOfferedDeadline, offerExpiresAt: order.recoveryOfferExpiresAt }, now);
     await tx.historyOrder.update({ where: { id: order.id }, data: { state: result === "agreed" ? "recovery" : "refund_pending", ...(result === "agreed" ? { recoveryUsed: true, recoveryAgreedAt: now, recoveryDeadline: deadline } : {}), version: { increment: 1 } } });
     if (result === "refund_pending") await tx.historyRefund.upsert({ where: { orderId: order.id }, create: { orderId: order.id, reason: "Recovery declined or exhausted" }, update: {} });
    } else if (command.kind === "refund_request") {
     if (order.refund) return;
     if (!["review", "expired"].includes(order.state) || order.paidAt || order.purchase) deny();
     const verified = await tx.historyPayment.findFirst({ where: { orderId: order.id, verifiedFunds: true, amount: 100, receivedAt: { not: null }, confirmedAt: { not: null } } });
     if (!verified) deny();
     await tx.historyRefund.create({ data: { orderId: order.id, reason: command.reason } });
     await tx.historyOrder.update({ where: { id: order.id }, data: { state: "refund_pending", version: { increment: 1 } } });
    } else if (command.kind === "refund_approve" || command.kind === "refund_execute") {
     await staff.authorize({ ...subject, capability: "founder.refund.approve" }, tx);
     if (order.state !== "refund_pending" || !order.refund) deny();
     if (command.kind === "refund_approve") {
      if (order.refund.state !== "pending") deny();
      await tx.historyRefund.update({ where: { id: order.refund.id }, data: { state: "approved", approvedAt: now, approvedById: subject.userId } });
      await tx.historyOrder.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
     }
     else {
      if (order.refund.state !== "approved" || !command.reference) deny();
      await tx.historyRefund.update({ where: { id: order.refund.id }, data: { state: "executed", executedAt: now, executedById: subject.userId, executionReference: command.reference } });
      await tx.historyOrder.update({ where: { id: order.id }, data: { state: "refunded", version: { increment: 1 } } });
     }
    } else deny();
   }
  }
  await tx.serviceAudit.create({ data: { actorId: subject.userId, purpose: "history", resourceId: scope.resourceId, action: `HISTORY_${command.kind.toUpperCase()}`, assignmentVersion: scope.assignmentVersion } });
 } catch (error) {
  if (error instanceof StaffAuthorityDenied) throw new ServiceDenied("NO_ACCESS");
  if (error instanceof HistoryDenied) throw new ServiceDenied("INVALID_MESSAGE");
  throw error;
 }
}
