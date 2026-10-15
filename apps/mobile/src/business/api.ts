import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BusinessSchemas } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../api/client";
import { useAuth } from "../auth/useAuth";
const key = (userId: string | null) => ["business", userId, "current"] as const;
export function useBusinessWorkspace() {
 const { userId, isAuthenticated } = useAuth();
 return useQuery({ queryKey: key(userId), queryFn: () => apiClient.get("/business/current", BusinessSchemas.BusinessCurrentSchema), enabled: isAuthenticated === true && !!userId, staleTime: 0, gcTime: 0 });
}
type Action = { kind: "redeem"; token: string } | { kind: "invite"; businessId: string; recipientUserId: string } | { kind: "settings"; businessId: string; name: string } | { kind: "member"; businessId: string; targetUserId: string; action: "remove" | "suspend" | "restore" } | { kind: "revoke"; businessId: string; invitationId: string };
export function useBusinessAction() {
 const client = useQueryClient(); const { userId } = useAuth();
 return useMutation({ mutationFn: async (action: Action) => {
  if (action.kind === "redeem") { await apiClient.post("/business/invitations/redeem", { token: action.token }, z.object({ businessId: z.string().uuid() })); return null; }
  const path = `/business/${encodeURIComponent(action.businessId)}`;
  if (action.kind === "invite") return apiClient.post(`${path}/invitations`, { recipientUserId: action.recipientUserId }, BusinessSchemas.BusinessInvitationReceiptSchema);
  if (action.kind === "settings") await apiClient.post(`${path}/settings`, { name: action.name }, z.object({ ok: z.literal(true) }));
  if (action.kind === "member") await apiClient.post(`${path}/members`, { targetUserId: action.targetUserId, action: action.action }, z.object({ ok: z.literal(true) }));
  if (action.kind === "revoke") await apiClient.post(`${path}/invitations/revoke`, { invitationId: action.invitationId }, z.object({ ok: z.literal(true) }));
  return null;
 }, onSuccess: () => { void client.invalidateQueries({ queryKey: key(userId) }); } });
}
