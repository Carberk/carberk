import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { Plus } from "lucide-react-native";
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
import { VideoCardActions, VideoCardRow, VideoProgress } from "./VideoCardRow";

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
    <VideoCardRow testID="listing-video-permission-note" alert thumb={{ kind: "error" }} title={t("listingVideoDeniedTitle")} meta={t("listingVideoDeniedBody")}>
      <VideoCardActions
        primary={{ label: t("listingVideoOpenSettings"), onPress: () => void Linking.openSettings() }}
        secondary={{ label: t("listingVideoNotNow"), onPress: onDismiss }}
      />
    </VideoCardRow>
  );
}

const FAILURE_COPY: Record<
  ListingVideoPrepFailure,
  { title: string; body: string | null; retry: string | null }
> = {
  source: { title: "listingVideoGoneTitle", body: "listingVideoGoneBody", retry: null },
  interrupted: { title: "listingVideoStoppedTitle", body: "listingVideoStoppedBody", retry: "listingVideoPrepareAgain" },
  storage: { title: "listingVideoStorageTitle", body: "listingVideoStorageBody", retry: "listingVideoTryAgain" },
  preparation: { title: "listingVideoFailedTitle", body: null, retry: "listingVideoTryAgain" },
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
        <View className="gap-0.5" accessibilityLiveRegion="polite">
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

  const idle = upload.state.phase === "idle" && prep.state.phase === "idle";
  const pickAnother = () => {
    prep.remove();
    clearSelection();
    void chooseFromLibrary();
  };

  return (
    <View className="gap-4 rounded-2xl bg-card p-4" testID="listing-video-card">
      <Text className="text-subhead font-semibold">
        {t("listingVideoTitle")} <Text className="text-callout font-normal text-muted-foreground">{t("listingVideoOptional")}</Text>
      </Text>
      {accessNote}

      <OwnerVideoStatus key={videoUploadTarget ? `${videoUploadTarget.type}:${videoUploadTarget.id}` : "local"} target={videoUploadTarget} task={task} onClearSelection={clearSelection} onChoose={() => void chooseFromLibrary()}>
      {(serverBusy, replacing, requestRemove) => {
        const cancelLabel = replacing ? t("listingVideoCancelReplacement") : t("cancel");
        const waiting = replacing ? t("listingVideoReplacementWaiting") : t("listingVideoPublishNow");
        const remove = { label: t("listingVideoRemove"), onPress: requestRemove };
        const phase = upload.state.phase;
        return <>
      {(phase === "uploading" || phase === "paused") && (() => {
        const confirmedMb = (upload.state.confirmedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = (upload.state.totalBytes / (1024 * 1024)).toFixed(1);
        const percent = upload.state.totalBytes > 0
          ? Math.min(100, Math.floor((upload.state.confirmedBytes / upload.state.totalBytes) * 100))
          : 0;
        const progress = t("listingVideoUploadProgress", { confirmed: confirmedMb, total: totalMb, percent });
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
          <VideoCardRow
            testID="listing-video-uploading"
            thumb={{ kind: phase === "uploading" ? "busy" : "empty" }}
            title={phase === "uploading" ? t("listingVideoUploading") : pausedTitle}
            meta={phase === "uploading" ? progress : `${progress} · ${pausedBody}`}
          >
            <VideoProgress percent={percent} testID="listing-video-upload-progress" />
            <VideoCardActions
              primary={phase === "uploading"
                ? { label: t("listingVideoPause"), onPress: () => void upload.pause() }
                : upload.state.pauseReason === "user"
                  ? { label: t("listingVideoContinueUpload"), onPress: () => void upload.resume() }
                  : null}
              secondary={{ label: cancelLabel, onPress: () => void upload.cancel() }}
            />
          </VideoCardRow>
        );
      })()}

      {phase === "failed" && upload.state.failure === "transfer" && (
        <VideoCardRow testID="listing-video-upload-failed" alert thumb={{ kind: "error" }} title={t("listingVideoUploadInterrupted")} meta={t("listingVideoUploadInterruptedBody")}>
          <VideoCardActions primary={{ label: t("listingVideoContinueUpload"), onPress: () => void upload.resume() }} secondary={remove} />
        </VideoCardRow>
      )}

      {phase === "failed" && upload.state.failure === "source" && (
        <VideoCardRow testID="listing-video-upload-source-missing" alert thumb={{ kind: "error" }} title={t("listingVideoGoneTitle")} meta={t("listingVideoGoneBody")}>
          <VideoCardActions primary={remove} />
        </VideoCardRow>
      )}

      {phase === "operation-unknown" && (
        <VideoCardRow
          testID="listing-video-upload-operation-unknown"
          alert
          thumb={{ kind: "error" }}
          title={upload.state.operation === "remove" ? t("listingVideoUploadNotConfirmedRemove") : t("listingVideoUploadNotConfirmedCancel")}
          meta={t("listingVideoUploadNotConfirmedBody")}
        >
          <VideoCardActions primary={{ label: t("listingVideoCheckStatus"), onPress: () => void upload.checkStatus() }} />
        </VideoCardRow>
      )}

      {phase === "processing" && !serverBusy && (
        <VideoCardRow testID="listing-video-upload-processing" thumb={{ kind: "busy" }} title={t("listingVideoProcessing")} meta={waiting} />
      )}

      {prep.state.phase === "preparing" && (
        <VideoCardRow
          testID="listing-video-preparing"
          thumb={{ kind: "busy" }}
          title={t("listingVideoPreparing")}
          meta={t("listingVideoPreparingHint", { duration: formatMmss(prep.state.selection.endS - prep.state.selection.startS) })}
        >
          <VideoCardActions secondary={{ label: t("cancel"), onPress: () => { prep.cancel(); clearSelection(); } }} />
        </VideoCardRow>
      )}

      {prep.state.phase === "failed" && (() => {
        const copy = FAILURE_COPY[prep.state.failure];
        return (
          <VideoCardRow testID="listing-video-failed" alert thumb={{ kind: "error" }} title={t(copy.title)} meta={copy.body ? t(copy.body) : null}>
            <VideoCardActions
              primary={copy.retry ? { label: t(copy.retry), onPress: prep.prepareAgain } : { label: t("listingVideoChooseAnother"), onPress: pickAnother }}
              secondary={copy.retry ? undefined : remove}
              alternatives={copy.retry ? [{ label: t("listingVideoChooseAnother"), onPress: pickAnother }, remove] : undefined}
            />
          </VideoCardRow>
        );
      })()}

      {prep.state.phase === "prepared" && phase === "idle" && (
        <VideoCardRow
          testID="listing-video-prepared"
          thumb={{ kind: "frame", uri: prep.state.selection.source.uri, atS: prep.state.selection.posterS }}
          title={t("listingVideoReady")}
          meta={formatMmss(prep.state.file.durationS)}
        >
          <VideoCardActions primary={{ label: t("listingVideoContinueEditing"), onPress: () => setEditing(true) }} secondary={remove} />
        </VideoCardRow>
      )}

      {idle && draft && !editing && (
        <VideoCardRow
          thumb={{ kind: "frame", uri: draft.source.uri, atS: toSelection(draft).posterS }}
          title={t("listingVideoChosen")}
          meta={formatMmss(draft.endS - draft.startS)}
        >
          <VideoCardActions primary={{ label: t("listingVideoContinueEditing"), onPress: () => setEditing(true) }} />
        </VideoCardRow>
      )}

      {idle && !draft && !serverBusy && (
        <View className="gap-3">
          <Text className="text-footnote text-muted-foreground">{t("listingVideoSubtitle")}</Text>
          <Button variant="secondary" onPress={() => void chooseFromLibrary()} disabled={disabled || checkingAccess || !uploadsOn} accessibilityLabel={t("listingVideoChoose")}>
            <Icon as={Plus} className="size-4" />
            <Text>{t("listingVideoChoose")}</Text>
          </Button>
        </View>
      )}

      </>;
      }}
      </OwnerVideoStatus>

      {permissionDenied && <PermissionNote onDismiss={() => setPermissionDenied(false)} />}
    </View>
  );
}
