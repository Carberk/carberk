import type { ListingsSchemas } from "@auto-tm/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, act, fireEvent, routeParams, routerMock, within } from "../../test/render";
import ManageListingsScreen from "../../app/listings/manage";

import { ToastProvider } from "@/components/ui/toast";

type Summary = ListingsSchemas.ListingSummary;
type Draft = ListingsSchemas.ListingDraft;
type Counts = ListingsSchemas.MyListingCountsResponse;

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const state = vi.hoisted(() => ({ auth: true as boolean | null }));
vi.mock("../api/client", () => ({
  apiClient: { get: api.get, post: api.post, delete: api.delete, patch: vi.fn() },
  ApiError: class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } },
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.auth, phone: "" }) }));
vi.mock("../auth/useViewer", () => ({ useViewer: () => (state.auth ? { userId: "me" } : null) }));
vi.mock("./feed/useFeedCatalogMaps", () => ({ useFeedCatalogMaps: () => ({
  brandName: () => "Toyota", brandLogoUrl: () => undefined, cityName: () => "Ashgabat",
  modelName: (id: string) => ({ camry: "Camry", prado: "Prado", rav4: "RAV4", altima: "Altima", corolla: "Corolla" })[id],
}) }));
// The Progress primitive ships an extensionless import Node cannot resolve; the bar is decoration here.
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
// The sign-in Dialog primitive cannot load in Node either; the shell models only visibility.
vi.mock("@/components/ui/dialog", async () => {
  const shell = await import("../../test/native-overlays");
  return { Dialog: shell.Overlay, DialogContent: shell.Container, DialogHeader: shell.Container,
    DialogTitle: shell.TextContainer, DialogDescription: shell.TextContainer };
});
vi.mock("../api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [{ id: "lexus", name: "Lexus" }] } }) }));
vi.mock("../api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [{ id: "rx", name: "RX" }] } }) }));

function listing(id: string, modelId: string, status: Summary["status"]): Summary {
  return {
    id, sellerId: "me", status, brandId: "toyota", modelId, year: 2018, priceAmount: 1, priceCurrency: "TMT",
    displayPriceTmt: 100000, photoKeys: [], photoCount: 0, cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z",
  };
}
function draft(id: string): Draft {
  return {
    id, userId: "me", createdAt: "2026-09-29T04:00:00.000Z", updatedAt: "2026-09-30T04:00:00.000Z",
    // Only Contact is complete in the saved fields; the stored step number must not show.
    payload: { brandId: "lexus", modelId: "rx", year: 2012, currentStep: 3, contactPhone: "+99361234567", allowCalls: true, allowChat: true },
  } as Draft;
}

/** The API's view of the User's Listings and drafts; actions change it as the server would. */
let server: { listings: Summary[]; drafts: Draft[] };
let failCounts = false;
function counts(): Counts {
  const by = (status: Summary["status"]) => server.listings.filter((l) => l.status === status).length;
  const result = { active: by("active"), sold: by("sold"), archived: by("archived"), banned: by("banned"), drafts: server.drafts.length };
  return { ...result, total: server.listings.length + server.drafts.length };
}
function serve(url: string) {
  if (url === "/me/listings/counts") return failCounts ? Promise.reject(new Error("offline")) : Promise.resolve(counts());
  if (url.startsWith("/me/listings?")) return Promise.resolve({ items: server.listings, nextCursor: null });
  if (url.startsWith("/me/drafts?")) return Promise.resolve({ items: server.drafts, nextCursor: null });
  return Promise.reject(new Error(`Unexpected GET ${url}`));
}
function setStatus(id: string, status: Summary["status"]) {
  server.listings = server.listings.map((l) => (l.id === id ? { ...l, status } : l));
}
function postAction(url: string) {
  const [, , id, action] = url.split("/");
  if (!id) throw new Error(url);
  if (action === "sold") setStatus(id, "sold");
  if (action === "archive") setStatus(id, "archived");
  if (action === "republish") setStatus(id, "active");
  return Promise.resolve({ id, status: "ok", publishedAt: "2026-10-01T00:00:00.000Z" });
}
function deleteAction(url: string) {
  if (url.startsWith("/listings/drafts/")) {
    const id = url.split("/")[3];
    server.drafts = server.drafts.filter((d) => d.id !== id);
  } else {
    const id = url.split("/")[2];
    server.listings = server.listings.filter((l) => l.id !== id);
  }
  return Promise.resolve({ success: true });
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function renderScreen({ locale = "en" } = {}) {
  const view = renderMobile(<ToastProvider><ManageListingsScreen /></ToastProvider>, { locale });
  await settle();
  return view;
}
type View = Awaited<ReturnType<typeof renderScreen>>;
const tab = (view: View, name: RegExp) => view.getByRole("tab", { name });
async function openTab(view: View, name: RegExp) {
  fireEvent.press(tab(view, name));
  await settle();
}
async function openActions(view: View, title: string) {
  fireEvent.press(view.getByRole("button", { name: `Actions for ${title}` }));
  await settle();
}
const sheetActions = (view: View) =>
  within(view.getByTestId("listing-actions-sheet")).getAllByRole("button").map((node) => node.props.accessibilityLabel as string);

beforeEach(() => {
  state.auth = true;
  failCounts = false;
  server = {
    listings: [
      listing("camry-1", "camry", "active"),
      listing("altima-1", "altima", "banned"),
      listing("prado-1", "prado", "sold"),
      listing("rav4-1", "rav4", "archived"),
    ],
    drafts: [draft("draft-1")],
  };
  api.get.mockReset().mockImplementation(serve);
  api.post.mockReset().mockImplementation(postAction);
  api.delete.mockReset().mockImplementation(deleteAction);
});

describe("My listings tabs", () => {
  it("shows Active, Drafts and Archive with their counts, Active selected", async () => {
    const view = await renderScreen();
    expect(view.getAllByRole("tab").map((node) => node.props.accessibilityLabel)).toEqual(["Active, 2", "Drafts, 1", "Archive, 2"]);
    expect(tab(view, /^Active/).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(tab(view, /^Archive/).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it("reads the tab names in Russian and Turkmen", async () => {
    const ru = await renderScreen({ locale: "ru" });
    expect(ru.getAllByRole("tab").map((node) => node.props.accessibilityLabel)).toEqual(["Активные, 2", "Черновики, 1", "Архив, 2"]);
    ru.unmount();
    const tk = await renderScreen({ locale: "tk" });
    expect(tk.getAllByRole("tab").map((node) => node.props.accessibilityLabel)).toEqual(["Işjeň, 2", "Garalamalar, 1", "Arhiw, 2"]);
  });

  it("shows no number at zero or when the counts fail", async () => {
    server.drafts = [];
    const view = await renderScreen();
    expect(tab(view, /^Drafts/).props.accessibilityLabel).toBe("Drafts");
    view.unmount();
    failCounts = true;
    const failed = await renderScreen();
    expect(failed.getAllByRole("tab").map((node) => node.props.accessibilityLabel)).toEqual(["Active", "Drafts", "Archive"]);
  });

  it("shows no number while the counts load", async () => {
    api.get.mockImplementation((url: string) => (url === "/me/listings/counts" ? new Promise(() => {}) : serve(url)));
    const view = await renderScreen();
    expect(view.getAllByRole("tab").map((node) => node.props.accessibilityLabel)).toEqual(["Active", "Drafts", "Archive"]);
  });

  it("opens on the tab named in the route", async () => {
    routeParams.tab = "archive";
    const view = await renderScreen();
    expect(tab(view, /^Archive/).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.getByText("2018 Toyota Prado")).toBeTruthy();
  });
});

describe("My listings rows", () => {
  it("lists active and blocked Listings in Active; the blocked one has a label, a note and no actions", async () => {
    const view = await renderScreen();
    expect(view.getByText("2018 Toyota Camry")).toBeTruthy();
    expect(view.getByText("2018 Toyota Altima")).toBeTruthy();
    expect(view.queryByText("2018 Toyota Prado")).toBeNull();
    expect(view.getByText("Blocked")).toBeTruthy();
    expect(view.getByText("Blocked by moderation. Buyers do not see it.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Actions for 2018 Toyota Altima" })).toBeNull();
    fireEvent.press(view.getByText("2018 Toyota Altima"));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("shows the blocked copy in Russian and Turkmen", async () => {
    const ru = await renderScreen({ locale: "ru" });
    expect(ru.getByText("Заблокировано")).toBeTruthy();
    expect(ru.getByText("Заблокировано модерацией. Покупатели его не видят.")).toBeTruthy();
    ru.unmount();
    const tk = await renderScreen({ locale: "tk" });
    expect(tk.getByText("Petiklenen")).toBeTruthy();
    expect(tk.getByText("Moderasiýa tarapyndan petiklenen. Alyjylar ony görmeýär.")).toBeTruthy();
  });

  it("lists sold and removed Listings in Archive with their labels, and opens one in owner view", async () => {
    const view = await renderScreen();
    await openTab(view, /^Archive/);
    expect(view.getByText("Sold")).toBeTruthy();
    expect(view.getByText("Removed from sale")).toBeTruthy();
    expect(view.queryByText("2018 Toyota Camry")).toBeNull();
    fireEvent.press(view.getByText("2018 Toyota Prado"));
    expect(routerMock.push).toHaveBeenCalledWith("/(public)/listings/prado-1");
  });

  it("labels Archive rows in Russian and Turkmen", async () => {
    routeParams.tab = "archive";
    const ru = await renderScreen({ locale: "ru" });
    expect(ru.getByText("Продано")).toBeTruthy();
    expect(ru.getByText("Снято с продажи")).toBeTruthy();
    ru.unmount();
    const tk = await renderScreen({ locale: "tk" });
    expect(tk.getByText("Satyldy")).toBeTruthy();
    expect(tk.getByText("Satuwdan aýryldy")).toBeTruthy();
  });

  it("loads further pages before saying a tab is empty", async () => {
    server.listings = [listing("camry-1", "camry", "active"), listing("prado-1", "prado", "sold")];
    api.get.mockImplementation((url: string) => {
      if (!url.startsWith("/me/listings?")) return serve(url);
      return url.includes("cursor=page-2")
        ? Promise.resolve({ items: [server.listings[1]], nextCursor: null })
        : Promise.resolve({ items: [server.listings[0]], nextCursor: "page-2" });
    });
    routeParams.tab = "archive";
    const view = await renderScreen();
    expect(view.queryByText("Archive is empty")).toBeNull();
    expect(view.getByText("2018 Toyota Prado")).toBeTruthy();
  });

  it("resumes the wizard from a draft row", async () => {
    const view = await renderScreen();
    await openTab(view, /^Drafts/);
    fireEvent.press(view.getByText("2012 Lexus RX"));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(tabs)/sell", params: { resumeDraftId: "draft-1" } });
  });

  it("shows a draft row's progress as steps filled, from the saved fields", async () => {
    const view = await renderScreen();
    await openTab(view, /^Drafts/);
    expect(view.getByText("1 of 6 steps filled")).toBeTruthy();
    expect(view.getByText("17%")).toBeTruthy();
    expect(view.queryByText("Step 3 of 7")).toBeNull();
  });
});

describe("My listings action sheet", () => {
  it("offers Edit, Mark as sold, Remove from sale and Delete for an active Listing", async () => {
    const view = await renderScreen();
    await openActions(view, "2018 Toyota Camry");
    expect(sheetActions(view)).toEqual(["Edit", "Mark as sold", "Remove from sale", "Delete"]);
    fireEvent.press(view.getByRole("button", { name: "Edit" }));
    expect(routerMock.push).toHaveBeenCalledWith("/listings/camry-1/edit");
    expect(view.queryByTestId("listing-actions-sheet")).toBeNull();
  });

  it("offers Relist, Edit and Delete for a removed Listing, and only Delete for a sold one", async () => {
    const view = await renderScreen();
    await openTab(view, /^Archive/);
    await openActions(view, "2018 Toyota RAV4");
    expect(sheetActions(view)).toEqual(["Relist", "Edit", "Delete"]);
    fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    await openActions(view, "2018 Toyota Prado");
    expect(sheetActions(view)).toEqual(["Delete"]);
  });

  it("offers Continue and Delete draft for a draft; Continue resumes it", async () => {
    const view = await renderScreen();
    await openTab(view, /^Drafts/);
    await openActions(view, "2012 Lexus RX");
    expect(sheetActions(view)).toEqual(["Continue", "Delete draft"]);
    fireEvent.press(view.getByRole("button", { name: "Continue" }));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(tabs)/sell", params: { resumeDraftId: "draft-1" } });
  });

  it("names the actions in Russian and Turkmen", async () => {
    const ru = await renderScreen({ locale: "ru" });
    fireEvent.press(ru.getByRole("button", { name: "Действия: 2018 Toyota Camry" }));
    await settle();
    expect(sheetActions(ru)).toEqual(["Изменить", "Отметить проданным", "Снять с продажи", "Удалить"]);
    ru.unmount();
    routeParams.tab = "drafts";
    const tk = await renderScreen({ locale: "tk" });
    fireEvent.press(tk.getByRole("button", { name: "Hereketler: 2012 Lexus RX" }));
    await settle();
    expect(sheetActions(tk)).toEqual(["Dowam et", "Garalamany poz"]);
  });

  it("asks before Mark as sold, then moves the row to Archive, updates the counts and confirms", async () => {
    const view = await renderScreen();
    await openActions(view, "2018 Toyota Camry");
    fireEvent.press(view.getByRole("button", { name: "Mark as sold" }));
    await settle();
    expect(view.getByText("Mark as sold?")).toBeTruthy();
    expect(view.getByText("Buyers will see it as Sold. A sold Listing cannot be put back on sale.")).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole("button", { name: "Confirm" }));
    await settle();
    expect(api.post).toHaveBeenCalledWith("/listings/camry-1/sold", {}, expect.anything());
    expect(view.getByText("Marked as sold")).toBeTruthy();
    expect(view.queryByText("2018 Toyota Camry")).toBeNull();
    expect(view.getAllByRole("tab").map((node) => node.props.accessibilityLabel)).toEqual(["Active, 1", "Drafts, 1", "Archive, 3"]);
  });

  it.each([
    ["Remove from sale", "Remove from sale?", "Buyers stop seeing it. You can relist it later from Archive.", "Removed from sale", "/listings/camry-1/archive"],
    ["Delete", "Delete listing?", "This will permanently remove your listing. Photos and data cannot be recovered.", "Listing deleted", "/listings/camry-1"],
  ])("asks before %s on an active Listing and confirms it", async (action, title, body, toast, url) => {
    const view = await renderScreen();
    await openActions(view, "2018 Toyota Camry");
    fireEvent.press(view.getByRole("button", { name: action }));
    await settle();
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(body)).toBeTruthy();
    fireEvent.press(view.getByTestId("confirm-action"));
    await settle();
    expect([...api.post.mock.calls, ...api.delete.mock.calls].map((call) => call[0])).toEqual([url]);
    expect(view.getByText(toast)).toBeTruthy();
    expect(view.queryByText("2018 Toyota Camry")).toBeNull();
  });

  it("asks before Relist and puts the Listing back in Active", async () => {
    const view = await renderScreen();
    await openTab(view, /^Archive/);
    await openActions(view, "2018 Toyota RAV4");
    fireEvent.press(view.getByRole("button", { name: "Relist" }));
    await settle();
    expect(view.getByText("Relist?")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Confirm" }));
    await settle();
    expect(api.post).toHaveBeenCalledWith("/listings/rav4-1/republish", {}, expect.anything());
    expect(view.getByText("Back on sale")).toBeTruthy();
    expect(view.queryByText("2018 Toyota RAV4")).toBeNull();
    expect(tab(view, /^Active/).props.accessibilityLabel).toBe("Active, 3");
  });

  it("asks before Delete draft, deletes it and updates the count", async () => {
    const view = await renderScreen();
    await openTab(view, /^Drafts/);
    await openActions(view, "2012 Lexus RX");
    fireEvent.press(view.getByRole("button", { name: "Delete draft" }));
    await settle();
    expect(view.getByText("Delete draft?")).toBeTruthy();
    expect(view.getByText("Your draft and photos will be deleted. This cannot be undone.")).toBeTruthy();
    fireEvent.press(view.getByTestId("confirm-action"));
    await settle();
    expect(api.delete).toHaveBeenCalledWith("/listings/drafts/draft-1");
    expect(view.getByText("Draft deleted")).toBeTruthy();
    expect(view.getByText("No drafts")).toBeTruthy();
    expect(tab(view, /^Drafts/).props.accessibilityLabel).toBe("Drafts");
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const view = await renderScreen();
    await openActions(view, "2018 Toyota Camry");
    fireEvent.press(view.getByRole("button", { name: "Mark as sold" }));
    await settle();
    fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(view.queryByText("Mark as sold?")).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(view.getByText("2018 Toyota Camry")).toBeTruthy();
  });

  it("keeps the row and says so when an action fails", async () => {
    api.post.mockRejectedValue(new Error("offline"));
    const view = await renderScreen();
    await openActions(view, "2018 Toyota Camry");
    fireEvent.press(view.getByRole("button", { name: "Mark as sold" }));
    await settle();
    fireEvent.press(view.getByRole("button", { name: "Confirm" }));
    await settle();
    expect(view.getByText("Action failed. Try again.")).toBeTruthy();
    expect(view.getByText("2018 Toyota Camry")).toBeTruthy();
    expect(view.queryByText("Mark as sold?")).toBeNull();
  });

  it("says the failure in Russian and Turkmen", async () => {
    api.delete.mockRejectedValue(new Error("offline"));
    for (const [locale, title, button, message] of [
      ["ru", "Действия: 2018 Toyota Camry", "Удалить", "Действие не выполнено. Попробуйте снова."],
      ["tk", "Hereketler: 2018 Toyota Camry", "Poz", "Hereket başa barmady. Täzeden synanyşyň."],
    ] as const) {
      const view = await renderScreen({ locale });
      fireEvent.press(view.getByRole("button", { name: title }));
      await settle();
      fireEvent.press(within(view.getByTestId("listing-actions-sheet")).getByRole("button", { name: button }));
      await settle();
      fireEvent.press(view.getByTestId("confirm-action"));
      await settle();
      expect(view.getByText(message)).toBeTruthy();
      view.unmount();
    }
  });
});

describe("My listings states", () => {
  it("shows a skeleton while the Listings load", async () => {
    api.get.mockImplementation((url: string) => (url.startsWith("/me/listings?") ? new Promise(() => {}) : serve(url)));
    const view = await renderScreen();
    expect(view.getByTestId("my-listings-skeleton")).toBeTruthy();
    expect(view.queryByText("2018 Toyota Camry")).toBeNull();
  });

  it("shows the error state with Retry, and Retry loads the Listings", async () => {
    api.get.mockImplementation((url: string) => (url.startsWith("/me/listings?") ? Promise.reject(new Error("offline")) : serve(url)));
    const view = await renderScreen();
    expect(view.getByText("Something went wrong")).toBeTruthy();
    api.get.mockImplementation(serve);
    fireEvent.press(view.getByRole("button", { name: "Retry" }));
    await settle();
    expect(view.getByText("2018 Toyota Camry")).toBeTruthy();
  });

  it("shows the drafts skeleton and error on the Drafts tab", async () => {
    api.get.mockImplementation((url: string) => (url.startsWith("/me/drafts?") ? new Promise(() => {}) : serve(url)));
    routeParams.tab = "drafts";
    const loading = await renderScreen();
    expect(loading.getByTestId("my-listings-skeleton")).toBeTruthy();
    loading.unmount();
    api.get.mockImplementation((url: string) => (url.startsWith("/me/drafts?") ? Promise.reject(new Error("offline")) : serve(url)));
    const failed = await renderScreen();
    expect(failed.getByText("Something went wrong")).toBeTruthy();
    expect(failed.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it.each([
    ["active", "No active listings", "Your Listings on sale appear here."],
    ["drafts", "No drafts", "An unfinished Listing is saved here automatically."],
    ["archive", "Archive is empty", "Sold and removed Listings appear here."],
  ])("shows the %s empty state", async (name, title, body) => {
    server = { listings: [], drafts: [] };
    routeParams.tab = name;
    const view = await renderScreen();
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(body)).toBeTruthy();
  });

  it.each([
    ["ru", ["Нет активных объявлений", "Здесь будут ваши объявления в продаже."], ["Нет черновиков", "Незавершённое объявление сохраняется здесь автоматически."], ["Архив пуст", "Здесь будут проданные и снятые с продажи объявления."]],
    ["tk", ["Işjeň bildiriş ýok", "Satuwdaky bildirişleriňiz şu ýerde bolar."], ["Garalama ýok", "Tamamlanmadyk bildiriş şu ýerde awtomatik saklanýar."], ["Arhiw boş", "Satylan we satuwdan aýrylan bildirişler şu ýerde bolar."]],
  ] as const)("shows the empty states in %s", async (locale, active, drafts, archive) => {
    server = { listings: [], drafts: [] };
    for (const [name, [title, body]] of [["active", active], ["drafts", drafts], ["archive", archive]] as const) {
      routeParams.tab = name;
      const view = await renderScreen({ locale });
      expect(view.getByText(title)).toBeTruthy();
      expect(view.getByText(body)).toBeTruthy();
      view.unmount();
    }
  });

  it("asks a signed-out User to sign in", async () => {
    state.auth = false;
    const view = await renderScreen();
    expect(view.getByText("Sign in to manage your listings")).toBeTruthy();
    expect(view.getByText("Manage your active Listings, drafts and archive")).toBeTruthy();
    expect(view.queryByRole("tab")).toBeNull();
  });
});
