import { StyleSheet } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SellScreen from "../../app/(tabs)/sell";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

import { ToastProvider } from "@/components/ui/toast";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const photos = [{ photoId: id, key: "photo.jpg", sortOrder: 0, state: "uploaded" }];
  return {
    id, photos, publish: vi.fn(), forceSave: vi.fn(), save: vi.fn(),
    drafts: { items: [{ id, payload: {
      currentStep: 8, validatedSteps: ["vin", "photos", "vehicle", "specs", "price", "location", "contact"],
      photos, brandId: id, modelId: id, year: 2020, condition: "used", mileageKm: 10000,
      conditionDisclosure: { damaged: false }, priceAmount: 100000, priceCurrency: "TMT",
      regionId: id, cityId: id, description: "Great car", contactPhone: "+99361234567",
      allowCalls: true, allowChat: true,
    } }] },
  };
});
vi.mock("@react-navigation/native", async () => ({ NavigationContext: (await import("react")).createContext(null) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("../../src/api/listings/useMyDrafts", () => ({ useMyDrafts: () => ({ data: fixture.drafts }) }));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => ({ mutate: vi.fn() }) }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => ({ mutate: vi.fn() }) }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => ({ mutateAsync: fixture.publish }) }));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({ useWizardAutosave: () => ({
  save: fixture.save, forceSave: fixture.forceSave, retrySave: vi.fn(), saveStatus: "saved", saveError: null,
}) }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/listings/wizard/Step1Vin", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step4Specs", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step8Review", () => ({ default: () => null }));

beforeEach(() => {
  routeParams.resumeDraftId = fixture.id;
  fixture.publish.mockReset().mockRejectedValue(new Error("Publish failed"));
  fixture.forceSave.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

function renderWizard() {
  const screen = renderMobile(<ToastProvider><SellScreen /></ToastProvider>);
  let header = screen.getByText("Check and publish").parent;
  while (header && !header.props.className?.includes("border-b")) header = header.parent;
  if (!header) throw new Error("Wizard header missing");
  const measuredHeader = header;
  const measure = (height: number) => fireEvent(measuredHeader, "layout", {
    nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } },
  });
  const top = () => StyleSheet.flatten(screen.getByTestId("toast-viewport-top").props.style).top;
  return { screen, measure, top };
}

describe("Sell publish toast header boundary", () => {
  it("places a publish failure below the measured multirow header and keeps the wizard open", async () => {
    const { screen, measure, top } = renderWizard();
    measure(146);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Publish" })); });
    expect(screen.getByText("Publish failed")).toBeTruthy();
    expect(screen.getByText("Check and publish")).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(top()).toBe(59 + 146 + 8);
  });

  it("follows header reflow while the failure is visible without restarting its timer", async () => {
    vi.useFakeTimers();
    const { screen, measure, top } = renderWizard();
    measure(146);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Publish" })); });
    act(() => vi.advanceTimersByTime(2000));
    // A new native layout event covers wrapped text / larger font metrics, not a guessed height.
    measure(236);
    expect(top()).toBe(59 + 236 + 8);
    act(() => vi.advanceTimersByTime(1001));
    expect(screen.queryByText("Publish failed")).toBeNull();
  });

  it("uses the latest measurement when the header changes during a pending publish", async () => {
    let rejectPublish!: (error: Error) => void;
    fixture.publish.mockImplementation(() => new Promise((_, reject) => { rejectPublish = reject; }));
    const { screen, measure, top } = renderWizard();
    measure(146);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Publish" })); });
    measure(236);
    await act(async () => rejectPublish(new Error("Publish failed")));
    expect(top()).toBe(59 + 236 + 8);
  });

  it("uses ordinary clearance for the success toast on the destination screen", async () => {
    fixture.publish.mockResolvedValue({ id: fixture.id });
    const { screen, measure, top } = renderWizard();
    measure(236);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Publish" })); });
    expect(routerMock.replace).toHaveBeenCalledWith(`/(public)/listings/${fixture.id}`);
    expect(top()).toBe(59 + 64 + 8);
  });
});
