import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConversationsSchemas } from "@auto-tm/contracts";
import { z } from "zod";

import { getSharedConversationSocket } from "../conversations/socket/ConversationSocket";
import { BusinessChatImage } from "../conversations/components/BusinessChatImage";
import { apiClient, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

import { useBusinessWorkspace } from "./api";
import { useInventoryRequestOptions } from "./useInventoryRequestOptions";
import { enquiryCopy } from "./enquiryCopy";
import { readEnquiryDraft, writeEnquiryDraft } from "./enquiryDraftStore";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";

const enquirySchema = z.object({ id: z.string(), listingId: z.string(), buyerId: z.string(), createdBy: z.string(), assigneeId: z.string().nullable(), status: z.enum(["open", "closed"]), version: z.number().int(), updatedAt: z.string() });
const pageSchema = z.object({ businessId: z.string(), unanswered: z.number(), nextCursor: z.string().nullable(), items: z.array(enquirySchema) });
type Enquiry = z.infer<typeof enquirySchema>;
type Change = { enquiry: Enquiry; action: "claim" | "reassign" | "close" | "reopen"; assigneeId?: string | null };

/** Business identity is explicit on every read/write and cache key. Personal chats retain their own route. */
export function EnquiriesScreen() {
 const { i18n } = useTranslation(); const c = enquiryCopy(i18n.language);
 const { userId, isAuthenticated } = useAuth(); const workspace = useBusinessWorkspace(); const business = workspace.data?.workspace;
 const businessId = business?.business.id; const options = useInventoryRequestOptions(businessId); const cache = useQueryClient();
 const key = ["business", userId, businessId, "enquiries"];
 const [filter, setFilter] = useState<"all" | "mine" | "unassigned" | "open" | "closed">("all");
 const [selected, setSelected] = useState<string | null>(null); const [notice, setNotice] = useState(""); const [drafts, setDrafts] = useState<Record<string, string>>({});
 const draft = selected ? drafts[selected] ?? readEnquiryDraft(userId, businessId, selected) : "";
 const setDraft = (value: string) => { if (selected) { writeEnquiryDraft(userId, businessId, selected, value); setDrafts(previous => ({ ...previous, [selected]: value })); } };
 useEffect(() => { setDrafts({}); }, [userId]);
 useEffect(() => { setSelected(null); setNotice(""); setFilter("all"); }, [businessId]);
 const inbox = useInfiniteQuery({ queryKey: key, initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => apiClient.get(`/conversations/business/${businessId}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, pageSchema, options), getNextPageParam: page => page.nextCursor ?? undefined, enabled: isAuthenticated === true && !!businessId, staleTime: 0, gcTime: 0 });
 const messages = useInfiniteQuery({ queryKey: [...key, selected, "messages"], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => apiClient.get(`/conversations/${selected}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, ConversationsSchemas.ListMessagesResponseSchema, options), getNextPageParam: page => page.nextCursor ?? undefined, enabled: isAuthenticated === true && !!businessId && !!selected && !inbox.isError, staleTime: 0, gcTime: 0 });
 const refresh = () => { void workspace.refetch(); if (businessId) void inbox.refetch(); if (selected && businessId) void messages.refetch(); };
 const reconcile = useCallback(() => {
  void cache.invalidateQueries({ queryKey: ["business", userId, "current"] });
  void cache.invalidateQueries({ queryKey: ["business", userId, businessId, "enquiries"] });
 }, [cache, userId, businessId]);
 useFocusEffect(useCallback(() => { if (isAuthenticated === true) reconcile(); }, [isAuthenticated, businessId, reconcile]));
 useEffect(() => {
  if (isAuthenticated !== true || !businessId) return;
  const socket = getSharedConversationSocket();
  const unsubscribeMessage = socket.subscribeMessage(reconcile);
  const unsubscribeDeleted = socket.subscribeDeletedMessage(reconcile);
  const unsubscribeWatermark = socket.subscribeWatermark(reconcile);
  let previous = socket.getStatus();
  const unsubscribeStatus = socket.subscribeStatus(next => {
   if (next === "connected" && (previous === "disconnected" || previous === "error")) reconcile();
   previous = next;
  });
  // The root owns this shared connection's lifetime, including sign-out.
  void socket.connect();
  return () => { unsubscribeMessage(); unsubscribeDeleted(); unsubscribeWatermark(); unsubscribeStatus(); };
 }, [isAuthenticated, businessId, reconcile]);
 const failure = (error: unknown) => { setNotice(error instanceof ApiError && error.status === 409 ? c.conflict : error instanceof ApiError && error.status === 403 ? c.denied : c.failed); refresh(); };
 const change = useMutation({ mutationFn: ({ enquiry, action, assigneeId }: Change) => apiClient.post(`/conversations/business/${businessId}/${enquiry.id}/${action}`, { expectedVersion: enquiry.version, ...(assigneeId !== undefined ? { assigneeId } : {}) }, undefined, options), onSuccess: () => { setNotice(""); void cache.invalidateQueries({ queryKey: key }); }, onError: failure });
 const send = useMutation({ mutationFn: () => apiClient.post(`/conversations/${selected}/messages`, { text: draft.trim() }, undefined, options), onSuccess: () => { setDraft(""); setNotice(c.sent); void cache.invalidateQueries({ queryKey: key }); }, onError: failure });
 const active = business?.business.status === "active"; const owner = business?.membership.role === "owner";
 const busy = change.isPending || send.isPending;
 const button = (label: string, press: () => void, disabled = false) => <Button disabled={disabled || busy} onPress={press}><Text>{label}</Text></Button>;
 const rows = inbox.data?.pages.flatMap(page => page.items) ?? [];
 const visible = rows.filter(row => filter === "all" || (filter === "mine" ? row.assigneeId === userId : filter === "unassigned" ? !row.assigneeId : row.status === filter));
 const workspaceDenied = workspace.error instanceof ApiError && (workspace.error.status === 403 || workspace.error.status === 401);
 const allowed = isAuthenticated === true && !!business && !workspace.isError && !inbox.isError;
 return <><Stack.Screen options={{ title: c.title, headerBackTitle: c.back }} /><ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
  {isAuthenticated !== true || workspaceDenied || (!workspace.isPending && !workspace.isError && !business) ? <Text accessibilityRole="alert">{c.denied}</Text> : workspace.isError ? <><Text accessibilityRole="alert">{c.error}</Text>{button(c.retry, refresh)}</> : workspace.isPending || inbox.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : inbox.isError ? <><Text accessibilityRole="alert">{inbox.error instanceof ApiError && inbox.error.status === 403 ? c.denied : c.error}</Text>{button(c.retry, refresh)}</> : allowed ? <>
   <Text className="font-heading text-title-2 font-semibold">{business.business.name}</Text>
   {!active ? <Text accessibilityRole="alert">{c.inactive}</Text> : null}
   <Text>{c.unanswered}: {inbox.data?.pages[0]?.unanswered ?? 0}</Text>
   {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
   <View className="gap-2">{(["all", "mine", "unassigned", "open", "closed"] as const).map(value => <Button key={value} variant={filter === value ? "default" : "outline"} onPress={() => setFilter(value)}><Text>{c[value]}</Text></Button>)}</View>
   {!visible.length ? <Text>{c.empty}</Text> : visible.map(enquiry => <View key={enquiry.id} className="gap-3 rounded-xl border border-border p-4">
    <Text selectable>{enquiry.listingId}</Text><Text>{c[enquiry.status]}</Text>
    <Text>{!enquiry.assigneeId ? c.unassigned : enquiry.assigneeId === userId ? c.mine : `${c.assigned}: ${enquiry.assigneeId}`}</Text>
    {!enquiry.assigneeId && enquiry.status === "open" ? button(c.claim, () => change.mutate({ enquiry, action: "claim" }), !active) : null}
    {owner ? <>{button(enquiry.status === "closed" ? c.reopen : c.close, () => change.mutate({ enquiry, action: enquiry.status === "closed" ? "reopen" : "close" }), !active)}
     {enquiry.assigneeId ? button(c.release, () => change.mutate({ enquiry, action: "reassign", assigneeId: null }), !active) : null}
     {business.members.filter(member => member.status === "active" && member.userId !== enquiry.assigneeId).map(member => <Button key={member.userId} disabled={!active || busy} onPress={() => change.mutate({ enquiry, action: "reassign", assigneeId: member.userId })}><Text>{c.reassign}: {member.userId}</Text></Button>)}
    </> : null}
    {button(selected === enquiry.id ? c.hide : c.history, () => { setSelected(selected === enquiry.id ? null : enquiry.id); setNotice(""); })}
    {selected === enquiry.id ? <>
     {messages.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : messages.isError ? <><Text accessibilityRole="alert">{messages.error instanceof ApiError && messages.error.status === 403 ? c.denied : c.error}</Text>{button(c.retry, () => { void messages.refetch(); })}</> : <>
      {!messages.data?.pages.some(page => page.items.length) ? <Text>{c.noMessages}</Text> : messages.data.pages.flatMap(page => page.items).map(message => <View key={message.id} className="gap-1 border-b border-border py-2"><Text>{message.senderId === enquiry.buyerId ? c.buyer : c.staff}: {message.senderId}</Text><Text>{message.deletedAt ? c.deleted : message.text ?? (message.kind === "image" ? c.image : message.kind === "post_ref" ? c.listing : c.system)}</Text>{!message.deletedAt && message.kind === "image" && message.metadata && "key" in message.metadata && message.metadata.key.startsWith("business-chat-private/") ? <BusinessChatImage objectKey={message.metadata.key} businessId={businessId} /> : null}<Text>{new Date(message.createdAt).toLocaleString(i18n.language === "tk" ? "tk-TM" : i18n.language === "ru" ? "ru-RU" : "en-US")}</Text></View>)}
      {messages.hasNextPage ? button(c.more, () => { void messages.fetchNextPage(); }, messages.isFetchingNextPage) : null}
      {active && enquiry.status === "open" && enquiry.assigneeId === userId ? <><Text>{c.reply}</Text><Input accessibilityLabel={c.draft} value={draft} onChangeText={setDraft} maxLength={4000} multiline />{button(c.send, () => send.mutate(), !draft.trim())}</> : null}
     </>}
    </> : null}
   </View>)}
   {inbox.hasNextPage ? button(c.more, () => { void inbox.fetchNextPage(); }, inbox.isFetchingNextPage) : null}
   {button(c.retry, refresh)}
  </> : null}
 </ScrollView></>;
}
