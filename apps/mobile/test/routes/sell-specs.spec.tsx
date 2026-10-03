import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardSchemas } from "@auto-tm/contracts";

import { fireEvent, renderMobile, routeParams } from "../render";
import SellScreen from "../../app/(tabs)/sell";

const fixture = vi.hoisted(() => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  payload: {} as WizardSchemas.WizardDraftPayload,
  save: vi.fn(), forceSave: vi.fn().mockResolvedValue(undefined),
  photos: [] as never[], pending: false,
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@react-navigation/native", async () => ({ NavigationContext: (await import("react")).createContext(null) }));
vi.mock("../../src/api/listings/useMyDrafts", () => ({ useMyDrafts: () => ({
  data: { items: [{ id: fixture.id, payload: fixture.payload }] }, isPending: false,
}) }));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => ({ mutate: vi.fn() }) }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => ({ isPending: fixture.pending }) }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => ({ isPending: false }) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({ useWizardAutosave: () => ({
  save: fixture.save, forceSave: fixture.forceSave, retrySave: vi.fn(), saveStatus: "idle", saveError: null,
}) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/switch", async () => ({ Switch: (await import("react-native")).View }));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step8Review", () => ({ default: () => null }));

beforeEach(() => {
  routeParams.resumeDraftId = fixture.id;
  // The Car step is complete, so the draft resumes at Details and condition.
  fixture.payload = { brandId: fixture.id, modelId: fixture.id, year: 2020, condition: "new" };
  fixture.save.mockClear();
  fixture.forceSave.mockClear();
  fixture.pending = false;
});

// A New draft with a complete Car counts Details as complete (ADR-0080) and
// resumes past it, so the seller returns to Details with Back.
function backToDetails(screen: ReturnType<typeof renderMobile>) {
  expect(screen.getByText("Photos")).toBeTruthy();
  const [back] = screen.getAllByRole("button", { name: "Back" });
  fireEvent.press(back);
  fixture.forceSave.mockClear();
  expect(screen.getByText("Details and condition")).toBeTruthy();
}

const required = "Answer whether the car is damaged or needs repair";

describe("Sell Details footer and resumed New persistence", () => {
  it("pressing Continue after New to Used reveals errors and stays on Details", () => {
    const screen = renderMobile(<SellScreen />);
    backToDetails(screen);
    fireEvent.press(screen.getByRole("button", { name: "Used" }));
    expect(screen.queryByText(required)).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(required)).toBeTruthy();
    expect(screen.getByText("Mileage is required for used cars")).toBeTruthy();
    expect(screen.getByText("Details and condition")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: No", checked: false })).toBeTruthy();
    expect(fixture.forceSave).not.toHaveBeenCalled();
  });

  it.each([undefined, { knownIssuesText: "Paint chip" }])("autosaves and continues a resumed New draft with missing answer %j as false", (disclosure) => {
    fixture.payload.conditionDisclosure = disclosure;
    const screen = renderMobile(<SellScreen />);
    expect(fixture.save).toHaveBeenLastCalledWith(expect.objectContaining({
      conditionDisclosure: { ...disclosure, damaged: false },
    }));
    backToDetails(screen);
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(fixture.forceSave).toHaveBeenLastCalledWith(expect.objectContaining({
      conditionDisclosure: { ...disclosure, damaged: false },
    }));
    expect(screen.queryByText("Details and condition")).toBeNull();
    expect(screen.getByText("Photos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue", disabled: true })).toBeTruthy();
  });

  it("Continue explains untouched invalid Engine power and stays on Details", () => {
    fixture.payload = { ...fixture.payload, condition: "used", mileageKm: 1000,
      conditionDisclosure: { damaged: false }, enginePower: 0 };
    const screen = renderMobile(<SellScreen />);
    expect(screen.getByText("Power")).toBeTruthy();
    expect(screen.queryByText("Engine power must be greater than zero")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Continue", disabled: false }));
    expect(screen.getByText("Engine power must be greater than zero")).toBeTruthy();
    expect(screen.getByText("Details and condition")).toBeTruthy();
    expect(screen.getByDisplayValue("0")).toBeTruthy();
    expect(fixture.forceSave).not.toHaveBeenCalled();
    expect(screen.queryByText(required)).toBeNull();
    expect(screen.queryByText("Mileage is required for used cars")).toBeNull();
  });

  it("preserves and rejects a legacy explicit damaged New answer on Continue", () => {
    fixture.payload.conditionDisclosure = { damaged: true };
    const screen = renderMobile(<SellScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Continue", disabled: false }));
    expect(screen.getByText("A new car can't be damaged. Choose Used.")).toBeTruthy();
    expect(screen.getByText("Details and condition")).toBeTruthy();
    expect(fixture.forceSave).not.toHaveBeenCalled();
    expect(fixture.save).toHaveBeenLastCalledWith(expect.objectContaining({ conditionDisclosure: { damaged: true } }));
  });

  it("keeps a pending discard from enabling the specs footer", () => {
    fixture.pending = true;
    fixture.payload = { ...fixture.payload, condition: "used" };
    const screen = renderMobile(<SellScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Continue", disabled: true }));
    expect(fixture.forceSave).not.toHaveBeenCalled();
    expect(screen.getByText("Details and condition")).toBeTruthy();
  });
});
