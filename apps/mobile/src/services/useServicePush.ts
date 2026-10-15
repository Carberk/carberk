import { useEffect } from "react";
import { AppState } from "react-native";

import { apiClient } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { loadAuthSession } from "../auth/session";
import { getNativePushToken } from "../notifications/getPushToken";
import { getNotificationPermissionState } from "../notifications/requestNotificationPermission";

/** Rebind after Session rotation or foreground return. Permission denial leaves
 * durable HTTP and socket messaging usable. No customer content enters push. */
export function useServicePush(id: string | undefined): void {
 const { userId, isAuthenticated } = useAuth();
 useEffect(() => {
  if (!id || !userId || isAuthenticated !== true) return;
  let disposed = false, running = false;
  async function current() { return !disposed && (await loadAuthSession())?.user.id === userId; }
  async function bind() {
   if (running) return; running = true;
   try {
    if (await getNotificationPermissionState() !== "granted") return;
    const device = await getNativePushToken();
    if (device.status !== "ok" || !await current()) return;
    await apiClient.post("/notifications/tokens", { token: device.token, platform: device.platform });
    if (!await current()) return;
    await apiClient.post(`/services/conversations/${id}/push`, { deviceToken: device.token });
   } catch { /* Message access remains independent of push delivery. */ }
   finally { running = false; }
  }
  void bind();
  const listener = AppState.addEventListener("change", state => { if (state === "active") void bind(); });
  return () => { disposed = true; listener.remove(); };
 }, [id, userId, isAuthenticated]);
}
