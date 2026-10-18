import { expect, it } from "vitest";
import type { ServiceMessagingSchemas } from "@auto-tm/contracts";

import { assertReadableServiceRights, assertServiceRights } from "./ServiceRights";
import { ServiceDenied } from "./serviceAccess";

const now = new Date("2026-10-15T00:00:00Z");
const image: ServiceMessagingSchemas.ServiceStageAttachment = { category: "support_communication", visibility: "customer", contentType: "image/jpeg", sizeBytes: 1024, filename: "image.jpg", rights: { category: "support_communication", purpose: "Support appeal", basis: "Support requested by customer", provenance: "Customer image", identifiability: "personal", use: ["service"], schedule: { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true }, supplierRestrictions: "", hold: null } };
it("admits one bounded Support image under only the accepted Support lifecycle", () => {
  expect(() => assertServiceRights("support", image, now)).not.toThrow();
});
it.each([
  { ...image, contentType: "application/pdf" as const },
  { ...image, sizeBytes: 5 * 1024 * 1024 + 1 },
  { ...image, category: "provider_artifact" as const },
  { ...image, rights: { ...image.rights, use: ["archive" as const] } },
])("refuses Support PDF, oversized data and archive-laundered personal content", invalid => {
  expect(() => assertServiceRights("support", invalid, now)).toThrow(ServiceDenied);
});
it("keeps original provider PDF rights separate and rejects absent or expired History category schedule", () => {
  const pdf: ServiceMessagingSchemas.ServiceStageAttachment = { ...image, category: "provider_artifact", contentType: "application/pdf", filename: "original.pdf", rights: { ...image.rights, category: "provider_artifact", provenance: "Provider original dated report", supplierRestrictions: "Synthetic fixture only, no licensed distribution", schedule: { kind: "until", until: "2026-11-15T00:00:00Z", reason: "Synthetic test deadline" } } };
  expect(() => assertServiceRights("history", pdf, now)).not.toThrow();
  expect(() => assertServiceRights("history", { ...pdf, rights: { ...pdf.rights, schedule: image.rights.schedule } }, now)).toThrow(ServiceDenied);
  expect(() => assertServiceRights("history", { ...pdf, rights: { ...pdf.rights, schedule: { kind: "until", until: "2026-01-01T00:00:00Z", reason: "Expired" } } }, now)).toThrow(ServiceDenied);
});
it("denies expired ordinary attachment access before asynchronous cleanup, including a storage hold", () => {
 const rights = { ...image.rights, category: "payment_evidence" as const, schedule: { kind: "until" as const, until: now.toISOString(), reason: "Expired personal record" }, hold: { until: "2026-12-01T00:00:00Z", reason: "Preserve for dispute only" } };
 expect(() => assertReadableServiceRights(rights, "payment_evidence", now)).toThrow(ServiceDenied);
 expect(() => assertReadableServiceRights({ ...rights, schedule: { ...rights.schedule, until: "2026-12-01T00:00:00Z" } }, "payment_evidence", now)).not.toThrow();
});
it("denies malformed, misclassified or expired Support access while keeping a recently closed case readable", () => {
 expect(() => assertReadableServiceRights({}, "support_communication", now)).toThrow(ServiceDenied);
 expect(() => assertReadableServiceRights(image.rights, "payment_evidence", now)).toThrow(ServiceDenied);
 expect(() => assertReadableServiceRights(image.rights, "support_communication", now, new Date(now.getTime() - 90 * 86_400_000))).toThrow(ServiceDenied);
 expect(() => assertReadableServiceRights(image.rights, "support_communication", now, new Date(now.getTime() - 89 * 86_400_000))).not.toThrow();
});
