import type { ListingsSchemas } from "@auto-tm/contracts";
import { WizardSchemas } from "@auto-tm/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, routerMock } from "../render";
import SellScreen from "../../app/(tabs)/sell";
import { draftProgress } from "../../src/listings/wizard/draftProgress";

type Draft = ListingsSchemas.ListingDraft;

const fx = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public code: string, public status: number, message?: string) {
      super(message ?? code);
      this.name = "ApiError";
    }
  }
  return {
    ApiError,
    get: vi.fn(),
    post: vi.fn(),
    show: vi.fn(),
    auth: true as boolean | null,
  };
});

vi.mock("../../src/api/client", () => ({
  apiClient: { get: fx.get, post: fx.post, patch: vi.fn(), delete: vi.fn() },
  ApiError: fx.ApiError,
}));
vi.mock("@react-navigation/native", async () => {
  const React = await import("react");
  return {
    NavigationContext: React.createContext(undefined),
    DefaultTheme: { dark: false, colors: {} },
    DarkTheme: { dark: true, colors: {} },
  };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: fx.auth, phone: "" }) }));
vi.mock("../../components/auth/SignInDialog", () => ({ SignInDialog: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: fx.show }) }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: [], publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn() }));
vi.mock("../../src/listings/wizard/useWizardAutosave", () => ({ useWizardAutosave: () => ({
  save: vi.fn(), forceSave: vi.fn(), retrySave: vi.fn(), saveStatus: "idle", saveError: null,
}) }));
vi.mock("../../src/listings/wizard/WizardLayout", async () => {
  const { Text } = await import("react-native");
  return { WizardLayout: ({ routeTitle }: { routeTitle: string }) => <Text>{`wizard:${routeTitle}`}</Text> };
});
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step4Specs", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/CheckAndPublish", () => ({ default: () => null }));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "550e8400-e29b-41d4-a716-446655440001", name: "Toyota" }] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [{ id: "550e8400-e29b-41d4-a716-446655440002", name: "Camry" }] } }) }));

// The draft row counts out of every step the wizard header counts, Check and publish included.
const DATA_STEPS = WizardSchemas.WIZARD_STEPS.length;

// Saved fields that complete Car and Contact only.
const CAR_AND_CONTACT = {
  brandId: "550e8400-e29b-41d4-a716-446655440001",
  modelId: "550e8400-e29b-41d4-a716-446655440002",
  year: 2018,
  contactPhone: "+99361234567",
  allowCalls: true,
  allowChat: true,
};
// Stored step names that disagree with the saved fields; progress must ignore them.
const STALE_STEP_NAMES = ["photos", "price", "location"];

function draft(id: string, overrides: Partial<Draft["payload"]> = {}, updatedAt = "2026-09-28T10:00:00.000Z"): Draft {
  return {
    id, userId: "me", createdAt: "2026-09-20T10:00:00.000Z", updatedAt,
    payload: { ...CAR_AND_CONTACT, validatedSteps: STALE_STEP_NAMES, ...overrides },
  };
}
const NO_CAR = { brandId: undefined, modelId: undefined, year: undefined };
function drafts(count: number): Draft[] {
  return Array.from({ length: count }, (_, i) => draft(`d${i + 1}`));
}

let serverDrafts: Draft[] = [];
async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function renderSell(locale = "en") {
  const view = await renderMobile(<SellScreen />, { locale });
  await settle();
  return view;
}

beforeEach(() => {
  fx.auth = true;
  fx.show.mockClear();
  fx.post.mockReset();
  fx.get.mockReset().mockImplementation((url: string) =>
    url.startsWith("/me/drafts")
      ? Promise.resolve({ items: serverDrafts, nextCursor: null })
      : Promise.reject(new Error(`unexpected GET ${url}`)));
  serverDrafts = [];
});

