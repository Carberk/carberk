import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryRequester, type HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HISTORY_REQUEST_REPOSITORY, type HistoryRequestRepository } from "../domain/HistoryRequestRepository";

@Injectable()
export class ListHistoryRequests {
  constructor(
    @Inject(CurrentHistoryRequester) private readonly requester: CurrentHistoryRequester,
    @Inject(HISTORY_REQUEST_REPOSITORY) private readonly requests: HistoryRequestRepository,
  ) {}
  async execute(claims: HistoryRequesterClaims, cursor?: string) {
    const { requesterId } = await this.requester.require(claims);
    return this.requests.list(requesterId, cursor);
  }
}
