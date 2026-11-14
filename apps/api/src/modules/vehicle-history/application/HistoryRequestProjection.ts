import { Inject, Injectable } from "@nestjs/common";
import { IDENTITY_READ_PORT, type IdentityReadPort, type IdentityUserSummary } from "../../identity/identity.public";
import type { HistoryRequest } from "../domain/HistoryRequestRepository";

/** One explicit public projection, shared by create retries and both readers. */
@Injectable()
export class HistoryRequestProjection {
  constructor(@Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort) {}

  async many(requests: HistoryRequest[]) {
    const ids = [...new Set(requests.flatMap((item) => item.assignedOperatorId ? [item.assignedOperatorId] : []))];
    const users = ids.length ? await this.identity.findUsersByIds(ids) : [];
    const operators = new Map(users.map((user) => [user.id, user]));
    return requests.map((item) => this.present(item, operators.get(item.assignedOperatorId ?? "")));
  }

  async one(request: HistoryRequest) {
    const user = request.assignedOperatorId ? await this.identity.findUserById(request.assignedOperatorId) : null;
    return this.present(request, user);
  }

  private present({ assignedOperatorId: _id, ...item }: HistoryRequest, user: IdentityUserSummary | null | undefined) {
    return { ...item, assignedOperator: user ? {
      id: user.id, displayName: user.deleted ? null : user.displayName, nameNumber: user.nameNumber,
    } : null };
  }
}
