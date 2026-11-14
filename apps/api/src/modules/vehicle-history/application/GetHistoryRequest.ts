import { HistoryRequestProjection } from "./HistoryRequestProjection";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryRequester, type HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HISTORY_REQUEST_REPOSITORY, type HistoryRequestRepository } from "../domain/HistoryRequestRepository";

@Injectable()
export class GetHistoryRequest {
  constructor(
    @Inject(HistoryRequestProjection) private readonly projection: HistoryRequestProjection,
    @Inject(CurrentHistoryRequester) private readonly requester: CurrentHistoryRequester,
    @Inject(HISTORY_REQUEST_REPOSITORY) private readonly requests: HistoryRequestRepository,
  ) {}
  async execute(claims: HistoryRequesterClaims, id: string) {
    const { requesterId } = await this.requester.require(claims);
    const result = await this.requests.find(requesterId, id);
    if (!result) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
    return this.projection.one(result);
  }
}
