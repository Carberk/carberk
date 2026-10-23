import type { Prisma } from "@auto-tm/db";
import { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { ServiceDenied, type ServiceScope } from "../../domain/serviceAccess";
import { assertServiceRights } from "../../domain/ServiceRights";
import type { ServiceRuntime, ServiceSubject } from "../../domain/ports/ServiceMessagingPort";

type Context = { tx: Prisma.TransactionClient; scope: ServiceScope; subject: ServiceSubject; audience: "customer" | "staff"; runtime: ServiceRuntime };
function deny(): never { throw new ServiceDenied("INVALID_ATTACHMENT"); }
export function artifactRights(raw: unknown, now: Date, reuse = false): S.ServiceRights {
 const rights = S.ServiceRightsSchema.parse(raw);
 assertServiceRights("history", { category: "provider_artifact", visibility: "staff", contentType: "application/pdf", sizeBytes: 1, filename: "original.pdf", rights }, now);
 if (reuse && (!rights.use.includes("archive") || !rights.use.includes("redistribute") || rights.identifiability !== "anonymous")) deny();
 return rights;
}
export function approvedReportLink(link: string): boolean {
 try { const url = new URL(link); return url.protocol === "https:" && !url.username && !url.password && (url.hostname === "example.invalid" || ["carfax.com", "autocheck.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))); } catch { return false; }
}
export async function historyArtifactCommand({ tx, scope, subject, audience, runtime }: Context, command: S.HistoryArtifactCommand): Promise<void> {
 if (scope.purpose !== "history" || audience !== "staff") throw new ServiceDenied("NO_ACCESS");
 if (scope.assignmentVersion !== command.expectedAssignmentVersion) throw new ServiceDenied("STALE_ASSIGNMENT");
 const now = runtime.now(), order = await tx.historyOrder.findUnique({ where: { id: command.orderId }, include: { quote: true, purchase: true } });
 if (!order || order.requestId !== scope.resourceId || order.erasedAt || !order.paidAt) throw new ServiceDenied("NO_ACCESS");
 if ("expectedVersion" in command && command.expectedVersion !== order.version) throw new ServiceDenied("STALE_ASSIGNMENT");
 if (command.kind === "stage") {
  if (!order.purchase || order.purchase.state !== "completed" || command.vin !== order.quote.vin || !Array.isArray(order.quote.providers) || !order.quote.providers.includes(command.provider)) deny();
  const rights = artifactRights(command.rights, now);
  const originalDate = new Date(command.originalDate); if (originalDate > now) deny();
  if ((command.mileage && new Date(command.mileage.observedAt) > originalDate) || command.sourceObservations.some(value => value.page > command.expectedPages)) deny();
  const facts = { vehicleIdentity: command.vehicleIdentity, mileageValue: command.mileage?.value ?? null, mileageUnit: command.mileage?.unit ?? null, mileageObservedAt: command.mileage ? new Date(command.mileage.observedAt) : null, sourceObservations: command.sourceObservations };
  const prior = await tx.historyArtifact.findUnique({ where: { id: command.artifactId } });
  if (prior) { if (prior.acquiredForOrderId !== order.id || prior.sha256 !== command.sha256 || prior.vin !== command.vin || prior.provider !== command.provider || prior.originalDate.getTime() !== originalDate.getTime() || prior.sizeBytes !== command.sizeBytes || prior.expectedPages !== command.expectedPages || JSON.stringify({ vehicleIdentity: prior.vehicleIdentity, mileageValue: prior.mileageValue, mileageUnit: prior.mileageUnit, mileageObservedAt: prior.mileageObservedAt, sourceObservations: prior.sourceObservations }) !== JSON.stringify(facts)) throw new ServiceDenied("IDEMPOTENCY_CONFLICT"); return; }
  const request = await tx.vehicleHistoryRequest.findUniqueOrThrow({ where: { id: scope.resourceId } });
  await tx.historyArtifact.create({ data: { ...facts, sourceListingId: request.sourceListingId, id: command.artifactId, acquiredForOrderId: order.id, provider: command.provider, vin: command.vin, originalDate, expectedPages: command.expectedPages, sha256: command.sha256, sizeBytes: command.sizeBytes, rights, provenance: command.provenance, objectKey: `history-artifacts/${command.artifactId}/${command.sha256}` } });
 } else {
  await tx.$queryRaw`SELECT id FROM history_artifacts WHERE id=${command.artifactId} FOR UPDATE`;
  const artifact = await tx.historyArtifact.findUnique({ where: { id: command.artifactId } });
  if (!artifact || artifact.removedAt || artifact.restrictedAt || artifact.vin !== order.quote.vin) deny();
  artifactRights(artifact.rights, now, artifact.acquiredForOrderId !== order.id || command.kind === "archive");
  if (command.kind === "verify") {
   if (artifact.acquiredForOrderId !== order.id || artifact.state !== "staged" || command.vin !== artifact.vin || new Date(command.originalDate).getTime() !== artifact.originalDate.getTime() || command.readablePages !== artifact.expectedPages) deny();
   // SHA and usable PDF bytes are rechecked through the private store by the caller.
   await tx.historyArtifact.update({ where: { id: artifact.id }, data: { state: "verified", verifiedAt: now, verifiedById: subject.userId, verifiedPages: command.readablePages } });
  } else if (command.kind === "archive") {
   if (artifact.state !== "verified" || order.purchase || order.state !== "paid") deny();
   await tx.historyPurchaseIntent.create({ data: { id: runtime.id(), orderId: order.id, sourceArtifactId: artifact.id, vin: order.quote.vin, providers: [artifact.provider], state: "completed", createdById: subject.userId, reconciledAt: now } });
   await tx.historyOrder.update({ where: { id: order.id }, data: { state: "fulfilling", version: { increment: 1 } } });
  } else {
   if (!order.purchase || order.purchase.state !== "completed" || artifact.state !== "verified" || !["fulfilling", "recovery", "delivered"].includes(order.state) || !approvedReportLink(command.sharedLink)) deny();
   const prior = await tx.historyDelivery.findUnique({ where: { orderId_artifactId: { orderId: order.id, artifactId: artifact.id } } });
   if (prior) { if (prior.sharedLink !== command.sharedLink) throw new ServiceDenied("IDEMPOTENCY_CONFLICT"); return; }
   await tx.historyDelivery.create({ data: { id: runtime.id(), orderId: order.id, artifactId: artifact.id, purchaseIntentId: order.purchase.id, sharedLink: command.sharedLink, linkApprovedAt: now, deliveredById: subject.userId, deliveredAt: now } });
   await tx.historyOrder.update({ where: { id: order.id }, data: { state: "delivered", version: { increment: 1 } } });
  }
 }
 await tx.serviceAudit.create({ data: { actorId: subject.userId, purpose: "history", resourceId: scope.resourceId, action: `HISTORY_ARTIFACT_${command.kind.toUpperCase()}`, assignmentVersion: scope.assignmentVersion } });
}
