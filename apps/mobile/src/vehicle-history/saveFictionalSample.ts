import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { fictionalSample } from "./fictionalSample";

/** Save original bytes, then let the person choose a destination. Never infer export success. */
export async function saveFictionalSample() {
  if (!FileSystem.documentDirectory) throw new Error("File storage unavailable");
  const uri = `${FileSystem.documentDirectory}carberk-fictional-history.txt`;
  await FileSystem.writeAsStringAsync(uri, fictionalSample);
  if (await FileSystem.readAsStringAsync(uri) !== fictionalSample) throw new Error("Incomplete file");
  if (Platform.OS === "android") {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) throw new Error("Destination not selected");
    const destination = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri, "carberk-fictional-history.txt", "text/plain",
    );
    await FileSystem.writeAsStringAsync(destination, fictionalSample);
  } else {
    await Share.share({ url: uri });
  }
}
