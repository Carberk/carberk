import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "carberk_listing_view_install_id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let pending: Promise<string> | undefined;

/** App sandbox storage deliberately avoids Keychain survival across iOS reinstalls. */
export function listingViewInstallId(): Promise<string> {
  if (!pending) {
    pending = (async () => {
      const stored = await AsyncStorage.getItem(KEY);
      if (stored && UUID.test(stored)) return stored;
      const { randomUUID } = await import("expo-crypto");
      const id = randomUUID().toLowerCase();
      await AsyncStorage.setItem(KEY, id);
      return id;
    })().finally(() => { pending = undefined; });
  }
  return pending;
}

export function listingViewsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LISTING_VIEWS_ENABLED === "true";
}
