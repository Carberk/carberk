import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../api/client";
import { useAuth } from "../auth/useAuth";

const list = z.array(z.object({ id: z.string().uuid(), purpose: S.ServicePurposeSchema, createdAt: z.string().datetime() }));
export const serviceKeys = { all: (userId: string | null) => ["services", userId] as const, list: (userId: string | null) => ["services", userId, "list"] as const, detail: (userId: string | null, id: string | null) => ["services", userId, "detail", id] as const };
export function useServiceList() {
 const { userId, isAuthenticated } = useAuth();
 return useQuery({ queryKey: serviceKeys.list(userId), queryFn: () => apiClient.get("/services/conversations", list), enabled: isAuthenticated === true && !!userId, staleTime: 0, gcTime: 0, retry: false });
}
export function useServiceConversation(id: string | null) {
 const { userId, isAuthenticated } = useAuth();
 return useInfiniteQuery({ queryKey: serviceKeys.detail(userId, id), initialPageParam: 0, queryFn: ({ pageParam }) => apiClient.get(`/services/conversations/${id}?limit=50&after=${pageParam}`, S.ServiceConversationSchema), getNextPageParam: page => page.hasMore ? page.messages.at(-1)?.sequence : undefined, enabled: isAuthenticated === true && !!userId && !!id, staleTime: 0, gcTime: 0, retry: false });
}
export function useServiceSend(id: string | null) {
 const { userId } = useAuth(); const client = useQueryClient();
 return useMutation({ mutationFn: (input: S.ServiceSend) => apiClient.post(`/services/conversations/${id}/messages`, input, S.ServiceMessageSchema), onSuccess: () => { void client.invalidateQueries({ queryKey: serviceKeys.all(userId) }); } });
}
export function useServiceOpen() {
 const client = useQueryClient(); const { userId } = useAuth();
 return useMutation({ mutationFn: (purpose: S.ServicePurpose) => apiClient.post("/services/conversations", { purpose, synthetic: true }, z.object({ id: z.string().uuid(), resourceId: z.string().uuid() })), onSuccess: () => { void client.invalidateQueries({ queryKey: serviceKeys.all(userId) }); } });
}
