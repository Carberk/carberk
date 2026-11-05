import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../../api/client";
import { storeAuthSession } from "../../auth/session";
import { server } from "../../../test/msw";
import { fireEvent, renderMobile } from "../../../test/render";

import { useWizardAutosave } from "./useWizardAutosave";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
  deleteItemAsync: async (key: string) => { storage.delete(key); },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: () => () => {} },
}));

const DRAFT_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(async () => {
  storage.clear();
  await storeAuthSession({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh",
    user: { id: USER_ID, phone: "+99365123456", email: null, displayName: null, role: "buyer" } });
});

function AutosaveHarness({ draftId = DRAFT_ID, older = "Older description", newer = "Newest description" }: {
  draftId?: string | undefined;
  older?: string;
  newer?: string;
}) {
  const autosave = useWizardAutosave(draftId);
  const [olderDone, setOlderDone] = useState(false);
  const [flushed, setFlushed] = useState<boolean | null>(null);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Save older" onPress={() => {
      setOlderDone(false);
      void autosave.forceSave({ description: older }).then(() => setOlderDone(true));
    }}><Text>Save older</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Flush newer" onPress={() => {
      setFlushed(null);
      void autosave.flush({ description: newer }).then(setFlushed);
    }}><Text>Flush newer</Text></Pressable>
    {olderDone ? <Text>Older save settled</Text> : null}
    {flushed !== null ? <Text>{flushed ? "Flush saved" : "Flush failed"}</Text> : null}
    <Text>{autosave.saveStatus}</Text>
  </View>;
}

