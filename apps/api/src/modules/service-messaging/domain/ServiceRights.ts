import type { ServiceMessagingSchemas } from "@auto-tm/contracts";

import { ServiceDenied, type ServicePurpose } from "./serviceAccess";

/** Classification must exist before bytes are accepted. Support's schedule is
 * confined to its communications; History categories never inherit it. */
export function assertServiceRights(_purpose: ServicePurpose, _upload: ServiceMessagingSchemas.ServiceStageAttachment, _now: Date): void {
  throw new ServiceDenied("INVALID_ATTACHMENT");
}
