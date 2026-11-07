import { useEffect } from "react";
import { View } from "react-native";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";

import { useSharedListingVideoTask } from "./ListingVideoTasks";
import { useTargetVideo } from "./useTargetVideo";
import { VideoStatusLine, localVideoStatus } from "./VideoStatusLine";

export function VideoReviewLine({ target }: { target: VideoUploadsSchemas.VideoUploadTarget }) {
  const task = useSharedListingVideoTask({ target });
  const status = useTargetVideo(target);
  const phase = task?.upload.state.phase;
  const sessionId = task?.upload.state.sessionId;
  const { refetch } = status;
  useEffect(() => { void refetch(); }, [phase, sessionId, refetch]);
  if (!status.data && (!task || (task.prep.state.phase === "idle" && task.upload.state.phase === "idle"))) return null;
  const localStatus = localVideoStatus(task, status.data?.video, status.data?.pendingVideo);
  return <View className="py-3"><VideoStatusLine {...status.data} localStatus={localStatus} /></View>;
}