describe("Sell tab with no drafts", () => {
  it("offers List a car and My listings", async () => {
    const screen = await renderSell();

    expect(screen.getByText("Sell your car")).toBeTruthy();
    expect(screen.getByText("Add the car, photos, a price and a contact phone. Buyers call or message you.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "List a car" })).toBeTruthy();
    expect(screen.queryByText("Latest draft")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "My listings" }));
    expect(routerMock.push).toHaveBeenCalledWith("/listings/manage");
  });

  it.each([
    ["ru", "Продайте автомобиль", "Укажите автомобиль, фото, цену и контактный телефон. Покупатели позвонят или напишут.", "Разместить объявление", "Мои объявления"],
    ["tk", "Awtoulagyňyzy satyň", "Awtoulagy, suratlary, bahany we habarlaşmak üçin telefony görkeziň. Alyjylar jaň eder ýa-da ýazar.", "Bildiriş goý", "Bildirişlerim"],
  ])("is localized in %s", async (locale, title, body, cta, row) => {
    const screen = await renderSell(locale);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.getByRole("button", { name: cta })).toBeTruthy();
    expect(screen.getByRole("button", { name: row })).toBeTruthy();
  });

  it("creates a draft from List a car", async () => {
    fx.post.mockResolvedValue(draft("new", {}));
    const screen = await renderSell();

    await fireEvent.press(screen.getByRole("button", { name: "List a car" }));
    await settle();

    expect(fx.post).toHaveBeenCalledWith("/listings/drafts", {}, expect.anything());
    expect(screen.getByText(/^wizard:/)).toBeTruthy();
  });
});

