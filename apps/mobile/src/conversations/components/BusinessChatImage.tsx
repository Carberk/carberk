import { useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import { apiClient, ApiError } from "../../api/client";
import { loadAuthSession, subscribeAuthSession } from "../../auth/session";
import { peekAuthSession } from "../../auth/sessionSnapshot";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** Private image bytes stay in this view's memory and never enter the media CDN or device image cache. */
export function BusinessChatImage({ objectKey, businessId }: { objectKey: string; businessId?: string }) {
 const { t } = useTranslation();
 const [image, setImage] = useState<string | null>(null), [expanded, setExpanded] = useState(false), [failed, setFailed] = useState(false);
 const open = useRef<() => void>(() => {});
 const generation = useRef(0); const owner = useRef(peekAuthSession()?.user.id);
 const parts = objectKey.split("/");
 const path = `/conversations/${parts[1]}/attachments/${parts[2]}`;
 useEffect(() => {
  let mounted = true;
  const clear = () => { generation.current++; setImage(null); setExpanded(false); };
  async function load(expand = false) {
   const turn = ++generation.current; setFailed(false); setImage(null); setExpanded(false);
   try {
    const session = await loadAuthSession();
    if (!session || !mounted || turn !== generation.current) return;
    if (owner.current === undefined) owner.current = session.user.id;
    if (session.user.id !== owner.current) return;
    const bytes = await apiClient.getBytes(path, 5 * 1024 * 1024, {
     headers: businessId ? { "x-business-id": businessId } : {},
     assertSession: async () => {
      const current = await loadAuthSession();
      if (current?.user.id !== owner.current || current?.storedAt !== session.storedAt) throw new ApiError("FORBIDDEN", 403);
     },
    });
    if (!mounted || turn !== generation.current || peekAuthSession()?.user.id !== owner.current) return;
    let binary = ""; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    setImage(`data:image/webp;base64,${btoa(binary)}`); setExpanded(expand);
   } catch { if (mounted && turn === generation.current) { setImage(null); setExpanded(false); setFailed(true); } }
  }
  open.current = () => { void load(true); };
  void load();
  const unsubscribe = subscribeAuthSession(clear);
  const appState = AppState.addEventListener("change", state => { clear(); if (state === "active") void load(); });
  return () => { mounted = false; generation.current++; unsubscribe(); appState.remove(); };
 }, [path, businessId]);
 return <View><Pressable accessibilityRole="imagebutton" accessibilityLabel={t("photo")} onPress={() => open.current()}>{image ? <Image source={{ uri: image }} cachePolicy="none" style={{ width: 240, height: 180 }} contentFit="cover" /> : <Text>{failed ? t("common:retry") : t("photo")}</Text>}</Pressable>{expanded && image ? <Modal onRequestClose={() => setExpanded(false)}><View className="flex-1 bg-background p-4"><Button onPress={() => setExpanded(false)}><Text>{t("common:close")}</Text></Button><Image source={{ uri: image }} cachePolicy="none" style={{ flex: 1 }} contentFit="contain" /></View></Modal> : null}</View>;
}
