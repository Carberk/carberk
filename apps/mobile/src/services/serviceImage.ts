import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../api/client";

export type ServiceImage = { bytes: Uint8Array; filename: string; preview?: string; stagedId?: string };
export async function pickServiceImage(): Promise<ServiceImage | null> {
 const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1 });
 if (picked.canceled || !picked.assets[0]) return null;
 const context = ImageManipulator.manipulate(picked.assets[0].uri);
 let decoded: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
 let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
 let output: File | undefined;
 try {
  decoded = await context.renderAsync();
  context.resize(decoded.width >= decoded.height ? { width: Math.min(2400, decoded.width) } : { height: Math.min(2400, decoded.height) });
  rendered = await context.renderAsync(); const encoded = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  output = new File(encoded.uri);
  if (output.size <= 0 || output.size > 5 * 1024 * 1024) throw new Error("INVALID_ATTACHMENT");
  const bytes = await output.bytes();
  let binary = ""; for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return { bytes, filename: "service-image.jpg", preview: `data:image/jpeg;base64,${btoa(binary)}` };
 } finally { output?.delete(); rendered?.release(); decoded?.release(); context.release(); }
}
export async function uploadServiceImage(id: string, purpose: S.ServicePurpose, image: ServiceImage, categoryOverride?: "payment_evidence"): Promise<string> {
 const category = categoryOverride ?? (purpose === "support" ? "support_communication" : "history_communication");
 if (!image.stagedId) {
  const staged = await apiClient.post(`/services/conversations/${id}/attachments`, { category, visibility: "customer", contentType: "image/jpeg", sizeBytes: image.bytes.length, filename: image.filename, rights: { category, purpose: "Synthetic service conversation verification", basis: "Owned synthetic fixture", provenance: "Synthetic test image selected by admitted fixture", identifiability: "personal", use: ["service"], schedule: purpose === "support" ? { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true } : { kind: "until", until: new Date(Date.now() + (category === "payment_evidence" ? 30 : 7) * 86400000).toISOString(), reason: "Bounded synthetic verification" }, supplierRestrictions: "", hold: null } }, z.object({ id: z.string().uuid() }));
  image.stagedId = staged.id;
 }
 await apiClient.postBinary(`/services/conversations/${id}/attachments/${image.stagedId}/bytes`, image.bytes);
 return image.stagedId;
}
