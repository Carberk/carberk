import { describe, it, expect, vi, beforeEach } from "vitest";

import { fireEvent, renderMobile, routeParams } from "../render";
import SellScreen from "../../app/(tabs)/sell";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const car = { brandId: id, modelId: id, year: 2020 };
  const details = { condition: "used", mileageKm: 10000, conditionDisclosure: { damaged: false } };
  const photos = { photos: [{ photoId: id, key: "photo.jpg", sortOrder: 0 }] };
  const price = { priceAmount: 100000, priceCurrency: "TMT" };
  const place = { description: "One owner", regionId: id, cityId: id };
  const contact = { contactPhone: "+99365000000", allowCalls: true, allowChat: true };
  return {
    id,
    payloads: {
      empty: {},
      atPlace: { ...car, ...details, ...photos, ...price },
      complete: { ...car, ...details, ...photos, ...price, ...place, ...contact },
    } as Record<string, Record<string, unknown>>,
    payload: {} as Record<string, unknown>,
    mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null },
  };
});
vi.mock("@react-navigation/native", async () => ({
  NavigationContext: (await import("react")).createContext(undefined),
}));
vi.mock("../../src/api/listings/useMyDrafts", () => ({
  useMyDrafts: () => ({
    data: { items: [{ id: fixture.id, payload: fixture.payload }] },
    isPending: false,
  }),
}));
vi.mock("../../src/api/listings/useCreateDraft", () => ({ useCreateDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/usePublishDraft", () => ({ usePublishDraft: () => fixture.mutation }));
vi.mock("../../src/api/listings/useDiscardDraft", () => ({ useDiscardDraft: () => fixture.mutation }));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({
  useWizardAutosave: () => ({
    save: vi.fn(), forceSave: vi.fn().mockResolvedValue(undefined), retrySave: vi.fn(),
    saveStatus: "idle", saveError: null,
  }),
}));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: [], publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, phone: "+99365000000" }) }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return {
    PlusCircle: Icon, List: Icon, Check: Icon, AlertCircle: Icon, Eye: Icon, ListChecks: Icon, X: Icon,
    ChevronLeft: Icon, RefreshCw: Icon, ChevronDown: Icon, ChevronRight: Icon, Lock: Icon,
    MapPin: Icon, Phone: Icon, MessageSquare: Icon,
  };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("expo-image", async () => ({ Image: (await import("react-native")).View }));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useGenerations", () => ({ useGenerations: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

function resume(payload: keyof typeof fixture.payloads) {
  fixture.payload = fixture.payloads[payload] ?? {};
  routeParams.resumeDraftId = fixture.id;
}

beforeEach(() => {
  fixture.payload = {};
});

describe("Sell wizard", () => {
  it("opens an empty draft on Car with no Skip action", () => {
    resume("empty");
    const screen = renderMobile(<SellScreen />);

    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
    expect(screen.getByLabelText("VIN")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
    expect(screen.queryByText(/skip/i)).toBeNull();
  });

  it("opens Description and place without errors and shows Description's once the seller leaves it empty", () => {
    resume("atPlace");
    const screen = renderMobile(<SellScreen />);

    expect(screen.getByRole("header", { name: "Description and place, Step 5 of 7" })).toBeTruthy();
    expect(screen.queryByText("Description is required")).toBeNull();
    expect(screen.queryByText("Region is required")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" }).props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent(screen.getByLabelText("Description"), "blur");

    expect(screen.getByText("Description is required")).toBeTruthy();
  });

  const titles = {
    ru: {
      header: "Проверка и публикация, Шаг 7 из 7",
      sections: ["Автомобиль", "Характеристики и состояние", "Фото", "Цена", "Описание и место осмотра", "Контакты"],
    },
    tk: {
      header: "Barlag we neşir, Tapgyr 7/7",
      sections: ["Awtomobil", "Aýratynlyklar we ýagdaýy", "Suratlar", "Bahasy", "Düşündiriş we ýerleşýän ýeri", "Habarlaşmak"],
    },
  } as const;

  it.each(["ru", "tk"] as const)("titles the seven steps in %s", (locale) => {
    resume("complete");
    const screen = renderMobile(<SellScreen />, { locale });

    expect(screen.getByRole("header", { name: titles[locale].header })).toBeTruthy();
    const json = JSON.stringify(screen.toJSON());
    const positions = titles[locale].sections.map((title) => json.indexOf(`"${title}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
