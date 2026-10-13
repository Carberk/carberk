import * as RN from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SellScreen from "../../app/(tabs)/sell";
import { act, fireEvent, renderMobile, routeParams, screenFocus, within } from "../render";

import { ToastProvider } from "@/components/ui/toast";

const pressHardwareBack = (RN as unknown as { pressHardwareBack: () => boolean }).pressHardwareBack;

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const newId = "660e8400-e29b-41d4-a716-446655440001";
  return {
    id,
    newId,
    drafts: [] as { id: string; payload: Record<string, unknown> }[],
    discard: vi.fn(),
    deleteDraftDir: vi.fn(),
    queuePhotos: [] as Record<string, unknown>[],
    autosave: {
      save: vi.fn(),
      forceSave: vi.fn(),
      flush: vi.fn(),
      retrySave: vi.fn(),
      discardPending: vi.fn(),
      saveStatus: "saved" as "idle" | "saving" | "saved" | "error",
      saveError: null as string | null,
    },
  };
});

vi.mock("@react-navigation/native", async () => ({ NavigationContext: (await import("react")).createContext(null) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, phone: "+99365000000" }) }));
vi.mock("../../src/api/listings/useMyDrafts", () => ({
  useMyDrafts: () => ({ data: { items: fixture.drafts }, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../src/api/listings/useCreateDraft", () => ({
  useCreateDraft: () => ({
    isPending: false,
    mutate: (_: unknown, options: { onSuccess: (draft: { id: string }) => void }) =>
      options.onSuccess({ id: fixture.newId }),
  }),
}));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({
  useDiscardDraft: () => ({ mutate: vi.fn(), mutateAsync: fixture.discard, isPending: false, error: null }),
}));
vi.mock("../../src/api/listings/usePublishDraft", () => ({
  usePublishDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({ useWizardAutosave: () => fixture.autosave }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({
  // The mocked queue already holds the open draft's photos.
  useUploadQueue: () => ({ photos: fixture.queuePhotos, publishGate: { canPublish: true, blockers: [] }, isReady: true }),
}));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: fixture.deleteDraftDir }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("expo-image", async () => ({ Image: (await import("react-native")).View }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/listings/wizard/Step3VehicleId", async () => {
  const { Pressable, Text } = await import("react-native");
  return {
    default: ({ onChange }: { onChange: (updates: Record<string, unknown>) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onChange({ brandId: fixture.id })}>
        <Text>Change car</Text>
      </Pressable>
    ),
  };
});
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step4Specs", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/CheckAndPublish", () => ({ default: () => null }));

const car = { brandId: fixture.id, modelId: fixture.id, year: 2020 };
const details = { condition: "used", mileageKm: 10000, conditionDisclosure: { damaged: false } };
const photos = { photos: [0, 1, 2].map((index) => ({ photoId: index === 0 ? fixture.id : `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, key: index === 0 ? "photo.jpg" : `support-${index}.jpg`, sortOrder: index })) };

beforeEach(() => {
  fixture.drafts = [];
  fixture.queuePhotos = [];
  fixture.discard.mockReset().mockResolvedValue(undefined);
  fixture.deleteDraftDir.mockReset();
  Object.assign(fixture.autosave, { saveStatus: "saved", saveError: null });
  fixture.autosave.save.mockReset();
  fixture.autosave.forceSave.mockReset().mockResolvedValue(undefined);
  fixture.autosave.flush.mockReset().mockResolvedValue(true);
  fixture.autosave.retrySave.mockReset();
  fixture.autosave.discardPending.mockReset();
});

function renderSell() {
  return renderMobile(
    <ToastProvider>
      <SellScreen />
    </ToastProvider>,
  );
}

/** Taps New listing on an empty Sell tab; the create wizard opens on Car. */
async function openNewListing() {
  const screen = await renderSell();
  await fireEvent.press(screen.getByRole("button", { name: "List a car" }));
  expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
  return screen;
}

function resumeDraft(payload: Record<string, unknown>) {
  fixture.drafts = [{ id: fixture.id, payload }];
  routeParams.resumeDraftId = fixture.id;
  return renderSell();
}

async function pressClose(screen: Awaited<ReturnType<typeof renderSell>>) {
  await act(async () => {
    void fireEvent.press(screen.getByRole("button", { name: "Close" }));
  });
}

const wizardIsOpen = (screen: Awaited<ReturnType<typeof renderSell>>) => screen.queryByRole("button", { name: "Close" }) !== null;

describe("✕ saves the draft and closes the Sell wizard (#585)", () => {
  it("saves the pending change, closes to the Sell tab and shows Saved to Drafts", async () => {
    const screen = await openNewListing();
    await fireEvent.press(screen.getByRole("button", { name: "Change car" }));

    await pressClose(screen);

    expect(fixture.autosave.flush).toHaveBeenCalledTimes(1);
    expect(fixture.autosave.flush).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: fixture.id, currentStep: 1 }),
    );
    expect(wizardIsOpen(screen)).toBe(false);
    expect(screen.getByRole("button", { name: "List a car" })).toBeTruthy();
    expect(screen.getByText("Saved to Drafts")).toBeTruthy();
    expect(fixture.discard).not.toHaveBeenCalled();
  });

  it("shows Saved to Drafts above the tab bar, clear of the Latest draft card at the top", async () => {
    const screen = await openNewListing();
    await fireEvent.press(screen.getByRole("button", { name: "Change car" }));

    await pressClose(screen);

    // The Sell tab has no header for a top toast to clear, so a top toast covered the card.
    expect(screen.queryByTestId("toast-viewport-top")).toBeNull();
    const viewport = screen.getByTestId("toast-viewport-above-tab-bar");
    expect(within(viewport).getByText("Saved to Drafts")).toBeTruthy();
  });

  it.each([
    ["ru", "Сохранено в черновиках"],
    ["tk", "Garalamalara ýazyldy"],
  ] as const)("shows the toast in %s", async (locale, text) => {
    fixture.drafts = [{ id: fixture.id, payload: { ...car, currentStep: 2 } }];
    routeParams.resumeDraftId = fixture.id;
    const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>, { locale });

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Ýap" }));
    });

    expect(screen.getByText(text)).toBeTruthy();
  });

  it("leaves no draft behind for a new Listing the seller never touched, and shows no toast", async () => {
    const screen = await openNewListing();

    await pressClose(screen);

    expect(fixture.discard).toHaveBeenCalledWith(fixture.newId);
    expect(fixture.deleteDraftDir).toHaveBeenCalledWith(`draft-${fixture.newId}`);
    expect(fixture.autosave.flush).not.toHaveBeenCalled();
    expect(fixture.autosave.discardPending).toHaveBeenCalled();
    expect(wizardIsOpen(screen)).toBe(false);
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
  });

  it("does not delete a new Listing once the seller has changed something", async () => {
    const screen = await openNewListing();
    await fireEvent.press(screen.getByRole("button", { name: "Change car" }));

    await pressClose(screen);

    expect(fixture.discard).not.toHaveBeenCalled();
    expect(fixture.deleteDraftDir).not.toHaveBeenCalled();
  });

  it("does not delete a new Listing that has a picked photo still uploading", async () => {
    // The photo has no key yet, so the payload alone still looks untouched.
    fixture.queuePhotos = [{ photoId: fixture.id, state: "uploading", sortOrder: 0, retryCount: 0 }];
    const screen = await openNewListing();

    await pressClose(screen);

    expect(fixture.discard).not.toHaveBeenCalled();
    expect(fixture.deleteDraftDir).not.toHaveBeenCalled();
    expect(fixture.autosave.flush).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saved to Drafts")).toBeTruthy();
  });

  it("waits for the delete before closing, so the five-draft count is right when New listing is tapped again", async () => {
    let finishDelete: () => void = () => {};
    fixture.discard.mockImplementation(() => new Promise<void>((resolve) => { finishDelete = resolve; }));
    const screen = await openNewListing();

    await pressClose(screen);
    expect(wizardIsOpen(screen)).toBe(true);
    expect(screen.getByRole("button", { name: "Close" }).props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => finishDelete());

    expect(wizardIsOpen(screen)).toBe(false);
  });

  it("still closes, without a toast, when deleting the untouched draft fails", async () => {
    fixture.discard.mockRejectedValue(new Error("offline"));
    const screen = await openNewListing();

    await pressClose(screen);

    expect(wizardIsOpen(screen)).toBe(false);
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
  });

  it("keeps an empty draft the seller reopened from the Sell tab instead of deleting it", async () => {
    const screen = await resumeDraft({ currentStep: 1, allowCalls: true, allowChat: true, priceCurrency: "TMT" });

    await pressClose(screen);

    expect(fixture.discard).not.toHaveBeenCalled();
    expect(fixture.autosave.flush).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saved to Drafts")).toBeTruthy();
  });

  it("has no delete or discard action in the create wizard", async () => {
    const screen = await openNewListing();

    expect(screen.queryByText(/discard|delete/i)).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(screen.queryByRole("button", { name: /discard|delete/i })).toBeNull();
  });
});

describe("✕ when the latest changes are not saved (#585)", () => {
  async function openAfterFailedSave() {
    const screen = await openNewListing();
    await fireEvent.press(screen.getByRole("button", { name: "Change car" }));
    Object.assign(fixture.autosave, { saveStatus: "error", saveError: "No internet" });
    await screen.rerender(<ToastProvider><SellScreen /></ToastProvider>);
    await pressClose(screen);
    return screen;
  }

  it("asks first, with Retry, Leave anyway and Keep editing, when the last save failed", async () => {
    const screen = await openAfterFailedSave();

    expect(screen.getByText("Latest changes are not saved")).toBeTruthy();
    expect(screen.getByText("Retry when you are online, or leave and lose the changes on this step.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave anyway" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeTruthy();
    expect(wizardIsOpen(screen)).toBe(true);
    expect(fixture.autosave.flush).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
  });

  it("offers the same dialog in Russian and Turkmen", async () => {
    fixture.drafts = [{ id: fixture.id, payload: { ...car, currentStep: 2 } }];
    routeParams.resumeDraftId = fixture.id;
    Object.assign(fixture.autosave, { saveStatus: "error", saveError: "No internet" });

    const ru = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>, { locale: "ru" });
    await act(async () => { void fireEvent.press(ru.getByRole("button", { name: "Закрыть" })); });
    expect(ru.getByText("Последние изменения не сохранены")).toBeTruthy();
    expect(ru.getByText("Повторите, когда появится сеть, или выйдите: изменения на этом шаге пропадут.")).toBeTruthy();
    expect(ru.getByRole("button", { name: "Повторить" })).toBeTruthy();
    expect(ru.getByRole("button", { name: "Всё равно выйти" })).toBeTruthy();
    expect(ru.getByRole("button", { name: "Продолжить редактирование" })).toBeTruthy();
    await ru.unmount();

    const tk = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>, { locale: "tk" });
    await act(async () => { void fireEvent.press(tk.getByRole("button", { name: "Ýap" })); });
    expect(tk.getByText("Soňky üýtgeşmeler ýatda saklanmady")).toBeTruthy();
    expect(tk.getByText("Tor bar wagty täzeden synanyşyň ýa-da çykyň: bu tapgyrdaky üýtgeşmeler ýitýär.")).toBeTruthy();
    expect(tk.getByRole("button", { name: "Täzeden synanyş" })).toBeTruthy();
    expect(tk.getByRole("button", { name: "Şonda-da çyk" })).toBeTruthy();
    expect(tk.getByRole("button", { name: "Redaktirlemäge dowam et" })).toBeTruthy();
  });

  it("Keep editing closes the dialog and keeps the wizard and the unsaved status", async () => {
    const screen = await openAfterFailedSave();

    await fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByText("Latest changes are not saved")).toBeNull();
    expect(wizardIsOpen(screen)).toBe(true);
    expect(screen.getByRole("button", { name: "Not saved. Retry" })).toBeTruthy();
  });

  it("Leave anyway closes without a toast and leaves the draft as last saved", async () => {
    const screen = await openAfterFailedSave();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Leave anyway" })); });

    expect(wizardIsOpen(screen)).toBe(false);
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
    expect(screen.queryByText("Latest changes are not saved")).toBeNull();
    expect(fixture.discard).not.toHaveBeenCalled();
    expect(fixture.autosave.flush).not.toHaveBeenCalled();
  });

  it("Retry saves again and closes with the toast when it works", async () => {
    const screen = await openAfterFailedSave();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Retry" })); });

    expect(fixture.autosave.flush).toHaveBeenCalledTimes(1);
    expect(wizardIsOpen(screen)).toBe(false);
    expect(screen.getByText("Saved to Drafts")).toBeTruthy();
  });

  it("Retry that fails asks again instead of closing", async () => {
    fixture.autosave.flush.mockResolvedValue(false);
    const screen = await openAfterFailedSave();

    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Retry" })); });

    expect(wizardIsOpen(screen)).toBe(true);
    expect(screen.getByText("Latest changes are not saved")).toBeTruthy();
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
  });

  it("asks when the save made by ✕ itself fails", async () => {
    fixture.autosave.flush.mockResolvedValue(false);
    const screen = await openNewListing();
    await fireEvent.press(screen.getByRole("button", { name: "Change car" }));

    await pressClose(screen);

    expect(fixture.autosave.flush).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Latest changes are not saved")).toBeTruthy();
    expect(wizardIsOpen(screen)).toBe(true);
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
  });

  describe("on a connection that never answers", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("stops waiting for the save after about ten seconds and asks, with ✕ usable again", async () => {
      fixture.autosave.flush.mockReturnValue(new Promise<boolean>(() => {}));
      const screen = await openNewListing();
      await fireEvent.press(screen.getByRole("button", { name: "Change car" }));

      await pressClose(screen);
      await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
      expect(screen.queryByText("Latest changes are not saved")).toBeNull();
      expect(screen.getByRole("button", { name: "Close" }).props.accessibilityState).toMatchObject({ disabled: true });

      await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });

      expect(screen.getByText("Latest changes are not saved")).toBeTruthy();
      expect(wizardIsOpen(screen)).toBe(true);
      expect(screen.queryByText("Saved to Drafts")).toBeNull();
      expect(screen.getByRole("button", { name: "Close" }).props.accessibilityState).not.toMatchObject({ disabled: true });
    });

    it("stops waiting for the delete of an untouched new Listing and closes", async () => {
      fixture.discard.mockReturnValue(new Promise<void>(() => {}));
      const screen = await openNewListing();

      await pressClose(screen);
      await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
      expect(wizardIsOpen(screen)).toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });

      expect(wizardIsOpen(screen)).toBe(false);
      expect(screen.queryByText("Saved to Drafts")).toBeNull();
    });
  });
});

describe("Sell wizard resume and system back (#585)", () => {
  it("opens the step the seller left, and keeps saving that position", async () => {
    const screen = await resumeDraft({ ...car, ...details, ...photos, currentStep: 4 });

    expect(screen.getByRole("header", { name: "Price, Step 4 of 7" })).toBeTruthy();
    // The autosave effect sends the position with the payload.
    expect(fixture.autosave.save).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 4 }));
  });

  it("opens a draft saved before this change at its first incomplete step", async () => {
    const screen = await resumeDraft({ ...car, ...details, ...photos, currentStep: 1 });

    expect(screen.getByRole("header", { name: "Price, Step 4 of 7" })).toBeTruthy();
  });

  it("system back on the first step behaves as ✕", async () => {
    const screen = await resumeDraft({ ...car, currentStep: 1 });
    // Car is complete, so the first incomplete step is Details; system back goes to Car.
    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();
    await act(async () => { pressHardwareBack(); });
    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
    expect(screen.queryByText("Saved to Drafts")).toBeNull();

    let handled = false;
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(true);
    expect(wizardIsOpen(screen)).toBe(false);
    expect(screen.getByText("Saved to Drafts")).toBeTruthy();
  });

  it("system back on a later step goes back one step and does not close the wizard", async () => {
    const screen = await resumeDraft({ ...car, currentStep: 2 });
    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();

    let handled = false;
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(true);
    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
    expect(wizardIsOpen(screen)).toBe(true);
    expect(screen.queryByText("Saved to Drafts")).toBeNull();
  });

  it("saves the step it moves to, not the one it left", async () => {
    const screen = await resumeDraft({ ...car, currentStep: 1 });
    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();
    // The draft opened on Details, and that position is what the autosave sends.
    expect(fixture.autosave.save).toHaveBeenLastCalledWith(expect.objectContaining({ currentStep: 2 }));

    await act(async () => { pressHardwareBack(); });

    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
    expect(fixture.autosave.forceSave).toHaveBeenLastCalledWith(expect.objectContaining({ currentStep: 1 }));
  });

  it("system back with the unsaved dialog open closes the dialog and stays on the step", async () => {
    Object.assign(fixture.autosave, { saveStatus: "error", saveError: "No internet" });
    const screen = await resumeDraft({ ...car, currentStep: 2 });
    await pressClose(screen);
    expect(screen.getByText("Latest changes are not saved")).toBeTruthy();

    let handled = false;
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(true);
    expect(screen.queryByText("Latest changes are not saved")).toBeNull();
    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();
    expect(fixture.autosave.forceSave).not.toHaveBeenCalled();
  });

  it("leaves system back to the screen on top while another screen covers the wizard", async () => {
    const screen = await resumeDraft({ ...car, currentStep: 2 });
    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();

    // A push notification opened a Conversation over the tabs.
    screenFocus.focused = false;
    await screen.rerender(<ToastProvider><SellScreen /></ToastProvider>);
    let handled = true;
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(false);
    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();
    expect(fixture.autosave.flush).not.toHaveBeenCalled();
    expect(fixture.discard).not.toHaveBeenCalled();

    // Back on the Sell tab, system back belongs to the wizard again.
    screenFocus.focused = true;
    await screen.rerender(<ToastProvider><SellScreen /></ToastProvider>);
    await act(async () => { handled = pressHardwareBack(); });

    expect(handled).toBe(true);
    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
  });

  it("leaves system back alone on the Sell tab", async () => {
    await renderSell();

    expect(pressHardwareBack()).toBe(false);
  });
});
