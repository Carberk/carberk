import { useEffect } from "react";
import { View } from "react-native";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { useSharedListingVideoTask } from "./ListingVideoTasks";
import { useTargetVideo } from "./useTargetVideo";
import { useListingVideoAccess } from "./useListingVideoAccess";
import { VideoStatusLine, localVideoStatus } from "./VideoStatusLine";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function VideoReviewLine({ target }: { target: VideoUploadsSchemas.VideoUploadTarget }) {
  const { t } = useTranslation();
  const { isVideoUploadTester } = useListingVideoAccess(true);
  const task = useSharedListingVideoTask({ target: isVideoUploadTester ? target : undefined });
  const status = useTargetVideo(target, isVideoUploadTester);
  const phase = task?.upload.state.phase;
  const sessionId = task?.upload.state.sessionId;
  const { refetch } = status;
  useEffect(() => { if (isVideoUploadTester) void refetch(); }, [isVideoUploadTester, phase, sessionId, refetch]);
  if (!isVideoUploadTester) return null;
  if (status.isError) return <View className="gap-2 py-3" accessibilityRole="alert">
    <Text className="text-callout">{t("listingVideoStatusFailed")}</Text>
    <Button variant="outline" onPress={() => void refetch()}><Text>{t("listingVideoCheckAgain")}</Text></Button>
  </View>;
  if (!status.data && (!task || (task.prep.state.phase === "idle" && task.upload.state.phase === "idle"))) return null;
  const localStatus = localVideoStatus(task, status.data?.video, status.data?.pendingVideo);
  return <View className="py-3"><VideoStatusLine {...status.data} localStatus={localStatus} /></View>;
}
