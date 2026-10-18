import { useCallback, useEffect, useRef, useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/useAuth";
import { useAuthIntentStore } from "../auth/intentStore";
import { apiClient, ApiError } from "../api/client";
import { HELP_HREF } from "../navigation/helpHref";
import { localeTag } from "../i18n/resources";

import { pickServiceImage, uploadServiceImage, type ServiceImage } from "./serviceImage";
import { useServicePush } from "./useServicePush";
import { useServiceRealtime } from "./useServiceRealtime";
import { HistorySample } from "./HistorySample";
import { discoveryCopy } from "./discoveryCopy";
import { HistoryOrder } from "./HistoryOrder";
import { ServiceAttachment } from "./ServiceAttachment";
import { serviceCopy } from "./copy";
import { useServiceConversation, useServiceList, useServiceOpen, useServiceSend, useHistoryPrevious } from "./api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function ServiceScreen() {
 const params = useLocalSearchParams<{ conversationId?: string; purpose?: string; sourceListingId?: string; vin?: string }>();
 const { i18n } = useTranslation(), c = serviceCopy(i18n.language); const { userId, isAuthenticated } = useAuth();
 const d = discoveryCopy(i18n.language);
 const sourceListingId = typeof params.sourceListingId === "string" && /^[0-9a-f-]{36}$/i.test(params.sourceListingId) ? params.sourceListingId : undefined;
 const [requestVin, setRequestVin] = useState(typeof params.vin === "string" ? params.vin.replace(/\s/g, "").toUpperCase() : "");
 const previous = useHistoryPrevious(requestVin);
 const list = useServiceList(), [selected, setSelected] = useState<string | null>(null), conversation = useServiceConversation(selected), send = useServiceSend(selected), open = useServiceOpen({ ...(sourceListingId ? { sourceListingId } : {}), ...(/^[A-HJ-NPR-Z0-9]{17}$/.test(requestVin) ? { proposedVin: requestVin } : {}) });
 const [body, setBody] = useState(""), [error, setError] = useState<"permission" | "conflict" | "disabled" | "error" | null>(null);
 const [image, setImage] = useState<ServiceImage | null>(null), [attachmentId, setAttachmentId] = useState<string | null>(null), [uploading, setUploading] = useState(false), [uploadFailed, setUploadFailed] = useState(false);
 const currentOwner = useRef({ userId, selected }); currentOwner.current = { userId, selected };
 const openedSupport = useRef<string | null>(null);
 const retry = useRef<{ fingerprint: string; id: string } | null>(null);
 const drafts = useRef(new Map<string, { body: string; image: ServiceImage | null; attachmentId: string | null; uploadFailed: boolean }>());
 const saveDraft = (id: string | null) => { if (!id) return; drafts.current.set(id, { body, image, attachmentId, uploadFailed }); };
 const switchConversation = (id: string) => { saveDraft(selected); const draft = drafts.current.get(id); setSelected(id); setBody(draft?.body ?? ""); setImage(draft?.image ?? null); setAttachmentId(draft?.attachmentId ?? null); setUploadFailed(draft?.uploadFailed ?? false); setError(null); };
 const backToQueue = () => { saveDraft(selected); setSelected(null); setError(null); };
 useEffect(() => { drafts.current.clear(); setSelected(null); setRequestVin(typeof params.vin === "string" ? params.vin.replace(/\s/g, "").toUpperCase() : ""); setBody(""); setError(null); setImage(null); setAttachmentId(null); retry.current = null; }, [userId]);
 useEffect(() => { const id = params.conversationId; if (isAuthenticated === true && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) switchConversation(id); }, [params.conversationId, userId, isAuthenticated]);
 useEffect(() => {
  if (params.purpose !== "support" || !userId || isAuthenticated !== true || openedSupport.current === userId) return;
  openedSupport.current = userId; let disposed = false;
  void open.mutateAsync("support").then(value => { if (!disposed) switchConversation(value.id); }).catch(value => { if (!disposed) { openedSupport.current = null; setError(value instanceof ApiError && value.status === 503 ? "disabled" : "error"); } });
  return () => { disposed = true; };
 }, [params.purpose, userId, isAuthenticated]);
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
 async function create(purpose: "support" | "history" = "history") { setError(null); try { const value = await open.mutateAsync(purpose); setSelected(value.id); } catch (value) { failure(value); } }
 const button = (title: string, action: () => void, disabled = false) => <Button accessibilityLabel={title} disabled={disabled} onPress={action}><Text>{title}</Text></Button>;
 return <><Stack.Screen options={{ title: c.customerTitle }}/><ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled"><Text className="font-heading text-title-2 font-semibold">{c.customerTitle}</Text>
  {!selected && params.purpose !== "support" ? <><Text className="font-heading text-title-3 font-semibold">{c.history}</Text><Text>{c.historyIntro}</Text><Text>{c.price}</Text><HistorySample locale={i18n.language}/>{sourceListingId ? <Text>{d.sourceListing}: {sourceListingId}</Text> : null}</> : null}
  {isAuthenticated !== true ? <>{button(c.signedOut, () => useAuthIntentStore.getState().requireSignIn(router, { returnTo: { pathname: "/services", params: { purpose: params.purpose, ...(sourceListingId ? { sourceListingId } : {}), ...(requestVin ? { vin: requestVin } : {}) } } }))}</> : <>
   {error ? <Text accessibilityRole="alert">{c[error]}</Text> : null}
   {!selected ? <>{params.purpose !== "support" ? <><Input accessibilityLabel={d.requestVin} value={requestVin} onChangeText={value => setRequestVin(value.replace(/\s/g, "").toUpperCase())} maxLength={17} autoCapitalize="characters"/>{requestVin.length === 17 && previous.isFetching ? <Text accessibilityRole="progressbar">{c.loading}</Text> : null}{previous.isError ? <><Text accessibilityRole="alert">{c.error}</Text>{button(c.refresh, () => { void previous.refetch(); })}</> : previous.data?.length ? <><Text>{d.repeatWarning}</Text>{previous.data.map(item => <View key={item.conversationId}>{button(d.previousReports, () => switchConversation(item.conversationId))}</View>)}</> : null}</> : null}{button(params.purpose === "support" ? c.refresh : c.newRequest, () => { void create(params.purpose === "support" ? "support" : "history"); }, open.isPending || (params.purpose !== "support" && requestVin.length > 0 && (!/^[A-HJ-NPR-Z0-9]{17}$/.test(requestVin) || previous.isPending || previous.isError)))}
    {list.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : list.isError ? <><Text accessibilityRole="alert">{c.error}</Text>{button(c.refresh, () => { void list.refetch(); })}</> : list.data?.length === 0 ? <Text>{c.empty}</Text> : list.data?.map(item => <View key={item.id} className="gap-2 rounded-xl border border-border p-4">{button(c[item.purpose], () => { setError(null); setBody(""); setImage(null); setAttachmentId(null); setUploadFailed(false); switchConversation(item.id); })}<Text className="text-muted-foreground">{new Date(item.createdAt).toLocaleString(localeTag(i18n.language))}</Text></View>)}</> : <>
    {button(c.back, backToQueue)}
    {conversation.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : conversation.isError ? <><Text accessibilityRole="alert">{conversation.error instanceof ApiError && conversation.error.status === 403 ? c.permission : c.error}</Text>{button(c.refresh, () => { setError(null); void conversation.refetch(); })}</> : detail ? <>
     <Text className="font-heading text-title-3 font-semibold">{c[detail.purpose]}</Text>{detail.purpose === "support" ? button(c.contacts, () => router.push(HELP_HREF)) : null}{detail.purpose === "support" ? <Text className="text-muted-foreground">{c.schedule}</Text> : null}<Text>{detail.operatorName ?? c.carberk}</Text>
     {detail.purpose === "history" ? <HistoryOrder key={`${userId}:${detail.id}`} id={detail.id} locale={i18n.language}/> : null}
     {detail.messages.length === 0 ? <Text>{c.emptyMessages}</Text> : detail.messages.filter(message => message.visibility === "customer").map(message => <View key={message.id} className="gap-2 rounded-xl border border-border p-4"><Text className="font-semibold">{message.operatorName ?? c[message.sender]}</Text><Text>{message.body}</Text>{message.attachment ? <ServiceAttachment key={`${userId}:${detail.id}:${message.attachment.id}`} conversationId={detail.id} attachment={message.attachment} locale={i18n.language}/> : null}<Text className="text-muted-foreground text-caption">{message.sender === "customer" ? message.sequence <= (detail.peerReadThrough ?? 0) ? c.seen : c.saved : ""}</Text><Text className="text-muted-foreground text-caption">{new Date(message.createdAt).toLocaleString(localeTag(i18n.language))}</Text></View>)}
     {uploadFailed ? <Text accessibilityRole="alert">{c.uploadFailed}</Text> : null}
     {uploading ? <View accessibilityRole="progressbar"><Text>{c.uploading}</Text></View> : null}
     {image?.preview ? <Image accessibilityLabel={c.preview} source={{ uri: image.preview }} className="h-48 w-full" resizeMode="contain"/> : null}
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
