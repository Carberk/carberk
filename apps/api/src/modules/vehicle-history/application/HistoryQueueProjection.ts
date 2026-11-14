import { Inject, Injectable } from "@nestjs/common";
import { IdentitySchemas } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, type IdentityReadPort } from "../../identity/identity.public";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import type { HistoryQueueItem } from "../domain/HistoryAssignmentRepository";

/** Public Identity facts only; requester IDs never cross the operator boundary. */
@Injectable()
export class HistoryQueueProjection {
  constructor(@Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort) {}

  async many(items: HistoryQueueItem[], operatorId: string) {
    const ids = [...new Set(items.flatMap((item) => [item.requesterId, ...(item.assignedOperatorId ? [item.assignedOperatorId] : [])]))];
    const users = new Map((await this.identity.findUsersByIds(ids)).map((user) => [user.id, user]));
    return items.map((item) => {
      const requester = users.get(item.requesterId), operator = users.get(item.assignedOperatorId ?? "");
      return { id: item.id, createdAt: item.createdAt, assignmentVersion: item.assignmentVersion,
        mine: item.assignedOperatorId === operatorId,
        requester: requester ? { displayName: requester.deleted ? null : requester.displayName,
          nameNumber: requester.nameNumber, deleted: requester.deleted } : null,
        assignedOperator: operator ? { id: operator.id, displayName: operator.deleted ? null : operator.displayName, nameNumber: operator.nameNumber } : null };
    });
  }

  async one(item: HistoryQueueItem & { sourceListingId: string | null }, operatorId: string) {
    const [projected] = await this.many([item], operatorId);
    if (!projected) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return { ...projected, sourceListingId: item.sourceListingId };
  }

  matches(item: Awaited<ReturnType<HistoryQueueProjection["many"]>>[number] | undefined, search?: string) {
    if (!item) return false;
    if (!search) return true;
    const requester = item.requester;
    const term = search.toLocaleLowerCase();
    return item.id.toLowerCase().includes(term) || Boolean(requester && !requester.deleted &&
      ["tk", "ru", "en"].some((locale) => IdentitySchemas.formatDisplayName(requester, locale).toLocaleLowerCase().includes(term)));
  }
}
