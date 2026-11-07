import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { VideoUploadsSchemas } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";

import { formatMmss } from "./listingVideo";
import type { ListingVideoTask } from "./ListingVideoTasks";
import { useTargetVideo } from "./useTargetVideo";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

type Target = VideoUploadsSchemas.VideoUploadTarget;
const Removed = z.object({ state: z.literal("REMOVED") });
export function OwnerVideoStatus({ target, task, onChoose, onClearSelection, children }: {
  target?: Target; task: ListingVideoTask; onChoose(): void; onClearSelection?(): void;
  children?(serverBusy: boolean, replacing: boolean, requestRemove: () => void): ReactNode;
}) {
  const { t } = useTranslation();
  const status = useTargetVideo(target);
  const [confirm, setConfirm] = useState(false);
  const [hidden, setHidden] = useState<"all" | "pending" | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const operation = useRef(0);
  const { refetch } = status;
  const clear = task.upload.clear;
  const localGeneration = task.upload.state.generationId;
  const phase = task.upload.state.phase;
  const hasTarget = !!target;
  useEffect(() => {
    let current = true;
    if (hasTarget) void refetch().then((result) => {
      if (!current || result.error || !result.data || !localGeneration || phase === "operation-unknown") return;
      // A read begun after Open/phase change is authoritative. Worker promotion,
      // removal, or a newer replacement retires this controller's local state.
      if (result.data.pendingVideo?.generationId !== localGeneration || result.data.pendingVideo.status !== "uploading") void clear();
    });
    return () => { current = false; };
  }, [phase, hasTarget, localGeneration, refetch, clear]);
  const active = hidden === "all" ? undefined : status.data?.video;
  const pending = hidden ? undefined : status.data?.pendingVideo;

  const reconcile = async () => {
    const attempt = ++operation.current;
    const result = await status.refetch();
    if (attempt !== operation.current || result.error) return;
    setHidden(null); setUncertain(false); setActionFailed(false);
  };
  const change = async (action: "remove" | "cancel" | "reprocess") => {
    if (busy.current) return;
    if (!target) { onClearSelection?.(); task.prep.remove(); await task.upload.clear(); return; }
    busy.current = true; setWorking(true);
    const attempt = ++operation.current;
    if (action !== "reprocess") setHidden(action === "remove" ? "all" : "pending");
    try {
      await status.queryClient.cancelQueries({ queryKey: status.queryKey });
      if (action !== "reprocess") {
        onClearSelection?.(); task.prep.remove(); await task.upload.clear();
      }
      if (action === "remove") await apiClient.post("/listings/video-uploads/remove", target, Removed);
      else if (pending && action === "cancel") await apiClient.post(`/listings/video-uploads/${pending.sessionId}/cancel`, {}, VideoUploadsSchemas.CancelVideoUploadResponseSchema);
      else if (pending) await apiClient.post(`/listings/video-uploads/${pending.sessionId}/reprocess`, {}, VideoUploadsSchemas.VideoUploadStatusResponseSchema);
      if (attempt !== operation.current) return;
      // Keep the optimistic tombstone until a read begun after the mutation settles.
      status.queryClient.setQueryData(status.queryKey, action === "remove" ? {} : action === "cancel" ? { video: active } : { video: active, pendingVideo: { ...pending, status: "processing", canReprocess: false } });
      setHidden(null); setUncertain(false); setActionFailed(false);
      void status.queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() });
    } catch { if (attempt === operation.current) { if (action === "reprocess") setActionFailed(true); else setUncertain(true); } }
    finally { busy.current = false; setWorking(false); }
  };
  const hasLocal = task.prep.state.phase !== "idle" || !["idle", "processing"].includes(task.upload.state.phase);
  const removePending = () => void change(active ? "cancel" : "remove");
  return <View className="gap-3">
    {active && <View className="gap-1" testID="listing-video-active">
      <Text className="text-callout font-semibold">{t(target?.type === "draft" ? "listingVideoPrivateReady" : "listingVideoBuyersSee")}</Text>
      <Text className="text-footnote text-muted-foreground">{formatMmss(active.durationMs / 1000)}</Text>
    </View>}
    {active && (pending || hasLocal) && <Text className="text-footnote font-semibold text-muted-foreground">{t("listingVideoReplacement")}</Text>}
    {pending?.status === "processing" && <View className="gap-2" testID="listing-video-processing">
      <Text className="text-callout font-semibold" accessibilityLiveRegion="polite">{t("listingVideoProcessing")}</Text>
      <Text className="text-footnote text-muted-foreground">{t(active ? "listingVideoReplacementWaiting" : "listingVideoPublishNow")}</Text>
      <Button variant="outline" onPress={removePending} disabled={working}><Text>{t(active ? "listingVideoCancelReplacement" : "cancel")}</Text></Button>
    </View>}
    {pending?.status === "failed" && <View className="gap-2">
      <View accessibilityRole="alert" className="gap-1 rounded-2xl bg-destructive/10 p-3">
        <Text className="text-callout font-semibold">{t("listingVideoProcessFailed")}</Text>
        <Text className="text-footnote text-muted-foreground">{t("listingVideoProcessFailedBody")}</Text>
      </View>
      {pending.canReprocess && <Button variant="secondary" onPress={() => void change("reprocess")} disabled={working}><Text>{t("listingVideoTryAgain")}</Text></Button>}
      {/* Open retires the Failed source atomically after a new clip is accepted and prepared. */}
      <Button variant="outline" onPress={onChoose} disabled={working}><Text>{t("listingVideoChooseAnother")}</Text></Button>
      <Button variant="outline" onPress={active ? removePending : () => setConfirm(true)} disabled={working}><Text>{t(active ? "listingVideoCancelReplacement" : "listingVideoRemove")}</Text></Button>
    </View>}
    {pending?.status === "uploading" && !hasLocal && <View className="gap-2">
      <Text className="text-callout font-semibold">{t("listingVideoUploading")}</Text>
      <Button variant="outline" onPress={removePending} disabled={working}><Text>{t(active ? "listingVideoCancelReplacement" : "cancel")}</Text></Button>
    </View>}
    {(status.isError || actionFailed) && <View className="gap-2" accessibilityRole="alert">
      <Text className="text-callout">{t("listingVideoStatusFailed")}</Text>
      <Button variant="outline" onPress={() => void reconcile()}><Text>{t("listingVideoCheckAgain")}</Text></Button>
    </View>}
    {uncertain && <View className="gap-2" accessibilityRole="alert">
      <Text className="text-callout">{t(hidden === "all" ? "listingVideoUploadNotConfirmedRemove" : "listingVideoUploadNotConfirmedCancel")}</Text>
      <Text className="text-footnote text-muted-foreground">{t("listingVideoUploadNotConfirmedBody")}</Text>
      <Button variant="outline" onPress={() => void reconcile()}><Text>{t("listingVideoCheckAgain")}</Text></Button>
    </View>}
    {active && !pending && !hasLocal && !uncertain && <View className="flex-row gap-2">
      <Button variant="secondary" onPress={onChoose}><Text>{t("listingVideoReplace")}</Text></Button>
      <Button variant="outline" onPress={() => setConfirm(true)}><Text>{t("listingVideoRemove")}</Text></Button>
    </View>}
    {!uncertain && children?.(!!active || !!pending || !!hidden, !!active, () => setConfirm(true))}
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent><AlertDialogHeader>
        <AlertDialogTitle>{t("listingVideoRemoveTitle")}</AlertDialogTitle>
        <AlertDialogDescription>{t("listingVideoRemoveBody")}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter>
        <AlertDialogCancel><Text>{t("listingVideoKeep")}</Text></AlertDialogCancel>
        <AlertDialogAction accessibilityRole="button" accessibilityLabel={t("listingVideoRemoveAction")} onPress={() => { setConfirm(false); void change("remove"); }}><Text>{t("listingVideoRemove")}</Text></AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </View>;
}
