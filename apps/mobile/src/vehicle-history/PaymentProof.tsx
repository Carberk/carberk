import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Modal, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { historyPaymentProofs } from "../api/vehicle-history/paymentProofs";
import { ApiError } from "../api/client";

import { historySessionCurrent, type HistoryViewer } from "./session";
import { retainedPaymentProof, type PaymentProofSelection } from "./retainedPaymentProof";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

function receiptAttemptKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : value & 3 | 8).toString(16);
  });
}

export function PaymentProof({ viewer, requestId, orderId, ready, reviewComplete = false, onSubmitted }: {
  viewer: HistoryViewer; requestId: string; orderId: string; ready: boolean; reviewComplete?: boolean; onSubmitted?: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const copy = (key: string, values?: Record<string, unknown>) => t(`vehicleHistory.proof${key}`, values);
  const store = useMemo(() => retainedPaymentProof(viewer.userId, requestId), [viewer.userId, requestId]);
  const [selection, setSelection] = useState<PaymentProofSelection | null>(null);
  const [items, setItems] = useState<P.PaymentProof[]>([]);
  const [localPreview, setLocalPreview] = useState(false);
  const [preview, setPreview] = useState<{ id: string; uri: string } | null>(null);
  const [phase, setPhase] = useState<"loading" | "idle" | "picking" | "uploading" | "submitting" | "reading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const queued = useRef(false);
  const mounted = useRef(true), busy = useRef(false), binding = useRef("");
  const live = useRef(ready); live.current = ready;
  const key = `${viewer.userId}:${viewer.sessionId}:${requestId}:${orderId}`; binding.current = key;
  const operation = useRef<AbortController | null>(null);
  const owns = () => mounted.current && binding.current === key && historySessionCurrent(viewer);
  const current = () => owns() && live.current && AppState.currentState === "active" && focusManager.isFocused() && onlineManager.isOnline();
  const controller = () => { operation.current?.abort(); const next = new AbortController(); operation.current = next; return next; };
  const api = (signal: AbortSignal) => historyPaymentProofs(viewer, requestId, signal, current);
  async function load() {
    if (!current()) return;
    if (busy.current) { queued.current = true; return; }
    busy.current = true; setPhase("loading"); setError(null); setPreview(null);
    const signal = controller().signal;
    try {
      const retained = await store.load();
      const result = await api(signal).list();
      if (!current()) return;
      setSelection(retained?.orderId === orderId ? retained : null);
      setItems(result.items.filter((item) => item.status === "submitted"));
    } catch (failure) { if (owns() && !signal.aborted) setError(failure instanceof ApiError && [401, 403, 404].includes(failure.status) ? "Denied" : "LoadError"); }
    finally { busy.current = false; if (owns()) setPhase("idle"); if (queued.current) { queued.current = false; queueMicrotask(() => reload.current()); } }
  }
  const reload = useRef(load); reload.current = load;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort(); }; }, []);
  useEffect(() => {
    if (!ready) { operation.current?.abort(); setPreview(null); setLocalPreview(false); }
    else void reload.current();
  }, [ready, key]);
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => { if (state !== "active") { operation.current?.abort(); setPreview(null); } });
    const focus = focusManager.subscribe(() => { if (!focusManager.isFocused()) { operation.current?.abort(); setPreview(null); } });
    return () => { app.remove(); focus(); };
  }, []);
  async function pick() {
    if (!current() || busy.current) return;
    busy.current = true; setPhase("picking"); setError(null); setPreview(null);
    let copied: PaymentProofSelection | null = null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
      if (!owns() || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const contentType = asset.mimeType ?? ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[asset.uri.split(".").at(-1)?.toLowerCase() ?? ""]);
      if (!P.PaymentProofContentTypeSchema.safeParse(contentType).success || asset.width * asset.height > 20_000_000) throw new ApiError("HISTORY_PROOF_INVALID", 400);
      const attemptKey = receiptAttemptKey();
      await FileSystem.makeDirectoryAsync(store.directory, { intermediates: true });
      const uri = `${store.directory}${attemptKey}`;
      await FileSystem.copyAsync({ from: asset.uri, to: uri });
      const info = await FileSystem.getInfoAsync(uri);
      const sizeBytes = info.exists && !info.isDirectory ? info.size : 0;
      const input = P.StagePaymentProofSchema.safeParse({ attemptKey, orderId, contentType, sizeBytes });
      if (!input.success) { await FileSystem.deleteAsync(uri, { idempotent: true }); throw new ApiError("HISTORY_PROOF_INVALID", 400); }
      copied = { ...input.data, uri };
      if (!owns()) { await FileSystem.deleteAsync(uri, { idempotent: true }); return; }
      await store.save(copied);
      if (!owns()) return;
      const previous = selection;
      setSelection(copied);
      if (previous) await FileSystem.deleteAsync(previous.uri, { idempotent: true });
    } catch (failure) {
      if (copied && selection?.uri !== copied.uri) await FileSystem.deleteAsync(copied.uri, { idempotent: true }).catch(() => undefined);
      if (owns()) setError(failure instanceof ApiError && failure.code === "HISTORY_PROOF_INVALID" ? "Invalid" : "PickError");
    } finally { busy.current = false; if (owns()) setPhase("idle"); if (queued.current) { queued.current = false; queueMicrotask(() => reload.current()); } }
  }
  async function send() {
    if (!current() || busy.current || !selection) return;
    busy.current = true; setPhase("uploading"); setError(null); setPercent(0); setPreview(null);
    const selected = selection, signal = controller().signal;
    try {
      const transport = api(signal);
      const { uri, ...input } = selected;
      let file = await transport.stage(input);
      if (file.orderId !== orderId || file.contentType !== selected.contentType || file.sizeBytes !== selected.sizeBytes) throw new ApiError("CONTRACT_VIOLATION", 502);
      if (file.status === "pending") file = await transport.upload(file, uri, (value) => { if (current()) setPercent(value); });
      if (file.status !== "submitted") { if (current()) setPhase("submitting"); file = await transport.submit(file); }
      if (!current() || file.status !== "submitted") return;
      setItems((previous) => [...previous.filter((item) => item.id !== file.id), file]);
      await store.remove(selected);
      if (owns()) setSelection(null);
      if (current()) await onSubmitted?.();
    } catch (failure) {
      if (owns() && !signal.aborted && failure instanceof ApiError && failure.code === "HISTORY_PROOF_EXPIRED") {
        const attemptKey = receiptAttemptKey(), uri = `${store.directory}${attemptKey}`;
        try {
          await FileSystem.copyAsync({ from: selected.uri, to: uri });
          const renewed = { ...selected, attemptKey, uri };
          await store.save(renewed);
          if (owns()) { setSelection(renewed); setError("SendError"); }
          await FileSystem.deleteAsync(selected.uri, { idempotent: true });
        } catch { if (owns()) setError("PickError"); }
        return;
      }
      if (owns() && !signal.aborted) setError(failure instanceof ApiError && [401, 403, 404].includes(failure.status) ? "Denied"
        : failure instanceof ApiError && failure.code === "HISTORY_PROOF_INVALID" ? "Invalid" : "SendError");
    } finally { busy.current = false; if (owns()) { setPhase("idle"); setPercent(null); } if (queued.current) { queued.current = false; queueMicrotask(() => reload.current()); } }
  }
  async function open(file: P.PaymentProof) {
    if (!current() || busy.current) return;
    busy.current = true; setPhase("reading"); setError(null); setPreview(null);
    const signal = controller().signal;
    try {
      const result = await api(signal).read(file.id);
      if (current() && result.file.id === file.id && result.file.orderId === orderId) setPreview({ id: file.id, uri: `data:${result.file.contentType};base64,${result.dataBase64}` });
    } catch { if (owns() && !signal.aborted) setError("ReadError"); }
    finally { busy.current = false; if (owns()) setPhase("idle"); }
  }
  async function remove() {
    if (!current() || busy.current) return;
    busy.current = true; setError(null);
    try { await store.remove(selection); if (owns()) setSelection(null); }
    catch { if (owns()) setError("PickError"); }
    finally { busy.current = false; }
  }
  const previewUri = preview?.uri ?? (localPreview ? selection?.uri : undefined);
  const pending = phase !== "idle" && phase !== "loading";
  if (!ready || !historySessionCurrent(viewer)) return null;
  return <View className="gap-3 border-t border-border pt-4">
    <Text accessibilityRole="header" className="text-headline font-semibold">{copy("Title")}</Text>
    <Text className="text-footnote text-muted-foreground">{copy("Privacy")}</Text>
    {phase === "loading" ? <ActivityIndicator accessibilityLabel={t("loading")} /> : <>
      {items.length > 0 && <Text accessibilityLiveRegion="polite" className="font-semibold">{copy("Submitted")}</Text>}
      {!reviewComplete && <Text className="text-footnote">{copy(items.length > 0 ? "Review" : "Limits")}</Text>}
      {items.map((file, index) => <Button key={file.id} variant="secondary" disabled={pending} onPress={() => { void open(file); }}><Text>{copy("View")} {items.length > 1 ? index + 1 : ""}</Text></Button>)}
      {phase === "reading" && <ActivityIndicator accessibilityLabel={copy("Opening")} />}

      {phase === "uploading" && <Text accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent ?? 0 }} accessibilityLiveRegion="polite">{copy("Progress", { percent: percent ?? 0 })}</Text>}
      {selection && <><Pressable accessibilityRole="button" accessibilityLabel={copy("SelectedPreview")} onPress={() => setLocalPreview(true)} className="min-h-24 flex-row items-center gap-3 rounded-lg border border-border p-3">
        <Image accessible={false} source={{ uri: selection.uri }} resizeMode="contain" className="h-20 w-16" />
        <Text className="flex-1 text-callout">{copy("SelectedPreview")}</Text></Pressable>
        <Text className="text-footnote">{Math.ceil(selection.sizeBytes / 1024)} KB · {selection.contentType.replace("image/", "").toUpperCase()}</Text>
        <Button disabled={pending || error === "Denied" || error === "LoadError"} accessibilityState={{ busy: phase === "uploading" || phase === "submitting" }} onPress={() => { void send(); }}><Text>{phase === "uploading" ? copy("Progress", { percent: percent ?? 0 }) : phase === "submitting" ? copy("Submitting") : copy(error === "SendError" ? "Retry" : "Send")}</Text></Button>
        <Button variant="secondary" disabled={pending} onPress={() => { void remove(); }}><Text>{copy("Remove")}</Text></Button></>}
      {!selection && <Button variant={items.length ? "secondary" : "default"} disabled={pending || error === "Denied"} onPress={() => { void pick(); }}><Text>{copy(phase === "picking" ? "Picking" : "Choose")}</Text></Button>}
      {error && <View className="gap-2"><Text accessibilityRole="alert">{copy(error)}</Text>
        {(error === "LoadError" || error === "Denied") && <Button variant="secondary" onPress={() => { void load(); }}><Text>{t("retry")}</Text></Button>}
      </View>}
    </>}
    {previewUri && <Modal visible animationType="slide" onRequestClose={() => { setPreview(null); setLocalPreview(false); }}>
      <View className="flex-1 bg-background px-5 pb-8 pt-16" accessibilityViewIsModal>
        <Text accessibilityRole="header" className="mb-4 text-headline font-semibold">{copy("ReceiptPreview")}</Text>
        <Image accessible accessibilityLabel={copy("ReceiptPreview")} source={{ uri: previewUri }} resizeMode="contain" className="min-h-0 w-full flex-1" />
        <Button variant="secondary" className="mt-4" onPress={() => { setPreview(null); setLocalPreview(false); }}><Text>{copy("Close")}</Text></Button>
      </View>
    </Modal>}
  </View>;
}
