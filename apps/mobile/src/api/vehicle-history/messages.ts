import { VehicleHistorySchemas } from "@auto-tm/contracts";
import { onlineManager } from "@tanstack/react-query";
import type { ZodSchema } from "zod";

import { apiClient, ApiError } from "../client";
import { assertHistorySession, type HistoryViewer } from "../../vehicle-history/session";

/** One mounted reader's contiguous HTTP evidence. Query cache is never evidence. */
export function historyTranscript(viewer: HistoryViewer, requestId: string, signal: AbortSignal) {
  const path = `/vehicle-history/requests/${encodeURIComponent(requestId)}`;
  const offered = new Map<string, string>();
  let generation = 0;
  async function transport<T>(suffix: string, schema: ZodSchema<T>, body?: unknown, guard = () => true) {
    const assertSession = async () => {
      await assertHistorySession(viewer, signal);
      if (!guard()) throw new ApiError("HISTORY_READER_CHANGED", 409);
    };
    await assertSession();
    if (!onlineManager.isOnline()) throw new ApiError("NETWORK_ERROR", 0);
    try {
      const result = body === undefined
        ? await apiClient.get(path + suffix, schema, { assertSession })
        : await apiClient.post(path + suffix, body, schema, { assertSession });
      await assertSession();
      return result;
    } catch (error) {
      await assertSession();
      if (error instanceof ApiError && error.status === 401) throw new ApiError("HISTORY_READ_DENIED", 401);
      if (error instanceof TypeError) throw new ApiError("NETWORK_ERROR", 0);
      throw error;
    }
  }
  return {
    async page(cursor: string | null) {
      if (!cursor) { generation++; offered.clear(); }
      const revision = generation;
      const previousOrder = cursor ? offered.get(cursor) : "0";
      if (!previousOrder) throw new ApiError("HISTORY_PAGE_GAP", 409);
      const page = await transport(`/messages?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        VehicleHistorySchemas.HistoryMessagesPageSchema, undefined, () => revision === generation);
      let order = BigInt(previousOrder);
      const ids = new Set<string>();
      for (const message of page.items) {
        if (BigInt(message.order) <= order || ids.has(message.id) || offered.has(message.id)
          || (message.author.kind === "requester" && message.author.id !== viewer.userId)) {
          throw new ApiError("HISTORY_PAGE_GAP", 409);
        }
        ids.add(message.id);
        order = BigInt(message.order);
      }
      if (page.nextCursor !== null && page.nextCursor !== page.items.at(-1)?.id) {
        throw new ApiError("HISTORY_PAGE_GAP", 409);
      }
      for (const message of page.items) offered.set(message.id, message.order);
      return page;
    },
    receipts: () => transport("/receipts", VehicleHistorySchemas.HistoryReceiptsSchema),
    async acknowledge(cursor: string, kind: "received" | "read", visible = () => true) {
      const revision = generation;
      const receipt = await transport("/receipts", VehicleHistorySchemas.HistoryReceiptSchema,
        VehicleHistorySchemas.AcknowledgeHistoryMessagesSchema.parse({ cursor, kind }),
        () => revision === generation && offered.has(cursor) && visible());
      const order = BigInt(offered.get(cursor) ?? "0");
      if (receipt.participantId !== viewer.userId || receipt.assignmentVersion !== 0 || BigInt(receipt.receivedOrder) < order
        || (kind === "read" && BigInt(receipt.readOrder) < order)) throw new ApiError("HISTORY_RECEIPT_INVALID", 502);
      return receipt;
    },
  };
}
