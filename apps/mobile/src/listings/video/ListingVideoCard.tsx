import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { Plus, Video } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import type { ListingVideoNativeModule } from "../../../modules/listing-video/src/prepare";
import { mapErrorToCopy } from "../../api/getErrorCopy";

import { createListingVideoDraft, formatMmss, toSelection, type ListingVideoDraft } from "./listingVideo";
import {
  type AppStateSubscribe,
  type ListingVideoFileSystem,
  type ListingVideoPrepFailure,
} from "./videoPreparation";
import { type VideoUploadApi, type VideoUploadFileSystem, type VideoUploadPersistence, type VideoUploadTransport } from "./videoUpload";
import { useLocalListingVideoTask, useSharedListingVideoTask, useListingVideoTasks, type ListingVideoTask, type ListingVideoTaskOptions } from "./ListingVideoTasks";
import { OwnerVideoStatus } from "./OwnerVideoStatus";
import { ListingVideoEditor } from "./ListingVideoEditor";
import { useListingVideoAccess } from "./useListingVideoAccess";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

interface ListingVideoCardProps {
  canUploadVideo?: boolean;
  isVideoUploadTester?: boolean;
  /** Fake native module in tests; the real AVFoundation module by default. */
  videoNative?: ListingVideoNativeModule | null;
  /** Clock for preparation measurements in tests; the real clock by default. */
  videoNow?: () => number;
  videoFileSystem?: ListingVideoFileSystem;
  subscribeAppState?: AppStateSubscribe;
  videoUploadTarget?: VideoUploadsSchemas.VideoUploadTarget;
  videoUploadApi?: VideoUploadApi;
  videoUploadFileSystem?: VideoUploadFileSystem;
  videoUploadTransport?: VideoUploadTransport;
  videoUploadPersistence?: VideoUploadPersistence;
  disabled?: boolean;
}

/**
 * Optional Video card for the Photos step (create wizard and Edit listing).
 * Hidden unless the current user is an eligible upload tester. After "Use video" the chosen
 * clip is copied into app storage and prepared on the phone (#1044);
 * photos and Listing fields are never touched by video failures.
 */
function PermissionNote({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2" testID="listing-video-permission-note">
      <View className="rounded-2xl bg-destructive/10 p-3">
        <Text className="text-callout font-semibold">{t("listingVideoDeniedTitle")}</Text>
        <Text className="text-footnote text-muted-foreground">{t("listingVideoDeniedBody")}</Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onPress={() => void Linking.openSettings()}
          accessibilityLabel={t("listingVideoOpenSettings")}
        >
          <Text>{t("listingVideoOpenSettings")}</Text>
        </Button>
        <Button variant="outline" className="flex-1" onPress={onDismiss} accessibilityLabel={t("listingVideoNotNow")}>
          <Text>{t("listingVideoNotNow")}</Text>
        </Button>
      </View>
    </View>
  );
}

const FAILURE_COPY: Record<
  ListingVideoPrepFailure,
  { title: string; body: string; retry: string | null }
> = {
  source: { title: "listingVideoGoneTitle", body: "listingVideoGoneBody", retry: null },
  interrupted: { title: "listingVideoStoppedTitle", body: "listingVideoStoppedBody", retry: "listingVideoPrepareAgain" },
  storage: { title: "listingVideoStorageTitle", body: "listingVideoStorageBody", retry: "listingVideoTryAgain" },
  preparation: { title: "listingVideoFailedTitle", body: "listingVideoFailedBody", retry: "listingVideoTryAgain" },
};

