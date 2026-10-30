import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { useAuth } from "../../auth/useAuth";
import { loadAuthSession } from "../../auth/session";
import { apiClient } from "../../api/client";

import { VideoSelectionJournal, type RetainedVideoSelection } from "./VideoSelectionJournal";
import { videoUploadTask } from "./VideoUploadTasks";
const VideoSelectionPreview = lazy(async () => ({ default: (await import("./VideoSelectionPreview")).VideoSelectionPreview }));


import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export interface ListingVideoEditorProps {
  ownerId: string;
  target: { kind: "draft" | "listing"; id: string };
  businessId?: string | undefined;
  disabled?: boolean | undefined;
}
const capabilities = z.object({ canUpload: z.boolean(), canView: z.boolean() }).strict();
const targetStatus = z.object({ active: z.object({ generationId: z.string().uuid(), durationMs: z.number().int().positive().max(90000) }).strict().nullable(), pending: z.object({ sessionId: z.string().uuid(), state: z.string() }).strict().nullable() }).strict();
const copy = {
 en: { current: "Current video", replacement: "Processing replacement", pending: "Pending video", cancelReplacement: "Cancel replacement", removalFailure: "Video could not be removed. Try again when connected.", statusFailure: "Video status unavailable. Reconnect or try again.", refresh: "Refresh video status", phases: { EMPTY: "", PREPARING: "Preparing video", UPLOADING: "Uploading video", PAUSED: "Video paused", PROCESSING: "Processing video", READY: "Video ready", FAILED: "Video needs attention", CANCELLED: "Video removed" }, pause: "Pause video upload", resume: "Continue video upload", cancel: "Cancel video", retry: "Retry video upload", add: "Add video", optional: "Optional video, up to 90 seconds", failure: "This video could not be opened. Choose another video.", selected: "Selected video", remove: "Remove video" },
 ru: { current: "Текущее видео", replacement: "Обработка замены", pending: "Ожидающее видео", cancelReplacement: "Отменить замену", removalFailure: "Не удалось удалить видео. Повторите при подключении.", statusFailure: "Статус видео недоступен. Подключитесь или повторите.", refresh: "Обновить статус видео", phases: { EMPTY: "", PREPARING: "Подготовка видео", UPLOADING: "Загрузка видео", PAUSED: "Видео приостановлено", PROCESSING: "Обработка видео", READY: "Видео готово", FAILED: "Проверьте видео", CANCELLED: "Видео удалено" }, pause: "Приостановить загрузку видео", resume: "Продолжить загрузку видео", cancel: "Отменить видео", retry: "Повторить загрузку видео", add: "Добавить видео", optional: "Необязательное видео до 90 секунд", failure: "Не удалось открыть видео. Выберите другое.", selected: "Выбранное видео", remove: "Удалить видео" },
 tk: { current: "Häzirki wideo", replacement: "Çalyşylýan wideo işlenýär", pending: "Garaşylýan wideo", cancelReplacement: "Çalyşmagy ýatyr", removalFailure: "Wideo aýrylmady. Baglanyşykda täzeden synanyşyň.", statusFailure: "Wideonyň ýagdaýy elýeterli däl. Täzeden synanyşyň.", refresh: "Wideonyň ýagdaýyny täzele", phases: { EMPTY: "", PREPARING: "Wideo taýýarlanýar", UPLOADING: "Wideo ýüklenýär", PAUSED: "Wideo saklandy", PROCESSING: "Wideo işlenýär", READY: "Wideo taýýar", FAILED: "Wideony barlaň", CANCELLED: "Wideo aýryldy" }, pause: "Wideo ýüklemesini sakla", resume: "Wideo ýüklemesini dowam et", cancel: "Wideony ýatyr", retry: "Wideony täzeden ýükle", add: "Wideo goş", optional: "Islege görä 90 sekunda çenli wideo", failure: "Wideo açylmady. Başga wideo saýlaň.", selected: "Saýlanan wideo", remove: "Wideony aýyr" },
};

