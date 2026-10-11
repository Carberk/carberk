import * as FileSystem from "expo-file-system/legacy";

const STAGING_ROOT = `${FileSystem.documentDirectory}listing-staging/`;

export function getStagingPath(stagingKey: string, photoId: string): string {
  return `${STAGING_ROOT}${stagingKey}/${photoId}.webp`;
}

export function getDraftDir(stagingKey: string): string {
  return `${STAGING_ROOT}${stagingKey}/`;
}

export async function ensureDraftDir(stagingKey: string): Promise<void> {
  const dir = getDraftDir(stagingKey);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function deleteDraftDir(stagingKey: string): Promise<void> {
  const dir = getDraftDir(stagingKey);
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

export async function listDraftDirs(): Promise<string[]> {
  const rootInfo = await FileSystem.getInfoAsync(STAGING_ROOT);
  if (!rootInfo.exists) {
    return [];
  }
  return FileSystem.readDirectoryAsync(STAGING_ROOT);
}

export async function listLocalPhotoIds(stagingKey: string): Promise<string[]> {
  const dir = getDraftDir(stagingKey);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    return [];
  }
  const files = await FileSystem.readDirectoryAsync(dir);
  return files
    .filter((f) => /\.(jpg|webp)$/.test(f))
    .map((f) => f.replace(/\.(jpg|webp)$/, ""));
}

export async function listOrphanDirs(existingDraftIds: string[]): Promise<string[]> {
  const dirs = await listDraftDirs();
  return dirs.filter((dir) => !existingDraftIds.includes(dir));
}