export function ListingVideoCard(props: ListingVideoCardProps) {
  const tasks = useListingVideoTasks();
  const options: ListingVideoTaskOptions = { target: props.videoUploadTarget, native: props.videoNative, now: props.videoNow,
    fileSystem: props.videoFileSystem, subscribeAppState: props.subscribeAppState,
    api: props.videoUploadApi, uploadFileSystem: props.videoUploadFileSystem,
    transport: props.videoUploadTransport, persistence: props.videoUploadPersistence };
  return tasks && props.videoUploadTarget
    ? <SharedCard {...props} options={options} />
    : <LocalCard {...props} options={options} />;
}
function SharedCard(props: ListingVideoCardProps & { options: ListingVideoTaskOptions }) {
  const task = useSharedListingVideoTask(props.options);
  return task ? <VideoCardContent {...props} task={task} /> : null;
}
function LocalCard(props: ListingVideoCardProps & { options: ListingVideoTaskOptions }) {
  const task = useLocalListingVideoTask(props.options);
  return <VideoCardContent {...props} task={task} />;
}
function VideoCardContent({ canUploadVideo, isVideoUploadTester, disabled = false, videoUploadTarget, task }: ListingVideoCardProps & { task: ListingVideoTask }) {
  const { t } = useTranslation();
  const access = useListingVideoAccess(canUploadVideo === undefined);
  const tester = isVideoUploadTester ?? canUploadVideo ?? access.isVideoUploadTester;
  const uploadsOn = canUploadVideo ?? access.canUploadVideo;
  const [checkingAccess, setCheckingAccess] = useState(false);
  const accessCheckInFlight = useRef(false);
  const [accessError, setAccessError] = useState<unknown>(null);
  const [draft, setDraft] = useState<ListingVideoDraft | null>(null);
  const [committedDraft, setCommittedDraft] = useState<ListingVideoDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const selectionRevision = useRef(0);
  useEffect(() => () => { selectionRevision.current += 1; }, []);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const { prep, upload } = task;
  useEffect(() => {
    if (upload.state.phase === "idle") return;
    setDraft(null); setCommittedDraft(null);
  }, [upload.state.phase]);
  const checkAccess = async () => {
    if (accessCheckInFlight.current) return false;
    accessCheckInFlight.current = true;
    setCheckingAccess(true);
    setAccessError(null);
    try {
      return canUploadVideo ?? await access.refresh();
    } catch (error) {
      setAccessError(error);
      return false;
    } finally {
      accessCheckInFlight.current = false;
      setCheckingAccess(false);
    }
  };

  const chooseFromLibrary = async () => {
    selectionRevision.current += 1;
    if (!(await checkAccess())) return;
    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const durationS = (asset.duration ?? 0) / 1000;
    setDraft(createListingVideoDraft({ uri: asset.uri, durationS }));
    setEditing(true);
  };

  if (!tester) return null;

  const accessNote = (
    <>
      {checkingAccess && <ActivityIndicator accessibilityLabel={t("loading")} />}
      {!uploadsOn && (
        <View className="gap-1 rounded-2xl bg-secondary p-3" accessibilityLiveRegion="polite">
          <Text className="text-callout font-semibold">{t("listingVideoUploadsPaused")}</Text>
          <Text className="text-footnote text-muted-foreground">{t("listingVideoUploadsPausedBody")}</Text>
        </View>
      )}
      {accessError != null && <Text accessibilityRole="alert" className="text-footnote text-destructive">{mapErrorToCopy(accessError, t).description}</Text>}
    </>
  );

  if (draft && editing) {
    return (
      <View className="gap-3">
        <ListingVideoEditor
          draft={draft}
          actionNote={accessNote}
          onDraftChange={(next) => {
            selectionRevision.current += 1;
            setDraft(next);
          }}
          onCancel={() => {
            selectionRevision.current += 1;
            setDraft(committedDraft);
            setEditing(false);
          }}
          onChange={() => void chooseFromLibrary()}
          onUse={() => void (async () => {
            const revision = selectionRevision.current;
            if (!(await checkAccess()) || revision !== selectionRevision.current) return;
            setCommittedDraft(draft);
            setEditing(false);
            prep.prepare(toSelection(draft));
          })()}
        />
        {permissionDenied && <PermissionNote onDismiss={() => setPermissionDenied(false)} />}
      </View>
    );
  }

  const clearSelection = () => {
    setDraft(null);
    setCommittedDraft(null);
  };

  return (
    <View className="gap-3 rounded-3xl bg-card p-4" testID="listing-video-card">
      {accessNote}
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-subhead">
            {t("listingVideoTitle")} <Text className="text-callout text-muted-foreground">{t("listingVideoOptional")}</Text>
          </Text>
          <Text className="text-footnote text-muted-foreground">{t("listingVideoSubtitle")}</Text>
        </View>
        <Icon as={Video} className="size-6 text-foreground" />
      </View>

      <OwnerVideoStatus key={videoUploadTarget ? `${videoUploadTarget.type}:${videoUploadTarget.id}` : "local"} target={videoUploadTarget} task={task} onClearSelection={clearSelection} onChoose={() => void chooseFromLibrary()}>
      {(serverBusy, replacing, requestRemove) => <>
      {(upload.state.phase === "uploading" || upload.state.phase === "paused") && (() => {
        const confirmedMb = (upload.state.confirmedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = (upload.state.totalBytes / (1024 * 1024)).toFixed(1);
        const percent = upload.state.totalBytes > 0
          ? Math.min(100, Math.floor((upload.state.confirmedBytes / upload.state.totalBytes) * 100))
          : 0;
        const pausedTitle = upload.state.pauseReason === "network"
          ? t("listingVideoUploadWaiting")
          : upload.state.pauseReason === "background"
            ? t("listingVideoUploadBackground")
            : t("listingVideoUploadPaused");
        const pausedBody = upload.state.pauseReason === "network"
          ? t("listingVideoUploadWaitingBody")
          : upload.state.pauseReason === "background"
            ? t("listingVideoUploadBackgroundBody")
            : t("listingVideoUploadPausedBody");
        return (
          <View className="gap-2" testID="listing-video-uploading">
            <Text className="text-callout font-semibold" accessibilityLiveRegion="polite">
              {upload.state.phase === "uploading" ? t("listingVideoUploading") : pausedTitle}
            </Text>
            <Text className="text-footnote text-muted-foreground">
              {upload.state.phase === "uploading" ? t("listingVideoUploadProgress", { confirmed: confirmedMb, total: totalMb, percent }) : `${t("listingVideoUploadProgress", { confirmed: confirmedMb, total: totalMb, percent })} · ${pausedBody}`}
            </Text>
            <View className="h-2 overflow-hidden rounded-full bg-secondary" testID="listing-video-upload-progress">
              <View className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </View>
            <View className="flex-row gap-2">
              {upload.state.phase === "uploading" ? (
                <Button variant="secondary" onPress={() => void upload.pause()} accessibilityLabel={t("listingVideoPause")}>
                  <Text>{t("listingVideoPause")}</Text>
                </Button>
              ) : upload.state.pauseReason === "user" ? (
                <Button variant="secondary" onPress={() => void upload.resume()} accessibilityLabel={t("listingVideoContinueUpload")}>
                  <Text>{t("listingVideoContinueUpload")}</Text>
                </Button>
              ) : null}
              <Button variant="outline" onPress={() => void upload.cancel()} accessibilityLabel={replacing ? t("listingVideoCancelReplacement") : t("cancel")}>
                <Text>{replacing ? t("listingVideoCancelReplacement") : t("cancel")}</Text>
              </Button>
            </View>
          </View>
        );
      })()}

      {upload.state.phase === "failed" && upload.state.failure === "transfer" && (
        <View className="gap-2" testID="listing-video-upload-failed">
          <View className="rounded-2xl bg-destructive/10 p-3" accessibilityRole="alert">
            <Text className="text-callout font-semibold">{t("listingVideoUploadInterrupted")}</Text>
            <Text className="text-footnote text-muted-foreground">{t("listingVideoUploadInterruptedBody")}</Text>
          </View>
          <Button variant="secondary" onPress={() => void upload.resume()} accessibilityLabel={t("listingVideoContinueUpload")}>
            <Text>{t("listingVideoContinueUpload")}</Text>
          </Button>
          <Button variant="outline" onPress={requestRemove} accessibilityLabel={t("listingVideoRemove")}>
            <Text>{t("listingVideoRemove")}</Text>
          </Button>
        </View>
      )}

      {upload.state.phase === "failed" && upload.state.failure === "source" && (
        <View className="gap-2" testID="listing-video-upload-source-missing">
          <View className="rounded-2xl bg-destructive/10 p-3" accessibilityRole="alert">
            <Text className="text-callout font-semibold">{t("listingVideoGoneTitle")}</Text>
            <Text className="text-footnote text-muted-foreground">{t("listingVideoGoneBody")}</Text>
          </View>
          <Button variant="outline" onPress={requestRemove} accessibilityLabel={t("listingVideoRemove")}>
            <Text>{t("listingVideoRemove")}</Text>
          </Button>
        </View>
      )}

      {upload.state.phase === "operation-unknown" && (
        <View className="gap-2" testID="listing-video-upload-operation-unknown">
          <View className="rounded-2xl bg-destructive/10 p-3" accessibilityRole="alert">
            <Text className="text-callout font-semibold">
              {upload.state.operation === "remove" ? t("listingVideoUploadNotConfirmedRemove") : t("listingVideoUploadNotConfirmedCancel")}
            </Text>
            <Text className="text-footnote text-muted-foreground">{t("listingVideoUploadNotConfirmedBody")}</Text>
          </View>
          <Button variant="outline" onPress={() => void upload.checkStatus()} accessibilityLabel={t("listingVideoCheckStatus")}>
            <Text>{t("listingVideoCheckStatus")}</Text>
          </Button>
        </View>
      )}

      {upload.state.phase === "processing" && !serverBusy && (
        <View className="gap-2" testID="listing-video-upload-processing">
          <Text className="text-callout font-semibold">{t("listingVideoProcessing")}</Text>
          <Text className="text-footnote text-muted-foreground">{t("listingVideoPublishNow")}</Text>
        </View>
      )}

      {prep.state.phase === "preparing" && (
        <View className="gap-2" testID="listing-video-preparing">
          <Text className="text-callout font-semibold" accessibilityLiveRegion="polite">
            {t("listingVideoPreparing")}
          </Text>
          <Text className="text-footnote text-muted-foreground">
            {t("listingVideoPreparingHint", {
              duration: formatMmss(prep.state.selection.endS - prep.state.selection.startS),
            })}
          </Text>
          <View className="h-2 overflow-hidden rounded-full bg-secondary" testID="listing-video-preparing-bar">
            <ActivityIndicator accessibilityLabel={t("listingVideoPreparing")} />
          </View>
          <Button
            variant="outline"
            onPress={() => {
              prep.cancel();
              clearSelection();
            }}
            accessibilityLabel={t("cancel")}
          >
            <Text>{t("cancel")}</Text>
          </Button>
        </View>
      )}

      {prep.state.phase === "failed" && (
        <View className="gap-2" testID="listing-video-failed">
          <View className="rounded-2xl bg-destructive/10 p-3" accessibilityRole="alert">
            <Text className="text-callout font-semibold">{t(FAILURE_COPY[prep.state.failure].title)}</Text>
            <Text className="text-footnote text-muted-foreground">{t(FAILURE_COPY[prep.state.failure].body)}</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {FAILURE_COPY[prep.state.failure].retry ? (
              <Button variant="secondary" onPress={prep.prepareAgain} accessibilityLabel={t(FAILURE_COPY[prep.state.failure].retry ?? "")}>
                <Text>{t(FAILURE_COPY[prep.state.failure].retry ?? "")}</Text>
              </Button>
            ) : null}
            <Button
              variant="outline"
              onPress={() => {
                prep.remove();
                clearSelection();
                void chooseFromLibrary();
              }}
              accessibilityLabel={t("listingVideoChooseAnother")}
            >
              <Text>{t("listingVideoChooseAnother")}</Text>
            </Button>
            <Button
              variant="outline"
              onPress={requestRemove}
              accessibilityLabel={t("listingVideoRemove")}
            >
              <Text>{t("listingVideoRemove")}</Text>
            </Button>
          </View>
        </View>
      )}

      {prep.state.phase === "prepared" && upload.state.phase === "idle" && (
        <View className="gap-2" testID="listing-video-prepared">
          <View className="rounded-2xl bg-secondary p-3">
            <Text className="text-callout font-semibold">{t("listingVideoReady")}</Text>
            <Text className="text-footnote text-muted-foreground">
              {t("listingVideoReadySummary", {
                duration: formatMmss(prep.state.file.durationS),
                cover: formatMmss(prep.state.selection.posterS),
              })}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Button variant="secondary" className="flex-1" onPress={() => setEditing(true)} accessibilityLabel={t("listingVideoContinueEditing")}>
              <Text>{t("listingVideoContinueEditing")}</Text>
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onPress={requestRemove}
              accessibilityLabel={t("listingVideoRemove")}
            >
              <Text>{t("listingVideoRemove")}</Text>
            </Button>
          </View>
        </View>
      )}

      {upload.state.phase === "idle" && prep.state.phase === "idle" && draft && !editing && (
        <View className="gap-2">
          <View className="rounded-2xl bg-secondary p-3">
            <Text className="text-callout font-semibold">{t("listingVideoChosen")}</Text>
            <Text className="text-footnote text-muted-foreground">
              {t("listingVideoChosenSummary", {
                duration: formatMmss(draft.endS - draft.startS),
                cover: formatMmss(toSelection(draft).posterS),
              })}
            </Text>
          </View>
          <Button variant="secondary" onPress={() => setEditing(true)} accessibilityLabel={t("listingVideoContinueEditing")}>
            <Text>{t("listingVideoContinueEditing")}</Text>
          </Button>
        </View>
      )}

      {upload.state.phase === "idle" && prep.state.phase === "idle" && !draft && !serverBusy && (
        <Button onPress={() => void chooseFromLibrary()} disabled={disabled || checkingAccess || !uploadsOn} accessibilityLabel={t("listingVideoChoose")}>
          <Icon as={Plus} className="size-4" />
          <Text>{t("listingVideoChoose")}</Text>
        </Button>
      )}

      </>}
      </OwnerVideoStatus>

      {permissionDenied && <PermissionNote onDismiss={() => setPermissionDenied(false)} />}
    </View>
  );
}
