import { ListingsSchemas } from "@auto-tm/contracts";
import { useCallback, useRef, useState } from "react";
import {
  View,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as FileSystem from "expo-file-system/legacy";
import {
  Camera,
  ImagePlus,
  AlertCircle,
  ImageIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";

import type { StagedPhoto } from "../uploadStaging/types";
import { NEEDS_ATTENTION_STATES, countUploads } from "../uploadStaging/uploadCounts";

import { PhotoActionSheet } from "./PhotoActionSheet";
import { canRetryPhoto, photoFailureReason, photoPosition } from "./photoLabels";
import { PhotoThumbnail } from "./PhotoThumbnail";
import {
  getDragTargetIndex,
  getPhotoTileSize,
  reorderPhotoIdsByIndex,
} from "./photoGridLayout";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";


interface Step2PhotosProps {
  photos: StagedPhoto[];
  onAddPhoto: (uri: string) => Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onReorderPhotos: (photoIds: string[]) => void;
  onRetryPhoto: (photoId: string) => void;
  isCompressing: boolean;
  isUploading: boolean;
  disabled?: boolean;
  fieldErrors?: Record<string, string>;
  /** Show every error, as after the first Continue tap. */
  showErrors?: boolean;
  /**
   * Whether the seller can move on while photos upload (default). Edit passes
   * false: Done there still waits for an uploaded photo, so it must not say so.
   */
  continuesWhileUploading?: boolean;
}

function usePhotoPicker(onAddPhoto: (uri: string) => Promise<void>) {
  const [cameraDenied, setCameraDenied] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const ensurePickerTempDir = useCallback(async () => {
    const dir = `${FileSystem.documentDirectory}picker-temp/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  }, []);

  const copyToPickerTemp = useCallback(
    async (sourceUri: string): Promise<string> => {
      const dir = await ensurePickerTempDir();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const destUri = `${dir}${fileName}`;
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
      return destUri;
    },
    [ensurePickerTempDir],
  );

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      // Numbered badges on iOS, and photos returned in the order tapped, which
      // becomes the grid order (#819).
      orderedSelection: true,
      quality: 1,
    });
    if (!result.canceled) {
      const copiedUris = await Promise.all(
        result.assets.map((asset) => copyToPickerTemp(asset.uri)),
      );
      await Promise.all(
        copiedUris.map(async (uri) => {
          try {
            await onAddPhoto(uri);
          } finally {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          }
        }),
      );
    }
  }, [onAddPhoto, copyToPickerTemp]);

  const takePhoto = useCallback(async () => {
    let permission = await ImagePicker.getCameraPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    }
    if (!permission.granted) {
      setCameraDenied(!permission.canAskAgain);
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
    } catch {
      // A device without a camera can install the app now that the camera is
      // optional (#793); explain instead of failing without a word.
      setCameraUnavailable(true);
      return;
    }
    if (!result.canceled && result.assets[0]) {
      const uri = await copyToPickerTemp(result.assets[0].uri);
      try {
        await onAddPhoto(uri);
      } finally {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    }
  }, [onAddPhoto, copyToPickerTemp]);

  return { pickFromLibrary, takePhoto, cameraDenied, setCameraDenied, cameraUnavailable, setCameraUnavailable };
}

function usePhotoReorder(
  photos: StagedPhoto[],
  onReorderPhotos: (photoIds: string[]) => void,
) {
  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newOrder = [...photos];
      const tmp = newOrder[index] as StagedPhoto;
      newOrder[index] = newOrder[index - 1] as StagedPhoto;
      newOrder[index - 1] = tmp;
      onReorderPhotos(newOrder.map((p) => p.photoId));
    },
    [photos, onReorderPhotos],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= photos.length - 1) return;
      const newOrder = [...photos];
      const tmp = newOrder[index] as StagedPhoto;
      newOrder[index] = newOrder[index + 1] as StagedPhoto;
      newOrder[index + 1] = tmp;
      onReorderPhotos(newOrder.map((p) => p.photoId));
    },
    [photos, onReorderPhotos],
  );

  const handleSetAsCover = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newOrder = [...photos];
      const item = newOrder.splice(index, 1)[0] as StagedPhoto;
      newOrder.unshift(item);
      onReorderPhotos(newOrder.map((p) => p.photoId));
    },
    [photos, onReorderPhotos],
  );

  return { handleMoveUp, handleMoveDown, handleSetAsCover };
}

function PhotoActions({
  disabled,
  maxReached,
  onTakePhoto,
  onPickFromLibrary,
}: {
  disabled: boolean;
  maxReached: boolean;
  onTakePhoto: () => void;
  onPickFromLibrary: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-3">
      <Button
        variant="outline"
        className="flex-1 min-h-[52px] rounded-full"
        onPress={onTakePhoto}
        disabled={disabled || maxReached}
        accessibilityLabel={t("camera")}
      >
        <Icon as={Camera} className="size-4" />
        <Text>{t("camera")}</Text>
      </Button>
      <Button
        variant="outline"
        className="flex-1 min-h-[52px] rounded-full"
        onPress={onPickFromLibrary}
        disabled={disabled || maxReached}
        accessibilityLabel={t("library")}
      >
        <Icon as={ImagePlus} className="size-4" />
        <Text>{t("library")}</Text>
      </Button>
    </View>
  );
}

function PhotoGrid({
  photos,
  disabled,
  onRemove,
  onReorderPhotos,
  onOpenActions,
}: {
  photos: StagedPhoto[];
  disabled: boolean;
  onRemove: (photoId: string) => void;
  onReorderPhotos: (photoIds: string[]) => void;
  onOpenActions: (photoId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const tileSize = getPhotoTileSize(width);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{
    index: number;
    pageX: number;
    pageY: number;
  } | null>(null);
  const dragLatest = useRef<{ pageX: number; pageY: number } | null>(null);

  const handleDragStart = useCallback(
    (index: number, pageX: number, pageY: number) => {
      if (disabled) return;
      dragStart.current = { index, pageX, pageY };
      dragLatest.current = { pageX, pageY };
      setDragOffset({ x: 0, y: 0 });
      setDraggingIndex(index);
    },
    [disabled],
  );

  const handleDragMove = useCallback((pageX: number, pageY: number) => {
    const start = dragStart.current;
    if (!start) return;
    dragLatest.current = { pageX, pageY };
    setDragOffset({ x: pageX - start.pageX, y: pageY - start.pageY });
  }, []);

  const handleDragEnd = useCallback(() => {
    const start = dragStart.current;
    const latest = dragLatest.current;
    dragStart.current = null;
    dragLatest.current = null;
    setDraggingIndex(null);
    setDragOffset({ x: 0, y: 0 });
    if (!start || !latest) return;

    const targetIndex = getDragTargetIndex({
      fromIndex: start.index,
      dx: latest.pageX - start.pageX,
      dy: latest.pageY - start.pageY,
      count: photos.length,
      tileSize,
    });
    const reorderedIds = reorderPhotoIdsByIndex(
      photos.map((photo) => photo.photoId),
      start.index,
      targetIndex,
    );
    if (targetIndex !== start.index) {
      onReorderPhotos(reorderedIds);
    }
  }, [onReorderPhotos, photos, tileSize]);

  return (
    <View
      testID="photo-grid"
      className={`w-full flex-row flex-wrap gap-2 ${disabled ? "opacity-50" : ""}`}
    >
      {photos.map((photo, index) => (
        <PhotoThumbnail
          key={photo.photoId}
          photo={photo}
          index={index}
          total={photos.length}
          onRemove={onRemove}
          onOpenActions={onOpenActions}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          isDragging={draggingIndex === index}
          dragOffset={draggingIndex === index ? dragOffset : undefined}
        />
      ))}
    </View>
  );
}

/**
 * Every failed or lost photo with its number and reason, under the grid. A
 * retryable failure gets Retry; one that cannot be retried (file missing, lost)
 * gets Remove only.
 */
function FailedPhotoList({
  photos,
  onRetry,
  onRemove,
}: {
  photos: StagedPhoto[];
  onRetry: (photoId: string) => void;
  onRemove: (photoId: string) => void;
}) {
  const { t } = useTranslation();
  const failed = photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => NEEDS_ATTENTION_STATES.includes(photo.state));
  if (failed.length === 0) return null;

  return (
    <View testID="failed-photos" className="gap-2">
      {failed.map(({ photo, index }) => {
        const retry = canRetryPhoto(photo);
        const position = photoPosition(t, index, photos.length);
        return (
          <View
            key={photo.photoId}
            className="flex-row items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2"
          >
            <Icon as={AlertCircle} className="size-4 text-destructive shrink-0" />
            <Text className="flex-1 text-callout text-destructive">
              {`#${index + 1} · ${photoFailureReason(t, photo)}`}
            </Text>
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel={`${retry ? t("retry") : t("remove")}: ${position}`}
              onPress={() => (retry ? onRetry(photo.photoId) : onRemove(photo.photoId))}
            >
              <Text>{retry ? t("retry") : t("remove")}</Text>
            </Button>
          </View>
        );
      })}
    </View>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <View className="items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 py-8 gap-3">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon as={ImageIcon} className="size-6 text-muted-foreground" />
      </View>
      <View className="items-center gap-1">
        <Text className="text-callout font-medium text-foreground">{t("noPhotos")}</Text>
        <Text className="text-caption text-muted-foreground text-center px-8">
          {t("tapCameraOrLibrary")}
        </Text>
      </View>
    </View>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <View className="flex-row items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
      <Icon as={AlertCircle} className="size-4 text-destructive shrink-0" />
      <Text className="text-callout text-destructive" accessibilityLiveRegion="polite">
        {message}
      </Text>
    </View>
  );
}

