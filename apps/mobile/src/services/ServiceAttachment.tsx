import { useState } from "react";
import { Image, View } from "react-native";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { apiClient } from "../api/client";

import { serviceCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** Private images are fetched with current credentials into view memory.
 * No stored object URL or device file survives this view's lifecycle. */
export function ServiceAttachment({ conversationId, attachment, locale }: { conversationId: string; attachment: NonNullable<S.ServiceMessage["attachment"]>; locale: string }) {
 const c = serviceCopy(locale); const [image, setImage] = useState<string | null>(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
 async function open() {
  if (busy) return; setBusy(true); setFailed(false); setImage(null);
  try {
   const bytes = await apiClient.getBytes(`/services/conversations/${conversationId}/attachments/${attachment.id}`, attachment.sizeBytes);
   let binary = ""; for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
   setImage(`data:${attachment.contentType};base64,${btoa(binary)}`);
  } catch { setFailed(true); } finally { setBusy(false); }
 }
 return <View className="gap-2"><Text>{attachment.filename}</Text>{["image/jpeg", "image/webp"].includes(attachment.contentType) ? <Button onPress={() => { void open(); }} disabled={busy}><Text>{failed ? c.refresh : c.attachment}</Text></Button> : null}{failed ? <Text accessibilityRole="alert">{c.permission}</Text> : null}{image ? <Image accessibilityLabel={attachment.filename} source={{ uri: image }} className="h-72 w-full" resizeMode="contain"/> : null}</View>;
}
