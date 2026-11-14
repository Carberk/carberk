import { onlineManager, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { VehicleHistorySchemas } from "@auto-tm/contracts";
import type { ZodSchema } from "zod";

import { apiClient, ApiError } from "../client";
import { queryKeys } from "../queryKeys";
import { assertHistorySession, type HistoryViewer } from "../../vehicle-history/session";

async function read<T>(path: string, schema: ZodSchema<T>, viewer: HistoryViewer | null | undefined, signal: AbortSignal) {
  if (!viewer) throw new ApiError("HISTORY_SESSION_CHANGED", 401);
  const assertSession = () => assertHistorySession(viewer, signal);
  await assertSession();
  if (!onlineManager.isOnline()) throw new ApiError("NETWORK_ERROR", 0);
  try {
    const result = await apiClient.get(path, schema, { assertSession });
    await assertSession();
    return result;
  } catch (error) {
    await assertSession();
    // Keep private-reader refusals local; a stale read must never invoke the global sign-in redirect.
    if (error instanceof ApiError && error.status === 401) throw new ApiError("HISTORY_READ_DENIED", 401);
    if (error instanceof TypeError) throw new ApiError("NETWORK_ERROR", 0);
    throw error;
  }
}

const options = { retry: false, staleTime: 0, networkMode: "always" as const };

export async function createHistoryRequest(input: VehicleHistorySchemas.CreateHistoryRequest, viewer: HistoryViewer, signal: AbortSignal) {
  const assertSession = () => assertHistorySession(viewer, signal);
  await assertSession();
  if (!onlineManager.isOnline()) throw new ApiError("NETWORK_ERROR", 0);
  try {
    const result = await apiClient.post("/vehicle-history/requests",
      VehicleHistorySchemas.CreateHistoryRequestSchema.parse(input), VehicleHistorySchemas.HistoryRequestSchema, { assertSession });
    await assertSession();
    return result;
  } catch (error) {
    await assertSession();
    if (error instanceof ApiError && error.status === 401) throw new ApiError("HISTORY_CREATE_DENIED", 401);
    if (error instanceof TypeError) throw new ApiError("NETWORK_ERROR", 0);
    throw error;
  }
}

export function useHistoryRequests(viewer: HistoryViewer | null | undefined, enabled: boolean) {
  return useInfiniteQuery({
    ...options,
    queryKey: queryKeys.vehicleHistory.list(viewer?.userId, viewer?.sessionId),
    enabled: enabled && !!viewer,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => read(`/vehicle-history/requests${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      VehicleHistorySchemas.ListHistoryRequestsResponseSchema, viewer, signal),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useHistoryRequest(id: string, viewer: HistoryViewer | null | undefined, enabled: boolean) {
  return useQuery({
    ...options,
    queryKey: queryKeys.vehicleHistory.detail(viewer?.userId, viewer?.sessionId, id),
    enabled: enabled && !!viewer,
    queryFn: ({ signal }) => read(`/vehicle-history/requests/${encodeURIComponent(id)}`,
      VehicleHistorySchemas.HistoryRequestSchema, viewer, signal),
  });
}