it("keeps the newest flushed draft when an older save's storage write is delayed", async () => {
  let payload = { description: "Initial description" };
  let olderStarted = false;
  let newerWritten: () => void = () => {};
  const newerGate = new Promise<void>(resolve => { newerWritten = resolve; });
  const draft = () => ({ id: DRAFT_ID, userId: USER_ID, payload,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
  server.use(
    http.patch("*/listings/drafts/:id", async ({ request }) => {
      const incoming = await request.json() as typeof payload;
      if (incoming.description === "Older description") {
        olderStarted = true;
        // Concurrent writers release the older write after the newer one.
        // A serialized writer needs the fallback to let the older one finish.
        await Promise.race([newerGate, new Promise<void>(resolve => setTimeout(resolve, 1000))]);
      }
      payload = incoming;
      if (incoming.description === "Newest description") newerWritten();
      return HttpResponse.json(draft());
    }),
    http.get("*/listings/drafts/:id", () => HttpResponse.json(draft())),
  );
  const view = await renderMobile(<AutosaveHarness />);
  await fireEvent.press(view.getByRole("button", { name: "Save older" }));
  await vi.waitFor(() => expect(olderStarted).toBe(true));
  await fireEvent.press(view.getByRole("button", { name: "Flush newer" }));
  await view.findByText("Flush saved", undefined, { timeout: 3000 });
  await view.findByText("Older save settled");

  const stored = await apiClient.get(`/listings/drafts/${DRAFT_ID}`, ListingsSchemas.ListingDraftSchema);
  expect(stored.payload.description).toBe("Newest description");
});

it("restores an earlier saved value when an intervening write is still pending", async () => {
  let payload = { description: "Initial description" };
  let interveningStarted = false;
  const draft = () => ({ id: DRAFT_ID, userId: USER_ID, payload,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
  server.use(
    http.patch("*/listings/drafts/:id", async ({ request }) => {
      const incoming = await request.json() as typeof payload;
      if (incoming.description === "Intervening value") {
        interveningStarted = true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      payload = incoming;
      return HttpResponse.json(draft());
    }),
    http.get("*/listings/drafts/:id", () => HttpResponse.json(draft())),
  );
  const view = await renderMobile(<AutosaveHarness older="Original value" />);
  await fireEvent.press(view.getByRole("button", { name: "Save older" }));
  await view.findByText("Older save settled");
  await view.rerender(<AutosaveHarness older="Intervening value" newer="Original value" />);
  await fireEvent.press(view.getByRole("button", { name: "Save older" }));
  await vi.waitFor(() => expect(interveningStarted).toBe(true));
  await fireEvent.press(view.getByRole("button", { name: "Flush newer" }));
  await view.findByText("Flush saved");
  await view.findByText("Older save settled");

  const stored = await apiClient.get(`/listings/drafts/${DRAFT_ID}`, ListingsSchemas.ListingDraftSchema);
  expect(stored.payload.description).toBe("Original value");
});

it("reports a failed flush once and still accepts the next save", async () => {
  let payload = { description: "Initial description" };
  let failedWrites = 0;
  const draft = () => ({ id: DRAFT_ID, userId: USER_ID, payload,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
  server.use(
    http.patch("*/listings/drafts/:id", async ({ request }) => {
      const incoming = await request.json() as typeof payload;
      if (incoming.description === "Newest description") {
        failedWrites += 1;
        return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
      }
      payload = incoming;
      return HttpResponse.json(draft());
    }),
    http.get("*/listings/drafts/:id", () => HttpResponse.json(draft())),
  );
  const view = await renderMobile(<AutosaveHarness />);
  await fireEvent.press(view.getByRole("button", { name: "Flush newer" }));
  await view.findByText("Flush failed");
  expect(failedWrites).toBe(1);
  await fireEvent.press(view.getByRole("button", { name: "Save older" }));
  await view.findByText("Older save settled");

  const stored = await apiClient.get(`/listings/drafts/${DRAFT_ID}`, ListingsSchemas.ListingDraftSchema);
  expect(stored.payload.description).toBe("Older description");
});

it("does not let an earlier retry repeat a failed single-attempt flush", async () => {
  let flushWrites = 0;
  server.use(http.patch("*/listings/drafts/:id", async ({ request }) => {
    const incoming = await request.json() as { description: string };
    if (incoming.description === "Newest description") flushWrites += 1;
    return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
  }));
  const view = await renderMobile(<AutosaveHarness />);
  await fireEvent.press(view.getByRole("button", { name: "Save older" }));
  await view.findByText("Older save settled");
  await fireEvent.press(view.getByRole("button", { name: "Flush newer" }));
  await view.findByText("Flush failed");
  // The earlier attempt's first automatic retry is due after one second.
  await new Promise(resolve => setTimeout(resolve, 1150));
  expect(flushWrites).toBe(1);
});

it("drops queued work and ignores old completion status after moving to another draft", async () => {
  const OTHER_DRAFT_ID = "00000000-0000-4000-8000-000000000003";
  const written: Record<string, string> = {};
  let releaseOlder: (() => void) | undefined;
  let releaseCurrent: (() => void) | undefined;
  server.use(http.patch("*/listings/drafts/:id", async ({ request, params }) => {
    const incoming = await request.json() as { description: string };
    const id = String(params.id);
    if (id === DRAFT_ID) {
      await new Promise<void>(resolve => { releaseOlder = resolve; });
    } else {
      await new Promise<void>(resolve => { releaseCurrent = resolve; });
    }
    written[id] = incoming.description;
    return HttpResponse.json({ id, userId: USER_ID, payload: incoming,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
  }));
  const view = await renderMobile(<AutosaveHarness />);
  await fireEvent.press(view.getByRole("button", { name: "Save older" }));
  await vi.waitFor(() => expect(releaseOlder).toBeDefined());
  await fireEvent.press(view.getByRole("button", { name: "Flush newer" }));
  await view.rerender(<AutosaveHarness draftId={OTHER_DRAFT_ID} />);
  await fireEvent.press(view.getByRole("button", { name: "Flush newer" }));
  await vi.waitFor(() => expect(releaseCurrent).toBeDefined());

  releaseOlder?.();
  await view.findByText("Older save settled");
  await view.findByText("Flush failed");
  expect(view.getByText("saving")).toBeTruthy();
  releaseCurrent?.();
  await view.findByText("Flush saved");
  expect(written).toEqual({ [DRAFT_ID]: "Older description", [OTHER_DRAFT_ID]: "Newest description" });
});
