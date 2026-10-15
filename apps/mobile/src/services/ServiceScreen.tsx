import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/useAuth";
import { useAuthIntentStore } from "../auth/intentStore";
import { apiClient, ApiError } from "../api/client";
import { localeTag } from "../i18n/resources";

import { pickServiceImage, uploadServiceImage, type ServiceImage } from "./serviceImage";
import { useServicePush } from "./useServicePush";
import { useServiceRealtime } from "./useServiceRealtime";
import { ServiceAttachment } from "./ServiceAttachment";
import { serviceCopy } from "./copy";
import { useServiceConversation, useServiceList, useServiceOpen, useServiceSend } from "./api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function ServiceScreen() {
 const params = useLocalSearchParams<{ conversationId?: string }>();
 const { i18n } = useTranslation(), c = serviceCopy(i18n.language); const { userId, isAuthenticated } = useAuth();
 const list = useServiceList(), [selected, setSelected] = useState<string | null>(null), conversation = useServiceConversation(selected), send = useServiceSend(selected), open = useServiceOpen();
 const [body, setBody] = useState(""), [error, setError] = useState<"permission" | "conflict" | "disabled" | "error" | null>(null);
 const [image, setImage] = useState<ServiceImage | null>(null), [attachmentId, setAttachmentId] = useState<string | null>(null), [uploading, setUploading] = useState(false), [uploadFailed, setUploadFailed] = useState(false);
 const currentOwner = useRef({ userId, selected }); currentOwner.current = { userId, selected };
 const retry = useRef<{ fingerprint: string; id: string } | null>(null);
 useEffect(() => { setSelected(null); setBody(""); setError(null); setImage(null); setAttachmentId(null); retry.current = null; }, [userId]);
 useEffect(() => { const id = params.conversationId; if (isAuthenticated === true && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) setSelected(id); }, [params.conversationId, userId, isAuthenticated]);
 useFocusEffect(useCallback(() => { if (isAuthenticated === true) { void list.refetch(); if (selected) void conversation.refetch(); } }, [isAuthenticated, selected, list.refetch, conversation.refetch]));
 const failure = (value: unknown) => setError(value instanceof ApiError ? value.status === 403 ? "permission" : value.status === 409 ? "conflict" : value.status === 503 ? "disabled" : "error" : "error");
 const onDenied = useCallback(() => { setError("permission"); setImage(null); setAttachmentId(null); }, []);
 useServiceRealtime(selected, onDenied);
 const detail = isAuthenticated === true && !conversation.isError && error !== "permission" && error !== "conflict" ? conversation.data?.pages[0] ? { ...conversation.data.pages[0], messages: conversation.data.pages.flatMap(page => page.messages) } : undefined : undefined;
 useServicePush(detail?.id);
 const readFence = useRef("");
 const renderedThrough = detail?.messages.at(-1)?.sequence ?? 0;
 useEffect(() => {
  if (!detail || !userId || isAuthenticated !== true || renderedThrough <= detail.readThrough) return;
  const fence = `${userId}:${detail.id}:${renderedThrough}`; if (readFence.current === fence) return; readFence.current = fence;
  void apiClient.post(`/services/conversations/${detail.id}/read`, { throughSequence: renderedThrough }).catch(() => { if (readFence.current === fence) readFence.current = ""; });
 }, [userId, isAuthenticated, detail?.id, detail?.readThrough, renderedThrough]);
 async function submit() {
  if (!detail || (!body.trim() && !attachmentId) || send.isPending) return;
  const fingerprint = JSON.stringify([detail.id, body.trim(), attachmentId]);
  if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: randomUUID() };
  setError(null);
  try { await send.mutateAsync({ clientMessageId: retry.current.id, ...(body.trim() ? { body: body.trim() } : {}), ...(attachmentId ? { attachmentId } : {}), visibility: "customer" }); setBody(""); setImage(null); setAttachmentId(null); retry.current = null; }
  catch (value) { failure(value); }
 }
 async function upload(retryImage?: ServiceImage) {
  if (!detail || uploading) return;
  const owner = currentOwner.current; setUploading(true); setUploadFailed(false);
  let picked = retryImage;
  try { picked = retryImage ?? await pickServiceImage() ?? undefined; if (!picked || currentOwner.current.userId !== owner.userId || currentOwner.current.selected !== owner.selected) return; setImage(picked); const adopted = await uploadServiceImage(detail.id, detail.purpose, picked); if (currentOwner.current.userId === owner.userId && currentOwner.current.selected === owner.selected) setAttachmentId(adopted); }
  catch { if (currentOwner.current.userId === owner.userId && currentOwner.current.selected === owner.selected) setUploadFailed(true); } finally { setUploading(false); }
 }
 async function create() { setError(null); try { const value = await open.mutateAsync("history"); setSelected(value.id); } catch (value) { failure(value); } }
 const button = (title: string, action: () => void, disabled = false) => <Button accessibilityLabel={title} disabled={disabled} onPress={action}><Text>{title}</Text></Button>;
 return <><Stack.Screen options={{ title: c.customerTitle }}/><ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled"><Text className="font-heading text-title-2 font-semibold">{c.customerTitle}</Text>
  {!selected ? <><Text className="font-heading text-title-3 font-semibold">{c.history}</Text><Text>{c.historyIntro}</Text><Text>{c.price}</Text></> : null}
  {isAuthenticated !== true ? <>{button(c.signedOut, () => useAuthIntentStore.getState().requireSignIn(router, { returnTo: "/services" }))}</> : <>
   {error ? <Text accessibilityRole="alert">{c[error]}</Text> : null}
   {!selected ? <>{button(c.newRequest, () => { void create(); }, open.isPending)}
    {list.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : list.isError ? <><Text accessibilityRole="alert">{c.error}</Text>{button(c.refresh, () => { void list.refetch(); })}</> : list.data?.length === 0 ? <Text>{c.empty}</Text> : list.data?.map(item => <View key={item.id} className="gap-2 rounded-xl border border-border p-4">{button(c[item.purpose], () => { setError(null); setBody(""); setImage(null); setAttachmentId(null); setUploadFailed(false); setSelected(item.id); })}<Text className="text-muted-foreground">{new Date(item.createdAt).toLocaleString(localeTag(i18n.language))}</Text></View>)}</> : <>
    {button(c.back, () => { setSelected(null); setBody(""); setError(null); setImage(null); setAttachmentId(null); })}
    {conversation.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : conversation.isError ? <><Text accessibilityRole="alert">{conversation.error instanceof ApiError && conversation.error.status === 403 ? c.permission : c.error}</Text>{button(c.refresh, () => { setError(null); void conversation.refetch(); })}</> : detail ? <>
     <Text className="font-heading text-title-3 font-semibold">{c[detail.purpose]}</Text>{detail.purpose === "support" ? <Text className="text-muted-foreground">{c.schedule}</Text> : null}<Text>{detail.operatorName ?? c.carberk}</Text>
     {detail.messages.length === 0 ? <Text>{c.emptyMessages}</Text> : detail.messages.filter(message => message.visibility === "customer").map(message => <View key={message.id} className="gap-2 rounded-xl border border-border p-4"><Text className="font-semibold">{message.operatorName ?? c[message.sender]}</Text><Text>{message.body}</Text>{message.attachment ? <ServiceAttachment key={`${userId}:${detail.id}:${message.attachment.id}`} conversationId={detail.id} attachment={message.attachment} locale={i18n.language}/> : null}<Text className="text-muted-foreground text-caption">{new Date(message.createdAt).toLocaleString(localeTag(i18n.language))}</Text></View>)}
     {uploadFailed ? <Text accessibilityRole="alert">{c.uploadFailed}</Text> : null}
     {attachmentId ? <Text>{c.attachmentReady}</Text> : null}
     {button(uploadFailed ? c.uploadRetry : c.upload, () => { void upload(image ?? undefined); }, uploading || !!attachmentId)}
     {image ? button(c.remove, () => { setImage(null); setAttachmentId(null); setUploadFailed(false); }) : null}
     {conversation.hasNextPage ? button(c.more, () => { void conversation.fetchNextPage(); }, conversation.isFetchingNextPage) : null}
     <Text>{c.body}</Text><Input accessibilityLabel={c.body} value={body} onChangeText={setBody} maxLength={4000} multiline/>{button(send.isPending ? c.sending : error ? c.retrySend : c.send, () => { void submit(); }, send.isPending || uploading || (image !== null && !attachmentId) || (!body.trim() && !attachmentId))}
    </> : button(c.refresh, () => { setError(null); void conversation.refetch(); })}
   </>}
  </>}
 </ScrollView></>;
}