describe("Sell tab with drafts", () => {
  it("shows the latest draft as one row with Continue, New listing and My listings", async () => {
    serverDrafts = [draft("d1")];
    const screen = await renderSell();

    expect(screen.getByText("Latest draft")).toBeTruthy();
    const row = screen.getByLabelText(new RegExp(`^Toyota Camry, 2018, 2 of ${DATA_STEPS} steps filled · Updated `));
    expect(row).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New listing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My listings" })).toBeTruthy();
    expect(screen.queryByText("All drafts")).toBeNull();
  });

  it("counts the steps the Drafts card counts, from the saved fields", async () => {
    const saved = draft("d1");
    serverDrafts = [saved];
    const { filled, total } = draftProgress(saved.payload);
    expect({ filled, total }).toEqual({ filled: 2, total: DATA_STEPS });
    const screen = await renderSell();

    expect(screen.getByLabelText(new RegExp(`, ${filled} of ${total} steps filled · Updated `))).toBeTruthy();
    expect(screen.queryByLabelText(new RegExp(`, ${STALE_STEP_NAMES.length} of ${total} steps filled`))).toBeNull();
  });

  it("names a draft without a car", async () => {
    serverDrafts = [draft("d1", { ...NO_CAR, allowCalls: false, allowChat: false })];
    const screen = await renderSell();

    expect(screen.getByLabelText(new RegExp(`^Draft without a car yet, 0 of ${DATA_STEPS} steps filled`))).toBeTruthy();
  });

  it("is localized in RU and TK", async () => {
    serverDrafts = [draft("d1", NO_CAR), draft("d2")];
    const ru = await renderSell("ru");
    expect(ru.getByLabelText(new RegExp(`^Черновик без автомобиля, Заполнено шагов: 1 из ${DATA_STEPS} · Обновлено `))).toBeTruthy();
    expect(ru.getByRole("button", { name: /^Все черновики/ })).toBeTruthy();
    await ru.unmount();

    const tk = await renderSell("tk");
    expect(tk.getByLabelText(new RegExp(`^Awtoulagsyz garalama, ${DATA_STEPS} tapgyrdan 1 sanysy doldurylan · Täzelendi: `))).toBeTruthy();
    expect(tk.getByRole("button", { name: /^Ähli garalamalar/ })).toBeTruthy();
  });

  it("continues the latest draft", async () => {
    serverDrafts = [draft("d1")];
    const screen = await renderSell();

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText(/^wizard:/)).toBeTruthy();
  });

  it("shows All drafts with the count from two drafts and opens My listings on Drafts", async () => {
    serverDrafts = drafts(3);
    const screen = await renderSell();

    const allDrafts = screen.getByRole("button", { name: "All drafts, 3" });
    await fireEvent.press(allDrafts);
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/listings/manage", params: { tab: "drafts" } });

    await fireEvent.press(screen.getByRole("button", { name: "My listings" }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/listings/manage");
  });

  it("creates a new draft below the limit", async () => {
    serverDrafts = drafts(4);
    fx.post.mockResolvedValue(draft("new", {}));
    const screen = await renderSell();

    await fireEvent.press(screen.getByRole("button", { name: "New listing" }));
    await settle();

    expect(fx.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("You have 5 drafts")).toBeNull();
  });
});

describe("five-draft limit", () => {
  it("opens the limit sheet instead of creating a sixth draft", async () => {
    serverDrafts = drafts(5);
    const screen = await renderSell();
    expect(screen.queryByText("You have 5 drafts")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "New listing" }));

    expect(fx.post).not.toHaveBeenCalled();
    expect(screen.getByText("You have 5 drafts")).toBeTruthy();
    expect(screen.getByText("Finish or delete one to start a new listing.")).toBeTruthy();
  });

  it("reads the sheet title before its buttons", async () => {
    serverDrafts = drafts(5);
    const screen = await renderSell();
    await fireEvent.press(screen.getByRole("button", { name: "New listing" }));

    const order = screen.getAllByText(/You have 5 drafts|Open drafts|^Cancel$/).map((node) => node.props.children);
    expect(order).toEqual(["You have 5 drafts", "Open drafts", "Cancel"]);
  });

  it("opens My listings on Drafts from the sheet, and Cancel closes it", async () => {
    serverDrafts = drafts(5);
    const screen = await renderSell();

    await fireEvent.press(screen.getByRole("button", { name: "New listing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("You have 5 drafts")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "New listing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Open drafts" }));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/listings/manage", params: { tab: "drafts" } });
    expect(screen.queryByText("You have 5 drafts")).toBeNull();
  });

  it("shows the same sheet when the API refuses with DRAFT_LIMIT_REACHED", async () => {
    serverDrafts = drafts(2);
    fx.post.mockRejectedValue(new fx.ApiError("DRAFT_LIMIT_REACHED", 409, "A User can keep at most 5 drafts"));
    const screen = await renderSell();

    await fireEvent.press(screen.getByRole("button", { name: "New listing" }));
    await settle();

    expect(screen.getByText("You have 5 drafts")).toBeTruthy();
    expect(fx.show).not.toHaveBeenCalled();
  });

  it.each([
    ["ru", "У вас 5 черновиков", "Завершите или удалите один, чтобы начать новое объявление.", "Открыть черновики", "Отмена"],
    ["tk", "Sizde 5 garalama bar", "Täze bildiriş başlamak üçin birini tamamlaň ýa-da pozuň.", "Garalamalary aç", "Ýatyr"],
  ])("is localized in %s", async (locale, title, body, open, cancel) => {
    serverDrafts = drafts(5);
    const screen = await renderSell(locale);
    await fireEvent.press(screen.getByRole("button", { name: locale === "ru" ? "Новое объявление" : "Täze bildiriş" }));

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.getByRole("button", { name: open })).toBeTruthy();
    expect(screen.getByRole("button", { name: cancel })).toBeTruthy();
  });
});

describe("loading and errors", () => {
  it("shows a skeleton while drafts load", async () => {
    fx.get.mockReturnValue(new Promise(() => {}));
    const screen = await renderSell();

    expect(screen.getByTestId("sell-entry-skeleton")).toBeTruthy();
    expect(screen.queryByText("Sell your car")).toBeNull();
    expect(screen.queryByText("Latest draft")).toBeNull();
  });

  it("shows the shared error state and retries", async () => {
    fx.get.mockRejectedValueOnce(new fx.ApiError("NETWORK_ERROR", 0));
    const screen = await renderSell();

    expect(screen.getByText("No internet connection. Try again when you are online.")).toBeTruthy();
    expect(screen.queryByText("Sell your car")).toBeNull();
    serverDrafts = [draft("d1")];
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await settle();

    expect(screen.getByText("Latest draft")).toBeTruthy();
  });
});
