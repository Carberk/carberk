import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import type { ListingVideoTask } from "./ListingVideoTasks";

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


export function localVideoStatus(task: ListingVideoTask | undefined, video?: ListingsSchemas.ReadyListingVideo, pending?: ListingsSchemas.PendingListingVideo) {
  if (task?.prep.state.phase === "preparing") return "preparing";
  if (task?.prep.state.phase === "failed") return "attention";
  const generation = task?.upload.state.generationId;
  if (generation && video?.generationId === generation || pending && (pending.generationId !== generation || pending.status !== "uploading")) return undefined;
  switch (task?.upload.state.phase) {
    case "paused": return "paused";
    case "uploading": return "uploading";
    case "processing": return video || pending ? undefined : "processing";
    case "failed":
    case "operation-unknown": return "attention";
    default: return undefined;
  }
}
