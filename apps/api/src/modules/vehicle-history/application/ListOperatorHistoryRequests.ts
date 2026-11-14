import { Inject, Injectable } from "@nestjs/common";
import { HistoryQueueProjection } from "./HistoryQueueProjection";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository, type HistoryQueueQuery, type HistoryQueueItem } from "../domain/HistoryAssignmentRepository";

@Injectable()
export class ListOperatorHistoryRequests {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(HistoryQueueProjection) private readonly projection: HistoryQueueProjection,
  ) {}
  async execute(claims: HistoryRequesterClaims, query: HistoryQueueQuery) {
    const actor = await this.operator.require(claims);
    const candidates: HistoryQueueItem[] = [];
    const items: Awaited<ReturnType<HistoryQueueProjection["many"]>> = [];
    let cursor = query.cursor;
    do {
      const page = await this.assignments.list(actor.id, { ...query, cursor });
      if (cursor === query.cursor && page.anchor && !this.projection.matches((await this.projection.many([page.anchor], actor.id))[0], query.search)) {
        throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
      }
      const projected = await this.projection.many(page.items, actor.id);
      for (const [index, item] of projected.entries()) {
        const candidate = page.items[index];
        if (candidate && this.projection.matches(item, query.search)) {
          candidates.push(candidate); items.push(item);
          if (items.length === 51) break;
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor && items.length < 51);
    // Identity enrichment can wait: never publish a stale grant or assignment.
    await this.assignments.confirmQueue(actor.id, query, candidates);
    await this.operator.require(claims);
    return { items: items.slice(0, 50), nextCursor: items.length > 50 ? items[49]?.id ?? null : null };
  }
}
