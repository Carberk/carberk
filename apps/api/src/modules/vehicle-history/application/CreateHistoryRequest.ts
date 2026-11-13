import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import { CurrentHistoryRequester, type HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HISTORY_REQUEST_REPOSITORY, type HistoryRequestRepository } from "../domain/HistoryRequestRepository";

@Injectable()
export class CreateHistoryRequest {
  constructor(
    @Inject(CurrentHistoryRequester) private readonly requester: CurrentHistoryRequester,
    @Inject(HISTORY_REQUEST_REPOSITORY) private readonly requests: HistoryRequestRepository,
  ) {}
  async execute(claims: HistoryRequesterClaims, input: VehicleHistorySchemas.CreateHistoryRequest) {
    const actor = await this.requester.require(claims);
    return this.requests.create({ ...actor, attemptKey: input.attemptKey, sourceListingId: input.sourceListingId ?? null });
  }
}
