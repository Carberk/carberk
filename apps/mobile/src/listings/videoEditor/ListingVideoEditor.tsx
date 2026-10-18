import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { apiClient } from "../../api/client";

import { videoUploadTask } from "./VideoUploadTasks";
import { VideoSelectionPreview } from "./VideoSelectionPreview";


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
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(false);
  async function pick() {
    setPicking(true); setError(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, allowsEditing: false, quality: 1 });
      if (!result.canceled && result.assets[0]) setSelected(result.assets[0]);
    } catch { setError(true); }
    finally { setPicking(false); }
  }
  if (!capability.data?.canUpload) return null;
  return <View className="gap-3 py-4" testID={`video-editor-${target.kind}-${target.id}`}>
    <Text className="text-callout text-muted-foreground">{c.optional}</Text>
    {selected ? <View className="gap-2"><Text>{c.selected}</Text><VideoSelectionPreview key={selected.uri} asset={selected} disabled={disabled || busy} onUse={(selection, poster) => { void task.start(selection, poster); }} /><Button variant="outline" disabled={disabled} onPress={() => setSelected(null)}><Text>{c.remove}</Text></Button></View> : null}
    {taskState.phase !== "EMPTY" && taskState.phase !== "CANCELLED" ? <View className="gap-2">
      <Text accessibilityLiveRegion="polite">{c.phases[taskState.phase]}</Text>
      {taskState.record ? <Text>{(taskState.record.prepared.sizeBytes / 1024 / 1024).toFixed(1)} MB · {Math.floor(taskState.record.confirmedBytes / taskState.record.prepared.sizeBytes * 100)}%</Text> : null}
      {taskState.phase === "UPLOADING" ? <Button variant="outline" onPress={() => { void task.pause(); }}><Text>{c.pause}</Text></Button> : null}
      {taskState.phase === "PAUSED" || taskState.phase === "FAILED" && taskState.record ? <Button variant="outline" onPress={() => { void task.resume(); }}><Text>{taskState.phase === "FAILED" ? c.retry : c.resume}</Text></Button> : null}
      {taskState.phase !== "READY" ? <Button variant="outline" onPress={() => { void task.cancel(); }}><Text>{c.cancel}</Text></Button> : null}
    </View> : null}
    <Button variant="outline" disabled={disabled || picking || busy} onPress={() => { void pick(); }}><Text>{c.add}</Text></Button>
    {error ? <Text accessibilityRole="alert">{c.failure}</Text> : null}
  </View>;
}