function StatusIndicator({
  isCompressing,
  isUploading,
}: {
  isCompressing: boolean;
  isUploading: boolean;
}) {
  const { t } = useTranslation();
  if (!isCompressing && !isUploading) return null;
  return (
    <View className="flex-row items-center gap-2">
      <ActivityIndicator size="small" />
      <Text className="text-callout text-muted-foreground">
        {isCompressing ? t("compressing") : t("uploading")}
      </Text>
    </View>
  );
}

export default function Step2Photos({
  photos,
  onAddPhoto,
  onRemovePhoto,
  onReorderPhotos,
  onRetryPhoto,
  isCompressing,
  isUploading,
  disabled,
  fieldErrors,
  showErrors = false,
  continuesWhileUploading = true,
}: Step2PhotosProps) {
  const { t } = useTranslation();
  // Like the other steps: the photo error shows once the seller has removed a
  // photo, or after the first Continue tap, never on arrival.
  const [removedOne, setRemovedOne] = useState(false);
  const removePhoto = (photoId: string) => {
    setRemovedOne(true);
    onRemovePhoto(photoId);
  };
  const { t: tAccount } = useTranslation("account");
  const { pickFromLibrary, takePhoto, cameraDenied, setCameraDenied, cameraUnavailable, setCameraUnavailable } = usePhotoPicker(onAddPhoto);
  const { handleMoveUp, handleMoveDown, handleSetAsCover } = usePhotoReorder(
    photos,
    onReorderPhotos,
  );
  const [actionsPhotoId, setActionsPhotoId] = useState<string | null>(null);

  const maxReached = photos.length >= ListingsSchemas.MAX_LISTING_PHOTOS;
  const photosError = showErrors || removedOne ? fieldErrors?.photos : undefined;
  const hasPhotos = photos.length > 0;
  const stillUploading = countUploads(photos).inflight > 0;
  const actionsIndex = photos.findIndex((p) => p.photoId === actionsPhotoId);
  const actionsPhoto = photos[actionsIndex] ?? null;

  return (
    <View className="gap-5 py-5">
      <Text className="text-callout text-muted-foreground leading-relaxed">
        {t("photosUnder5MB")}
      </Text>

      <Text className="text-callout font-medium text-foreground">
        {t("photosCounter", { count: photos.length })}
      </Text>
      <Text className="text-callout text-muted-foreground">
        {photos.length < ListingsSchemas.MIN_LISTING_PHOTOS
          ? t("wizardErrors.photosRequired", { minimum: ListingsSchemas.MIN_LISTING_PHOTOS })
          : photos.length < ListingsSchemas.RECOMMENDED_LISTING_PHOTOS
            ? t("photosGoalRemaining", { remaining: ListingsSchemas.RECOMMENDED_LISTING_PHOTOS - photos.length })
            : t("photosGoalReached")}
      </Text>

      <PhotoActions
        disabled={disabled ?? false}
        maxReached={maxReached}
        onTakePhoto={takePhoto}
        onPickFromLibrary={pickFromLibrary}
      />

      {photosError && photosError !== t("wizardErrors.photosRequired", { minimum: ListingsSchemas.MIN_LISTING_PHOTOS }) && <InlineError message={photosError} />}

      {maxReached && (
        <Text className="text-callout text-muted-foreground">
          {t("maxPhotosReached")}
        </Text>
      )}

      <StatusIndicator isCompressing={isCompressing} isUploading={isUploading} />

      {hasPhotos ? (
        <>
          <PhotoGrid
            photos={photos}
            disabled={disabled ?? false}
            onRemove={removePhoto}
            onReorderPhotos={onReorderPhotos}
            onOpenActions={(photoId) => {
              if (!disabled) setActionsPhotoId(photoId);
            }}
          />
          <Text className="text-caption text-muted-foreground">{t("photoTip")}</Text>
          <FailedPhotoList
            photos={photos}
            onRetry={onRetryPhoto}
            onRemove={removePhoto}
          />
          {stillUploading && continuesWhileUploading && photos.length >= ListingsSchemas.MIN_LISTING_PHOTOS && (
            <Text className="text-callout text-muted-foreground">
              {t("photosKeepUploading")}
            </Text>
          )}
        </>
      ) : (
        <EmptyState />
      )}

      <AlertDialog open={cameraDenied} onOpenChange={setCameraDenied}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAccount("permT")}</AlertDialogTitle>
            <AlertDialogDescription>{tAccount("permD")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityRole="button" onPress={() => setCameraDenied(false)}>
              <Text>{t("cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction accessibilityRole="button" onPress={() => { setCameraDenied(false); void Linking.openSettings(); }}>
              <Text>{tAccount("openSettings")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cameraUnavailable} onOpenChange={setCameraUnavailable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cameraUnavailableTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cameraUnavailableBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction accessibilityRole="button" onPress={() => setCameraUnavailable(false)}>
              <Text>{t("done")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PhotoActionSheet
        open={actionsPhoto !== null}
        photo={actionsPhoto}
        index={actionsIndex}
        total={photos.length}
        onOpenChange={(open) => {
          if (!open) setActionsPhotoId(null);
        }}
        onSetAsCover={handleSetAsCover}
        onMoveEarlier={handleMoveUp}
        onMoveLater={handleMoveDown}
        onRemove={removePhoto}
        onRetry={onRetryPhoto}
      />
    </View>
  );
}
