import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { HistoryStaffSchemas } from "@auto-tm/contracts";
import { HISTORY_STAFF_REPOSITORY, type HistoryStaffRepository, type StaffSession } from "../domain/ports/HistoryStaffRepository";

@Injectable()
export class ManageHistoryStaff {
  constructor(@Inject(HISTORY_STAFF_REPOSITORY) private readonly repository: HistoryStaffRepository) {}

  execute(session: StaffSession, targetId?: string, change?: HistoryStaffSchemas.HistoryStaffChange): Promise<HistoryStaffSchemas.HistoryStaffResponse> {
    return this.repository.asFounder(session, targetId, async (store, actor) => {
      const target = targetId ? await store.findTarget(targetId) : null;
      if (!change) return { actor, target };
      if (change.targetId === actor.id) throw new ForbiddenException({ code: "HISTORY_SELF_CHANGE_DENIED", message: "Cannot change your own capabilities" });
      if (!target) throw new NotFoundException({ code: "HISTORY_TARGET_NOT_FOUND", message: "Target no longer exists" });
      if (change.active && !target.eligible) throw new ConflictException({ code: "HISTORY_TARGET_UNAVAILABLE", message: "Target cannot receive access" });
      await store.change(change);
      return { actor, target: await store.findTarget(change.targetId) };
    });
  }
}
