import { useState } from "react";
import { Platform } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import { create } from "zustand";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { AdminSchemas, IdentitySchemas, UploadsSchemas } from "@auto-tm/contracts";

import { ApiError, apiClient } from "../api/client";
import { useRemoveProfilePhoto } from "../api/identity/useRemoveProfilePhoto";
import { useSetProfilePhoto } from "../api/identity/useSetProfilePhoto";
import { CompressionError, type CompressionResult } from "../listings/uploadStaging/compressor";

import { capturePhotoSession, PhotoSessionEnded, type ProfilePhotoSession } from "./profilePhotoSession";
import { profileNoticeStore } from "./profileNotice";
import { compressProfilePhoto } from "./compressProfilePhoto";

type PhotoUploadState =
  | { status: "idle" }
  | { status: "uploading"; uri: string; percent: number | null; preparing?: boolean }
  | { status: "removing" }
  | { status: "failed" | "offline" | "too_large" | "unsupported"; operation?: "remove"; reason?: "listing" | "suspended" };
interface SelectedPhoto {
  asset: ImagePicker.ImagePickerAsset;
  compressed?: CompressionResult;
  session: ProfilePhotoSession;
  job?: Promise<void>;
  stopWaiting?: () => void;
  stopTransfer?: () => void;
}
let selected: SelectedPhoto | null = null;
let lastSource: "camera" | "library" | null = null;
let removalSession: ProfilePhotoSession | null = null;
const MAX_BYTES = 5 * 1024 * 1024;

// Route dismissal removes observers, not the job or its result.
export const profilePhotoUploadStore = create<{ state: PhotoUploadState }>()(() => ({ state: { status: "idle" } }));

