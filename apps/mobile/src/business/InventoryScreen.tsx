import { useCallback, useState } from "react";
import { ScrollView, View, Alert } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useBrands } from "../api/catalog/useBrands";
import { useMyContactPhones } from "../api/listings/useMyContactPhones";

import { useInventoryRequestOptions } from "./useInventoryRequestOptions";
import { useBusinessWorkspace } from "./api";
import { inventoryCopy } from "./inventoryCopy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** The approved stock list keeps status, review reminders and drafts separate. */
export function InventoryScreen() {
 const { i18n } = useTranslation(); const c = inventoryCopy(i18n.language);
 const { userId, isAuthenticated } = useAuth(); const workspace = useBusinessWorkspace(); const business = workspace.data?.workspace;
 const businessId = business?.business.id; const cache = useQueryClient(); const [message, setMessage] = useState("");
 const requestOptions = useInventoryRequestOptions(businessId);
 const key = ["business", userId, businessId, "inventory"];
 const stock = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/businesses/${businessId}/inventory`, ListingsSchemas.BusinessInventoryResponseSchema), enabled: isAuthenticated === true && !!businessId, staleTime: 0, gcTime: 0 });
 const phones = useMyContactPhones({ userId, businessId, enabled: !!businessId }); const brands = useBrands();
 const mutation = useMutation({ mutationFn: async ({ id, action }: { id: string; action: "confirm" | "sold" | "archive" | "republish" | "discard" }) => {
  const opts = requestOptions;
  if (action === "discard") return apiClient.delete(`/listings/drafts/${id}`, undefined, opts);
  return apiClient.post(action === "confirm" ? `/businesses/${businessId}/inventory/${id}/confirm-availability` : `/listings/${id}/${action}`, {}, undefined, opts);
 }, onSuccess: () => { setMessage(c.saved); void cache.invalidateQueries({ queryKey: key }); }, onError: (error) => { setMessage(error instanceof ApiError && error.status === 403 ? c.denied : c.failed); void stock.refetch(); } });
 useFocusEffect(useCallback(() => {
  if (isAuthenticated !== true) return;
  void cache.invalidateQueries({ queryKey: ["business", userId, "current"] });
  void cache.invalidateQueries({ queryKey: ["business", userId, businessId, "inventory"] });
  void phones.refetch();
 }, [isAuthenticated, cache, userId, businessId, phones.refetch]));
 const workspaceDenied = workspace.error instanceof ApiError && (workspace.error.status === 403 || workspace.error.status === 401);
 const active = business?.business.status === "active";
 const act = (id: string, action: Parameters<typeof mutation.mutate>[0]["action"]) => mutation.mutate({ id, action });
 const button = (label: string, onPress: () => void, disabled = false) => <Button disabled={disabled || mutation.isPending} onPress={onPress}><Text>{label}</Text></Button>;
 const openDraft = (resumeDraftId?: string) => { if (!businessId) return; router.push({ pathname: "/(tabs)/sell", params: { businessId, ...(resumeDraftId ? { resumeDraftId } : {}) } }); };
 return <><Stack.Screen options={{ title: c.title, headerBackTitle: c.back }} /><ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
  {isAuthenticated !== true || workspaceDenied || (!workspace.isPending && !workspace.isError && !business) ? <Text accessibilityRole="alert">{c.denied}</Text> : workspace.isError ? <><Text accessibilityRole="alert">{c.error}</Text>{button(c.retry, () => { void workspace.refetch(); })}</> : workspace.isPending || stock.isPending ? <Text accessibilityRole="progressbar">{c.working}</Text> : stock.isError ? <><Text accessibilityRole="alert">{stock.error instanceof ApiError && stock.error.status === 403 ? c.denied : c.error}</Text>{button(c.retry, () => { void stock.refetch(); })}</> : stock.data ? <>
   <Text className="font-heading text-title-2 font-semibold">{business?.business.name}</Text>
   {!active ? <Text accessibilityRole="alert">{c.inactive}</Text> : null}
   {message ? <Text accessibilityRole="alert">{message}</Text> : null}
   <View className="gap-2">{(["active", "sold", "archived", "banned", "drafts", "reviewDue"] as const).map((status) => <Text key={status}>{c[status]}: {stock.data.counts[status]}</Text>)}</View>
   <Text className="text-muted-foreground">{c.availabilityHelp}</Text>
   {button(c.add, () => openDraft(), !active)}
   {!stock.data.listings.length ? <Text>{c.empty}</Text> : stock.data.listings.map((listing) => <View key={listing.id} className="gap-3 rounded-xl border border-border p-4"><Text>{brands.data?.items.find((b) => b.id === listing.brandId)?.name ?? ""} {listing.year}</Text><Text>{c[listing.status as "active" | "sold" | "archived" | "banned"] ?? listing.status}</Text>{listing.reviewDue ? <Text>{c.reviewDue}</Text> : null}
    {listing.status === "active" ? <>{button(c.confirm, () => act(listing.id, "confirm"), !active)}{button(c.markSold, () => act(listing.id, "sold"), !active)}{button(c.archive, () => act(listing.id, "archive"), !active)}</> : listing.status === "sold" || listing.status === "archived" ? button(c.republish, () => act(listing.id, "republish"), !active) : null}
    {button(c.edit, () => router.push({ pathname: "/listings/[id]/edit", params: { id: listing.id, businessId: businessId ?? "" } }), !active || listing.status === "banned")}
   </View>)}
   <Text className="font-heading text-title-3 font-semibold">{c.drafts}</Text>{stock.data.drafts.map((draft) => <View key={draft.id} className="gap-3 border-b border-border py-3"><Text>{new Date(draft.updatedAt).toLocaleDateString(i18n.language === "tk" ? "tk-TM" : i18n.language === "ru" ? "ru-RU" : "en-US")}</Text>{button(c.resume, () => openDraft(draft.id), !active)}{button(c.remove, () => Alert.alert(c.remove, "", [{ text: c.back }, { text: c.remove, style: "destructive", onPress: () => act(draft.id, "discard") }]), !active)}</View>)}
   <Text className="font-heading text-title-3 font-semibold">{c.phone}</Text><Text>{phones.data?.items[0]?.phone ?? c.noPhone}</Text><Text className="text-muted-foreground">{c.salesPhone}</Text>
   {business?.membership.role === "owner" ? button(c.changePhone, () => router.push({ pathname: "/listings/contact-phone", params: { businessId: businessId ?? "", returnPathname: "/business" } }), !active) : null}
   {button(c.retry, () => { void workspace.refetch(); void stock.refetch(); })}
  </> : null}
 </ScrollView></>;
}
