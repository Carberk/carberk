import type { ServiceMessagingSchemas } from "@auto-tm/contracts";

import { ServiceDenied, type ServicePurpose } from "./serviceAccess";

/** Classification must exist before bytes are accepted. Support's schedule is
 * confined to its communications; History categories never inherit it. */
export function assertServiceRights(purpose: ServicePurpose, upload: ServiceMessagingSchemas.ServiceStageAttachment, now: Date): void {
  const rights = upload.rights;
  const refuse = () => { throw new ServiceDenied("INVALID_ATTACHMENT"); };
  if (upload.category !== rights.category || !rights.basis.trim() || !rights.purpose.trim() || !rights.provenance.trim() || !rights.use.includes("service")) refuse();
  if (upload.sizeBytes <= 0 || upload.sizeBytes > 20 * 1024 * 1024) refuse();
  if (rights.hold && new Date(rights.hold.until) <= now) refuse();
  if (purpose === "support") {
    if (upload.category !== "support_communication" || upload.contentType === "application/pdf" || upload.sizeBytes > 5 * 1024 * 1024 || rights.schedule.kind !== "support_case" || rights.use.some(use => use !== "service")) refuse();
    return;
  }
  if (upload.category === "support_communication" || rights.schedule.kind === "support_case") refuse();
  if (rights.schedule.kind === "until" && new Date(rights.schedule.until) <= now) refuse();
  if (rights.schedule.kind === "permitted_knowledge") {
    if (upload.category !== "vehicle_observation" || rights.identifiability !== "anonymous" || !rights.use.includes("archive") || new Date(rights.schedule.reviewAt) <= now) refuse();
  }
  if (upload.category === "provider_artifact" && (upload.contentType !== "application/pdf" || !rights.supplierRestrictions.trim())) refuse();
  if (upload.contentType === "application/pdf" && upload.category !== "provider_artifact") refuse();
}
