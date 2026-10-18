import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { z } from "zod";

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
const copy = {
 en: { phases: { EMPTY: "", PREPARING: "Preparing video", UPLOADING: "Uploading video", PAUSED: "Video paused", PROCESSING: "Processing video", READY: "Video ready", FAILED: "Video needs attention", CANCELLED: "Video removed" }, pause: "Pause video upload", resume: "Continue video upload", cancel: "Cancel video", retry: "Retry video upload", add: "Add video", optional: "Optional video, up to 90 seconds", failure: "This video could not be opened. Choose another video.", selected: "Selected video", remove: "Remove video" },
 ru: { phases: { EMPTY: "", PREPARING: "Подготовка видео", UPLOADING: "Загрузка видео", PAUSED: "Видео приостановлено", PROCESSING: "Обработка видео", READY: "Видео готово", FAILED: "Проверьте видео", CANCELLED: "Видео удалено" }, pause: "Приостановить загрузку видео", resume: "Продолжить загрузку видео", cancel: "Отменить видео", retry: "Повторить загрузку видео", add: "Добавить видео", optional: "Необязательное видео до 90 секунд", failure: "Не удалось открыть видео. Выберите другое.", selected: "Выбранное видео", remove: "Удалить видео" },
 tk: { phases: { EMPTY: "", PREPARING: "Wideo taýýarlanýar", UPLOADING: "Wideo ýüklenýär", PAUSED: "Wideo saklandy", PROCESSING: "Wideo işlenýär", READY: "Wideo taýýar", FAILED: "Wideony barlaň", CANCELLED: "Wideo aýryldy" }, pause: "Wideo ýüklemesini sakla", resume: "Wideo ýüklemesini dowam et", cancel: "Wideony ýatyr", retry: "Wideony täzeden ýükle", add: "Wideo goş", optional: "Islege görä 90 sekunda çenli wideo", failure: "Wideo açylmady. Başga wideo saýlaň.", selected: "Saýlanan wideo", remove: "Wideony aýyr" },
};

/** Photos remain independent. Every mount asks the server for current admission. */
export function ListingVideoEditor({ ownerId, target, businessId, disabled }: ListingVideoEditorProps) {
  const { i18n } = useTranslation();
  const c = copy[i18n.language === "ru" ? "ru" : i18n.language === "tk" ? "tk" : "en"];
  const capability = useQuery({ queryKey: ["listing-video-capabilities", ownerId, businessId ?? null], queryFn: () => apiClient.get("/listing-video/capabilities", capabilities), staleTime: 0 });
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
  if (!capability.data?.canView && taskState.phase === "EMPTY") return null;
  return <View className="gap-3 py-4" testID={`video-editor-${target.kind}-${target.id}`}>
    <Text className="text-callout text-muted-foreground">{c.optional}</Text>
    {selected ? <View className="gap-2"><Text>{c.selected}</Text><Suspense fallback={null}><VideoSelectionPreview key={selected.uri} asset={selected} initial={retained?.interval} onChange={updateInterval} disabled={disabled || busy || !capability.data?.canUpload} onUse={(selection, poster) => { void task.start(selection, poster); }} /></Suspense><Button variant="outline" disabled={disabled} onPress={() => { setSelected(null); setRetained(null); void journal.save(null).catch(() => setError(true)); if (taskState.phase !== "EMPTY" && taskState.phase !== "READY") void task.cancel(); }}><Text>{c.remove}</Text></Button></View> : null}
    {taskState.phase !== "EMPTY" && taskState.phase !== "CANCELLED" ? <View className="gap-2">
      <Text accessibilityLiveRegion="polite">{c.phases[taskState.phase]}</Text>
      {taskState.record ? <Text>{(taskState.record.prepared.sizeBytes / 1024 / 1024).toFixed(1)} MB · {Math.floor(taskState.record.confirmedBytes / taskState.record.prepared.sizeBytes * 100)}%</Text> : null}
      {taskState.phase === "UPLOADING" ? <Button variant="outline" onPress={() => { void task.pause(); }}><Text>{c.pause}</Text></Button> : null}
      {capability.data?.canUpload && (taskState.phase === "PAUSED" || taskState.phase === "FAILED" && taskState.record) ? <Button variant="outline" onPress={() => { void task.resume(); }}><Text>{taskState.phase === "FAILED" ? c.retry : c.resume}</Text></Button> : null}
      {taskState.phase !== "READY" ? <Button variant="outline" onPress={() => { void task.cancel(); }}><Text>{c.cancel}</Text></Button> : null}
    </View> : null}
    {capability.data?.canUpload ? <Button variant="outline" disabled={disabled || picking || busy || !selectionReady} onPress={() => { void pick(); }}><Text>{c.add}</Text></Button> : null}
    {error ? <Text accessibilityRole="alert">{c.failure}</Text> : null}
  </View>;
}
