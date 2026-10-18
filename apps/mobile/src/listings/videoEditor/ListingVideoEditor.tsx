import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { apiClient } from "../../api/client";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export interface ListingVideoEditorProps {
  ownerId: string;
  target: { kind: "draft" | "listing"; id: string };
  businessId?: string | undefined;
  disabled?: boolean | undefined;
}
const capabilities = z.object({ canUpload: z.boolean(), canView: z.boolean() }).strict();
const copy = {
 en: { add: "Add video", optional: "Optional video, up to 90 seconds", failure: "This video could not be opened. Choose another video.", selected: "Selected video", remove: "Remove video" },
 ru: { add: "Добавить видео", optional: "Необязательное видео до 90 секунд", failure: "Не удалось открыть видео. Выберите другое.", selected: "Выбранное видео", remove: "Удалить видео" },
 tk: { add: "Wideo goş", optional: "Islege görä 90 sekunda çenli wideo", failure: "Wideo açylmady. Başga wideo saýlaň.", selected: "Saýlanan wideo", remove: "Wideony aýyr" },
};

/** Photos remain independent. Every mount asks the server for current admission. */
export function ListingVideoEditor({ ownerId, target, businessId, disabled }: ListingVideoEditorProps) {
  const { i18n } = useTranslation();
  const c = copy[i18n.language === "ru" ? "ru" : i18n.language === "tk" ? "tk" : "en"];
  const capability = useQuery({ queryKey: ["listing-video-capabilities", ownerId, businessId ?? null], queryFn: () => apiClient.get("/listing-video/capabilities", capabilities), staleTime: 0 });
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(false);
  async function pick() {
    setPicking(true); setError(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, allowsEditing: false, quality: 1 });
      if (!result.canceled && result.assets[0]) setSelected(result.assets[0]);
    } catch { setError(true); }
    finally { setPicking(false); }
  }
  if (!capability.data?.canUpload) return null;
  return <View className="gap-3 py-4" testID={`video-editor-${target.kind}-${target.id}`}>
    <Text className="text-callout text-muted-foreground">{c.optional}</Text>
    {selected ? <View className="gap-2"><Text>{c.selected}</Text><Button variant="outline" disabled={disabled} onPress={() => setSelected(null)}><Text>{c.remove}</Text></Button></View> : null}
    <Button variant="outline" disabled={disabled || picking} onPress={() => { void pick(); }}><Text>{c.add}</Text></Button>
    {error ? <Text accessibilityRole="alert">{c.failure}</Text> : null}
  </View>;
}