async function discardPhoto() {
  const uri = selected?.compressed?.uri;
  selected?.stopWaiting?.();
  selected?.stopTransfer?.();
  selected?.session.dispose();
  selected = null;
  if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Ends the current photo operation and releases its retained selection. */
export async function resetProfilePhotoUpload() {
  removalSession?.dispose();
  removalSession = null;
  lastSource = null;
  profilePhotoUploadStore.setState({ state: { status: "idle" } });
  await discardPhoto();
}

/** Picks, shrinks and uploads one Profile Photo independently of Listing drafts. */
export function useProfilePhotoUpload() {
  const state = profilePhotoUploadStore((store) => store.state);
  const [cameraDenied, setCameraDenied] = useState(false);
  const setPhoto = useSetProfilePhoto();
  const removePhoto = useRemoveProfilePhoto();

  async function upload() {
    const photo = selected;
    if (!photo) return;
    // Retry taps share one job; competing attempts must not dispose its owner.
    photo.job ??= uploadPhoto(photo).finally(() => { photo.job = undefined; });
    return photo.job;
  }

  async function uploadPhoto(photo: SelectedPhoto) {
    profilePhotoUploadStore.setState({ state: { status: "uploading", uri: photo.compressed?.uri ?? photo.asset.uri, percent: null } });
    try {
      await photo.session.current();
      const { asset } = photo;
      if (asset.width <= 0 || asset.height <= 0) {
        profilePhotoUploadStore.setState({ state: { status: "unsupported" } });
        return;
      }
      photo.compressed ??= await compressProfilePhoto(asset.uri, `${FileSystem.cacheDirectory}profile-photo-${Date.now()}.webp`);
      await photo.session.current();
      const compressed = photo.compressed;
      if (compressed.fileSize > MAX_BYTES) {
        profilePhotoUploadStore.setState({ state: { status: "too_large" } });
        return;
      }
      if (compressed.fileSize <= 0 || compressed.width > 512 || compressed.height > 512) {
        profilePhotoUploadStore.setState({ state: { status: "unsupported" } });
        return;
      }
      if (!onlineManager.isOnline()) {
        profilePhotoUploadStore.setState({ state: { status: "offline" } });
        return;
      }
      await photo.session.current();
      const presign = await apiClient.post("/uploads/presign", {
        kind: "image", contentType: "image/webp", sizeBytes: compressed.fileSize, writeProtocol: "conditional-v1",
      } satisfies UploadsSchemas.PresignRequest, UploadsSchemas.PresignResponseSchema, { assertSession: () => photo.session.current() });
      await photo.session.current();
      if (!presign.headers || !Object.entries(presign.headers).some(([name, value]) => name.toLowerCase() === "if-match" && value.length > 0)) {
        throw new ApiError("CONTRACT_VIOLATION", 502, "Conditional upload headers are missing");
      }
      let lastPercent: number | null = null;
      let transferring = true;
      const task = FileSystem.createUploadTask(presign.uploadUrl, compressed.uri, {
        httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: presign.headers,
      }, ({ totalBytesSent, totalBytesExpectedToSend }) => {
        const known = Number.isFinite(totalBytesExpectedToSend) && totalBytesExpectedToSend > 0 && Number.isFinite(totalBytesSent) && totalBytesSent >= 0;
        const percent = known ? Math.max(lastPercent ?? 0, Math.min(100, Math.floor(100 * totalBytesSent / totalBytesExpectedToSend))) : lastPercent;
        if (percent !== null) lastPercent = percent;
        if (selected === photo && transferring) profilePhotoUploadStore.setState({ state: { status: "uploading", uri: compressed.uri, percent } });
      });
      let cancelled = false;
      const stopTransfer = () => {
        transferring = false;
        if (cancelled) return;
        cancelled = true;
        // SDK 55 removes its progress subscription only after a resolved upload.
        // cancelAsync also releases it when the native upload promise rejects.
        void task.cancelAsync().catch(() => {});
      };
      photo.stopTransfer = stopTransfer;
      let uploadTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        uploadTimer = setTimeout(() => {
          stopTransfer();
          reject(new Error("Photo upload timed out"));
        }, 60_000);
      });
      let result: FileSystem.FileSystemUploadResult | null | undefined;
      try { result = await Promise.race([task.uploadAsync(), timeout]); }
      catch (error) { stopTransfer(); throw error; }
      finally { transferring = false; photo.stopTransfer = undefined; clearTimeout(uploadTimer); }
      if (!result || result.status < 200 || result.status >= 300) throw new Error("Photo upload failed");
      let preparingAttempts = 0;
      for (;;) {
        try {
          await setPhoto.mutateAsync({ request: { key: presign.key }, session: photo.session });
          break;
        } catch (error) {
          if (conflictReason(error) !== IdentitySchemas.ProfilePhotoConflictReason.UploadPreparing) throw error;
          await photo.session.current();
          if (++preparingAttempts >= 30) throw error;
          profilePhotoUploadStore.setState({ state: { status: "uploading", uri: compressed.uri, percent: 100, preparing: true } });
          // Keep the same adoption, but stop waiting on Cancel or session end.
          await new Promise<void>((resolve) => {
            const finish = () => { photo.stopWaiting = undefined; resolve(); };
            const timer = setTimeout(finish, 2000);
            photo.stopWaiting = () => { clearTimeout(timer); finish(); };
          });
        }
      }
      await photo.session.current();
      if (selected !== photo) return;
      profilePhotoUploadStore.setState({ state: { status: "idle" } });
      profileNoticeStore.getState().show({ kind: "photoSaved" });
      await discardPhoto();
    } catch (error) {
      if (error instanceof PhotoSessionEnded || selected !== photo) {
        if (!selected || selected === photo) profilePhotoUploadStore.setState({ state: { status: "idle" } });
        photo.session.dispose();
        if (photo.compressed) await FileSystem.deleteAsync(photo.compressed.uri, { idempotent: true }).catch(() => {});
        return;
      }
      const status = error instanceof CompressionError ? "unsupported"
        : !onlineManager.isOnline() || (error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) ? "offline" : "failed";
      profilePhotoUploadStore.setState({ state: { status, reason: refusalReason(error) } });
    }
  }

  async function remove() {
    profilePhotoUploadStore.setState({ state: { status: "removing" } });
    let owner = removalSession;
    try {
      owner ??= await capturePhotoSession(() => {
        if (removalSession !== owner) return;
        removalSession = null;
        owner?.dispose();
        profilePhotoUploadStore.setState({ state: { status: "idle" } });
      });
      removalSession = owner;
      await removePhoto.mutateAsync(owner);
      await owner.current();
      if (removalSession !== owner) return;
      profilePhotoUploadStore.setState({ state: { status: "idle" } });
      profileNoticeStore.getState().show({ kind: "photoRemoved" });
      owner.dispose();
      removalSession = null;
    } catch (error) {
      if (error instanceof PhotoSessionEnded || owner !== removalSession) { owner?.dispose(); return; }
      const status = !onlineManager.isOnline() || (error instanceof ApiError && error.status === 0) ? "offline" : "failed";
      profilePhotoUploadStore.setState({ state: { status, operation: "remove", reason: refusalReason(error) } });
    }
  }

  function cancel() { void resetProfilePhotoUpload(); }

  async function pick(source: "camera" | "library") {
    lastSource = source;
    let owner: ProfilePhotoSession;
    try {
      owner = await capturePhotoSession(() => {
        if (selected?.session !== owner) return;
        selected.stopWaiting?.();
        selected.stopTransfer?.();
        selected = null;
        owner.dispose();
        profilePhotoUploadStore.setState({ state: { status: "idle" } });
      });
    } catch { return; }
    const options: ImagePicker.ImagePickerOptions = {
      // Android's crop result can throw on the native main thread for an
      // unreadable file. Both Android sources use the app's centre crop instead.
      mediaTypes: ["images"], allowsEditing: Platform.OS !== "android", aspect: [1, 1], quality: 1,
    };
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setCameraDenied(true);
          owner.dispose();
          return;
        }
      }
      const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      await owner.current();
      if (!result.canceled && result.assets[0]) {
        await discardPhoto();
        selected = { asset: result.assets[0], session: owner };
        lastSource = null;
        await upload();
      } else owner.dispose();
    } catch (error) {
      try { await owner.current(); }
      catch {
        owner.dispose();
        if (!selected) profilePhotoUploadStore.setState({ state: { status: "idle" } });
        return;
      }
      owner.dispose();
      if (error instanceof PhotoSessionEnded) return;
      const unreadable = typeof error === "object" && error !== null && "code" in error && error.code === "ERR_FAILED_TO_READ_FILE";
      profilePhotoUploadStore.setState({ state: { status: unreadable ? "unsupported" : "failed" } });
    }
  }

  return { state, pick, remove, retry: () => "operation" in state && state.operation === "remove" ? remove() : selected ? upload() : lastSource ? pick(lastSource) : Promise.resolve(), cancel, cameraDenied, dismissCameraDenied: () => setCameraDenied(false) };
}

function conflictReason(error: unknown): IdentitySchemas.ProfilePhotoConflictReason | undefined {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== IdentitySchemas.ProfilePhotoErrorCode.UploadAlreadyAttached) return undefined;
  const parsed = IdentitySchemas.ProfilePhotoConflictDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data.reason : undefined;
}

function refusalReason(error: unknown): "listing" | "suspended" | undefined {
  if (conflictReason(error) === IdentitySchemas.ProfilePhotoConflictReason.UploadAttachedToListing) return "listing";
  if (error instanceof ApiError && error.status === 403 &&
    (error.code === AdminSchemas.AdminErrorReason.UserSuspended || AdminSchemas.UserSuspendedDetailsSchema.safeParse(error.details).success)) return "suspended";
  return undefined;
}
