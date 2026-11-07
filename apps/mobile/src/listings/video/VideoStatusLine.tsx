import { useEffect } from "react";
import type { ListingsSchemas, VideoUploadsSchemas } from "@auto-tm/contracts";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { useSharedListingVideoTask } from "./ListingVideoTasks";
import { useTargetVideo } from "./useTargetVideo";

import { Text } from "@/components/ui/text";

export function VideoStatusLine({ video, pendingVideo, localStatus }: {
  video?: ListingsSchemas.ReadyListingVideo;
  pendingVideo?: ListingsSchemas.PendingListingVideo;
  localStatus?: string;
}) {
  const { t } = useTranslation();
  const pending = localStatus ?? (pendingVideo ? pendingVideo.status === "failed" ? "attention" : pendingVideo.status : null);
  const label = t(`listingVideoStatus.${pending ?? (video ? "ready" : "none")}`);
  return <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite" numberOfLines={1}>
    {video && pending ? t("listingVideoReplacementStatus", { status: label }) : `${t("listingVideoTitle")} · ${label}`}
  </Text>;
}
export function VideoReviewLine({ target }: { target: VideoUploadsSchemas.VideoUploadTarget }) {
  const task = useSharedListingVideoTask({ target });
  const status = useTargetVideo(target);
  const phase = task?.upload.state.phase;
  const sessionId = task?.upload.state.sessionId;
  const { refetch } = status;
  useEffect(() => { void refetch(); }, [phase, sessionId, refetch]);
  if (!status.data && (!task || (task.prep.state.phase === "idle" && task.upload.state.phase === "idle"))) return null;
  const prep = task?.prep.state.phase;
  const upload = task?.upload.state.phase;
  const localStatus = prep === "preparing" ? "preparing" : prep === "failed" ? "attention" : upload === "paused" ? "paused" : upload === "uploading" ? "uploading" : upload === "processing" && !status.data?.video && !status.data?.pendingVideo ? "processing" : upload === "failed" || upload === "operation-unknown" ? "attention" : undefined;
  return <View className="py-3"><VideoStatusLine {...status.data} localStatus={localStatus} /></View>;
}