/** Photos remain independent. Every mount asks the server for current admission. */
export function ListingVideoEditor(props: ListingVideoEditorProps) {
  const ids = [props.ownerId, props.target.id, ...(props.businessId ? [props.businessId] : [])];
  if (ids.some(id => !z.string().uuid().safeParse(id).success)) return null;
  return <AdmittedListingVideoEditor {...props} />;
}
function AdmittedListingVideoEditor({ ownerId, target, businessId, disabled }: ListingVideoEditorProps) {
  const { i18n } = useTranslation();
  const c = copy[i18n.language === "ru" ? "ru" : i18n.language === "tk" ? "tk" : "en"];
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const assertSession = async () => { if ((await loadAuthSession())?.user.id !== ownerId) throw new Error("VIDEO_TRANSFER_SESSION_CHANGED"); };
  const options = { assertSession, ...(businessId ? { headers: { "x-business-id": businessId } } : {}) };
  const targetPath = `/listing-video-targets/${target.kind}/${target.id}`;
  const current = useQuery({ queryKey: ["seller-video", ownerId, target.kind, target.id, businessId ?? null], queryFn: () => apiClient.get(targetPath, targetStatus, options), enabled: userId === ownerId, staleTime: 0, refetchInterval: 3000 });
  const [removing, setRemoving] = useState(false), [removalError, setRemovalError] = useState(false);
  const capability = useQuery({ queryKey: ["listing-video-capabilities", ownerId, businessId ?? null], queryFn: () => apiClient.get("/listing-video/capabilities", capabilities, options), staleTime: 0 });
  const task = useMemo(() => videoUploadTask(ownerId, target, businessId), [ownerId, target.id, target.kind, businessId]);
  const taskState = useSyncExternalStore(task.subscribe, task.snapshot, task.snapshot);
  useEffect(() => { if (capability.data?.canView) void task.recover(); }, [task, capability.data?.canView]);
  useEffect(() => { if (taskState.phase !== "PROCESSING") return; const timer = setInterval(() => { void task.recover(); }, 3000); return () => clearInterval(timer); }, [task, taskState.phase]);
  const busy = ["PREPARING", "UPLOADING", "PROCESSING"].includes(taskState.phase);
  const journal = useMemo(() => new VideoSelectionJournal(ownerId, target, businessId), [ownerId, target.id, target.kind, businessId]);
  const [retained, setRetained] = useState<RetainedVideoSelection | null>(null);
  const [selectionReady, setSelectionReady] = useState(false);
  useEffect(() => { let current = true; setSelectionReady(false); void journal.load().then(value => { if (current) { setRetained(value); setSelected(value ? { ...value.asset, type: "video" } : null); setSelectionReady(true); } }).catch(() => { if (current) setSelectionReady(true); }); return () => { current = false; }; }, [journal]);
  const updateInterval = useCallback((interval: NonNullable<RetainedVideoSelection["interval"]>) => { setRetained(value => { if (!value) return value; const next = { ...value, interval }; void journal.save(next).catch(() => setError(true)); return next; }); }, [journal]);
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(false);
  async function pick() {
    setPicking(true); setError(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, allowsEditing: false, quality: 1 });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0], next: RetainedVideoSelection = { version: 1, asset: { uri: asset.uri, duration: asset.duration ?? null, width: asset.width, height: asset.height }, interval: null };
        await journal.save(next); setRetained(next); setSelected(asset);
      }
    } catch { setError(true); }
    finally { setPicking(false); }
  }
  async function remove(pendingOnly: boolean) {
    if (removing) return;
    setRemoving(true); setRemovalError(false);
    try {
      await apiClient.delete(pendingOnly || target.kind === "draft" ? `${targetPath}/pending` : `/listings/${target.id}/video`, undefined, options);
      if (!pendingOnly || taskState.record?.sessionId === current.data?.pending?.sessionId) await task.removed();
      setSelected(null); setRetained(null); await journal.save(null);
      await current.refetch();
      await queryClient.invalidateQueries({ queryKey: ["listing-video"] });
      await queryClient.invalidateQueries({ queryKey: ["listing-video-poster"] });
    } catch { setRemovalError(true); }
    finally { setRemoving(false); }
  }
  if (userId !== ownerId || !capability.data?.canView) return null;
  const active = current.data?.active, pending = current.data?.pending;
  const localPending = !["EMPTY", "CANCELLED", "READY"].includes(taskState.phase);

  return <View className="gap-3 py-4" testID={`video-editor-${target.kind}-${target.id}`}>
    <Text className="text-callout text-muted-foreground">{c.optional}</Text>
    {active ? <Text>{c.current} · {Math.ceil(active.durationMs / 1000)} s</Text> : null}
    {pending && !localPending ? <View className="gap-2"><Text>{active && pending.state === "PROCESSING" ? c.replacement : `${c.pending}: ${pending.state === "PROCESSING" ? c.phases.PROCESSING : c.phases.UPLOADING}`}</Text><Button variant="outline" disabled={disabled || removing} onPress={() => { void remove(true); }}><Text>{active ? c.cancelReplacement : c.cancel}</Text></Button></View> : null}
    {active || pending ? <Button variant="outline" disabled={disabled || removing} onPress={() => { void remove(false); }}><Text>{c.remove}</Text></Button> : null}
    {current.isError ? <View><Text accessibilityRole="alert">{c.statusFailure}</Text><Button variant="outline" onPress={() => { void current.refetch(); }}><Text>{c.refresh}</Text></Button></View> : null}
    {removalError ? <Text accessibilityRole="alert">{c.removalFailure}</Text> : null}
    {selected && !pending ? <View className="gap-2"><Text>{c.selected}</Text><Suspense fallback={null}><VideoSelectionPreview key={selected.uri} asset={selected} initial={retained?.interval} onChange={updateInterval} disabled={disabled || busy || !capability.data?.canUpload} onUse={(selection, poster) => { void task.start(selection, poster); }} /></Suspense><Button variant="outline" disabled={disabled} onPress={() => { setSelected(null); setRetained(null); void journal.save(null).catch(() => setError(true)); if (taskState.phase !== "EMPTY" && taskState.phase !== "READY") void task.cancel(); }}><Text>{c.remove}</Text></Button></View> : null}
    {localPending ? <View className="gap-2">
      <Text accessibilityLiveRegion="polite">{c.phases[taskState.phase]}</Text>
      {taskState.record && ["UPLOADING", "PAUSED"].includes(taskState.phase) ? <Text>{(taskState.record.prepared.sizeBytes / 1024 / 1024).toFixed(1)} MB · {Math.floor(taskState.record.confirmedBytes / taskState.record.prepared.sizeBytes * 100)}%</Text> : null}
      {taskState.phase === "UPLOADING" ? <Button variant="outline" onPress={() => { void task.pause(); }}><Text>{c.pause}</Text></Button> : null}
      {capability.data?.canUpload && (taskState.phase === "PAUSED" || taskState.phase === "FAILED" && taskState.record) ? <Button variant="outline" onPress={() => { void task.resume(); }}><Text>{taskState.phase === "FAILED" ? c.retry : c.resume}</Text></Button> : null}
      {taskState.phase !== "READY" ? <Button variant="outline" onPress={() => { void task.cancel(); }}><Text>{c.cancel}</Text></Button> : null}
    </View> : null}
    {capability.data?.canUpload ? <Button variant="outline" disabled={disabled || picking || busy || !!pending || removing || !selectionReady} onPress={() => { void pick(); }}><Text>{c.add}</Text></Button> : null}
    {error ? <Text accessibilityRole="alert">{c.failure}</Text> : null}
  </View>;
}
