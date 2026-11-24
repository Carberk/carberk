import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { HistoryReportArtifactSchemas as R } from "@auto-tm/contracts";

import { historyAttemptKey } from "./historyAttemptKey";

export type PdfAction = "open" | "download" | "share";
type PdfFile = Extract<R.HistoryReportArtifact, { format: "pdf" }>["pdf"];
const mime = "application/pdf";

export async function presentReportPdf(action: PdfAction, file: PdfFile, base64: string, confirm: (phase?: "picker" | "destination") => Promise<void>) {
  if (!FileSystem.cacheDirectory || !["ios", "android"].includes(Platform.OS)) throw new Error("PDF actions unavailable");
  const padding = base64.endsWith("==") ? 2 : Number(base64.endsWith("="));
  if (base64.length / 4 * 3 - padding !== file.sizeBytes || !base64.startsWith("JVBERi0")) throw new Error("Invalid PDF bytes");
  const { requireNativeModule } = await import("expo");
  await confirm();
  const directory = `${FileSystem.cacheDirectory}history-report-${historyAttemptKey()}/`;
  const uri = directory + encodeURIComponent(file.filename);
  const encoding = { encoding: FileSystem.EncodingType.Base64 };
  try {
    await FileSystem.makeDirectoryAsync(directory);
    await FileSystem.writeAsStringAsync(uri, base64, encoding);
    if (await FileSystem.readAsStringAsync(uri, encoding) !== base64) throw new Error("Incomplete PDF write");
    const chooseDestination = Platform.OS === "android" && action === "download";
    await confirm(chooseDestination ? "picker" : undefined);
    if (chooseDestination) {
      const storage = FileSystem.StorageAccessFramework;
      const selected = await storage.requestDirectoryPermissionsAsync();
      if (!selected.granted) return;
      await confirm("destination");
      const destination = await storage.createFileAsync(selected.directoryUri, file.filename.slice(0, -4), mime);
      try {
        await confirm("destination");
        await FileSystem.writeAsStringAsync(destination, base64, encoding);
      } catch (error) {
        await FileSystem.deleteAsync(destination, { idempotent: true });
        throw error;
      }
      return;
    }
    const target = Platform.OS === "android" ? await FileSystem.getContentUriAsync(uri) : uri;
    await confirm();
    await requireNativeModule<{ present: (action: PdfAction, target: string) => Promise<void> }>("HistoryReportFile").present(action, target);
  } finally {
    await FileSystem.deleteAsync(directory, { idempotent: true });
  }
}
