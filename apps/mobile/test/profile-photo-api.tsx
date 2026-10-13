import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import { afterEach } from "vitest";
import type { AuthSchemas } from "@auto-tm/contracts";

import { storeAuthSession } from "../src/auth/session";
import { queryKeys } from "../src/api/queryKeys";

import { photoApiStorage } from "./profile-photo-storage";
export { photoApiStorage } from "./profile-photo-storage";
export const PHOTO_ME = {
  id: "00000000-0000-4000-8000-00000000000a", phone: "+99365123456", email: null,
  phoneVerified: true, displayName: "Aman", nameNumber: 4821, avatarIndex: 7,
  avatarKey: null, avatarUrl: null, role: "buyer", locale: "ru",
  createdAt: "2026-01-15T00:00:00.000Z", deletionScheduledAt: null,
} satisfies AuthSchemas.MeResponse;

export async function signInPhotoUser() {
  photoApiStorage.clear();
  await storeAuthSession({ accessToken: "aman", refreshToken: "refresh-aman", user: {
    id: PHOTO_ME.id, phone: PHOTO_ME.phone, email: null, displayName: "Aman", role: "buyer",
  } });
}

const clients = new Set<QueryClient>();
afterEach(() => { clients.forEach((client) => client.clear()); clients.clear(); onlineManager.setOnline(true); });

export async function setupPhotoHook<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(queryKeys.me(), PHOTO_ME);
  clients.add(client);
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, ...(await renderHook(hook, { wrapper })) };
}
