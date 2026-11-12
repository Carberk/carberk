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
import { useListingVideoCover } from "./useListingVideoCover";
import { VideoCardActions, VideoCardRow } from "./VideoCardRow";

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
  const cover = useListingVideoCover(target?.id ?? "", target ? active : undefined, { isOwner: true, targetType: target?.type });
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
  const replacing = !!active && (!!pending || hasLocal);
  const pendingMeta = (key: "listingVideoPublishNow" | "listingVideoReplacementWaiting") => t(active ? "listingVideoReplacementWaiting" : key);
  const cancelPending = { label: t(active ? "listingVideoCancelReplacement" : "cancel"), onPress: removePending, disabled: working };
  // The dialog's root is a View; keep it out of the gapped column so it adds no space.
  return <View><View className="gap-4">
    {active && <VideoCardRow
      testID="listing-video-active"
      thumb={{ kind: "cover", uri: cover?.cover?.thumbnail, durationMs: active.durationMs }}
      title={t(target?.type === "draft" ? "listingVideoPrivateReady" : "listingVideoBuyersSee")}
      meta={formatMmss(active.durationMs / 1000)}
    >
      {!pending && !hasLocal && !uncertain && <VideoCardActions
        primary={{ label: t("listingVideoReplace"), onPress: onChoose }}
        secondary={{ label: t("listingVideoRemove"), onPress: () => setConfirm(true) }}
      />}
    </VideoCardRow>}
    {replacing && <View className="h-px bg-border" testID="listing-video-replacement" />}
    {pending?.status === "processing" && <VideoCardRow testID="listing-video-processing" thumb={{ kind: "busy" }} title={t("listingVideoProcessing")} meta={pendingMeta("listingVideoPublishNow")}>
      <VideoCardActions secondary={cancelPending} />
    </VideoCardRow>}
    {pending?.status === "failed" && <VideoCardRow
      testID="listing-video-process-failed"
      alert
      thumb={{ kind: "error" }}
      title={t("listingVideoProcessFailed")}
      meta={pending.canReprocess ? t("listingVideoProcessFailedBody") : t("listingVideoProcessFailedFinal")}
    >
      {/* Open retires the Failed source atomically after a new clip is accepted and prepared. */}
      <VideoCardActions
        primary={pending.canReprocess
          ? { label: t("listingVideoTryAgain"), onPress: () => void change("reprocess"), disabled: working }
          : { label: t("listingVideoChooseAnother"), onPress: onChoose, disabled: working }}
        secondary={active ? cancelPending : { label: t("listingVideoRemove"), onPress: () => setConfirm(true), disabled: working }}
      />
    </VideoCardRow>}
    {pending?.status === "uploading" && !hasLocal && <VideoCardRow thumb={{ kind: "busy" }} title={t("listingVideoUploading")} meta={pendingMeta("listingVideoPublishNow")}>
      <VideoCardActions secondary={cancelPending} />
    </VideoCardRow>}
    {(status.isError || actionFailed) && <VideoCardRow alert thumb={{ kind: "error" }} title={t("listingVideoStatusFailed")}>
      <VideoCardActions primary={{ label: t("listingVideoCheckAgain"), onPress: () => void reconcile() }} />
    </VideoCardRow>}
    {uncertain && <VideoCardRow
      alert
      thumb={{ kind: "error" }}
      title={t(hidden === "all" ? "listingVideoUploadNotConfirmedRemove" : "listingVideoUploadNotConfirmedCancel")}
      meta={t("listingVideoUploadNotConfirmedBody")}
    >
      <VideoCardActions primary={{ label: t("listingVideoCheckAgain"), onPress: () => void reconcile() }} />
    </VideoCardRow>}
    {!uncertain && children?.(!!active || !!pending || !!hidden, !!active, () => setConfirm(true))}
    </View>
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
