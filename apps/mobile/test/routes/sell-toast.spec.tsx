import { BaseNavigationContainer, createNavigationContainerRef, createNavigatorFactory, useNavigationBuilder } from "@react-navigation/core";
import { StackActions, StackRouter } from "@react-navigation/routers";
import type { ParamListBase } from "@react-navigation/routers";
import type { ReactNode } from "react";
import { StyleSheet, View, Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/api/client";
import SellScreen from "../../app/(tabs)/sell";
import { act, fireEvent, renderMobile, routeParams, routerMock, within } from "../render";

import { ToastProvider } from "@/components/ui/toast";

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const photos = [0, 1, 2].map((index) => ({ photoId: index === 0 ? id : `550e8400-e29b-41d4-a716-${String(900 + index).padStart(12, "0")}`, key: index === 0 ? "photo.webp" : `support-${index}.webp`, sortOrder: index, state: "uploaded" }));
  return {
    id, photos, publish: vi.fn(), forceSave: vi.fn(), flush: vi.fn(), save: vi.fn(),
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
  save: fixture.save, forceSave: fixture.forceSave, flush: fixture.flush, retrySave: vi.fn(), saveStatus: "saved", saveError: null,
}) }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, isReady: true, publishGate: { canPublish: true, blockers: [] },
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
vi.mock("../../src/listings/wizard/CheckAndPublish", () => ({ default: () => null }));

beforeEach(() => {
  routeParams.resumeDraftId = fixture.id;
  fixture.publish.mockReset().mockRejectedValue(new Error("Publish failed"));
  fixture.forceSave.mockReset().mockResolvedValue(undefined);
  // The save before publishing goes through.
  fixture.flush.mockReset().mockResolvedValue(true);
});

async function renderWizard() {
  const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>);
  const top = () => StyleSheet.flatten(screen.getByTestId("toast-viewport-top").props.style).top;
  return { screen, top };
}

describe("Sell publish toasts", () => {
  // #588: a failure is worded above Publish, where it stays; it is no longer a toast
  // that had to be kept clear of the wizard header.
  it.each([
    ["en", "At least 3 photos are required"],
    ["ru", "Нужно не менее 3 фотографий"],
    ["tk", "Iň azyndan 3 surat gerek"],
  ])("shows the same minimum helper after the server refuses publication in %s", async (locale, message) => {
    fixture.publish.mockRejectedValue(new ApiError("INVALID_DRAFT_PAYLOAD", 400, "Draft is missing required fields", { formErrors: ["AT_LEAST_THREE_PHOTOS_REQUIRED"] }));
    const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>, { locale });
    const publishName = locale === "ru" ? "Опубликовать" : locale === "tk" ? "Neşir et" : "Publish";
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: publishName })); });
    expect(within(screen.getByRole("alert")).getByText(message)).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  // #735: the server answers UPLOAD_NOT_AVAILABLE when a draft photo's upload was
  // retired; the seller must re-add that photo. The alert names the step.
  describe.each(["UPLOAD_NOT_AVAILABLE", "UPLOAD_OBJECT_INVALID"])("%s", (code) => {
  it.each([
    ["en", "One photo is no longer available. Re-add it in the Photos step and try again."],
    ["ru", "Одна из фотографий больше недоступна. Добавьте её заново на шаге «Фото» и попробуйте ещё раз."],
    ["tk", "Suratlaryňyzdan biri indi elýeterli däl. Ony «Surat» ädiminde täzeden goşuň we täzeden synanyşyň."],
  ])("names the re-add step when the server answers UPLOAD_NOT_AVAILABLE for a photo (%s)", async (locale, message) => {
    fixture.publish.mockRejectedValue(new ApiError(code, 400, "A photo upload is no longer available"));
    const screen = await renderMobile(<ToastProvider><SellScreen /></ToastProvider>, { locale });
    const publishName = locale === "ru" ? "Опубликовать" : locale === "tk" ? "Neşir et" : "Publish";
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: publishName })); });
    expect(within(screen.getByRole("alert")).getByText(message)).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  });

  it("shows a publish failure above Publish, not as a toast, and keeps the wizard open", async () => {
    const { screen } = await renderWizard();
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Publish" })); });

    const message = "Could not publish. Your draft is saved. Try again.";
    expect(within(screen.getByRole("alert")).getByText(message)).toBeTruthy();
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.queryByText("Publish failed")).toBeNull();
    expect(screen.getByText("Check and publish")).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("uses ordinary clearance for the success toast on the destination screen", async () => {
    fixture.publish.mockResolvedValue({ id: fixture.id });
    const { screen, top } = await renderWizard();
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Publish" })); });
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${fixture.id}`);
    expect(screen.getByText("Listing published")).toBeTruthy();
    expect(top()).toBe(59 + 64 + 8);
  });
});


// Real NavigationBuilder and StackRouter manage history; only screen presentation
// and Expo Router's URL-to-action adapter are replaced in this Node test.
it("Back after publish and opening/closing Edit returns to tabs, then can leave the app", async () => {
  const navigation = createNavigationContainerRef<ParamListBase>();
  const detail = `/(public)/listings/${fixture.id}`;
  const edit = `/listings/${fixture.id}/edit`;
  const Navigator = createNavigatorFactory(function TestStack({ children }: { children: ReactNode }) {
    const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
      children, initialRouteName: "(tabs)",
    });
    return <NavigationContent>{state.routes.map((route, index) => {
      const descriptor = descriptors[route.key];
      if (!descriptor) throw new Error(`Missing descriptor for route ${route.key}`);
      return (
        <View key={route.key} style={{ display: index === state.index ? "flex" : "none" }}>
          {descriptor.render()}
        </View>
      );
    })}</NavigationContent>;
  })();
  routerMock.replace.mockImplementation((name) => navigation.dispatch(StackActions.replace(String(name))));
  routerMock.push.mockImplementation((name) => navigation.dispatch(StackActions.push(String(name))));
  fixture.publish.mockResolvedValue({ id: fixture.id });
  const screen = await renderMobile(<ToastProvider><BaseNavigationContainer ref={navigation}>
    <Navigator.Navigator>
      <Navigator.Screen name="(tabs)" component={SellScreen} />
      <Navigator.Screen name={detail}>{() => <Text>Published detail</Text>}</Navigator.Screen>
      <Navigator.Screen name={edit}>{() => <Text>Edit listing</Text>}</Navigator.Screen>
      <Navigator.Screen name="(onboarding)">{() => <Text>Onboarding</Text>}</Navigator.Screen>
    </Navigator.Navigator>
  </BaseNavigationContainer></ToastProvider>);
  try {
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Publish" })); });
    expect(navigation.getCurrentRoute()?.name).toBe(detail);
    await act(() => navigation.dispatch(StackActions.push(edit)));
    expect(navigation.getCurrentRoute()?.name).toBe(edit);
    await act(() => navigation.goBack());
    expect(navigation.getCurrentRoute()?.name).toBe(detail);
    expect(navigation.canGoBack()).toBe(true);
    await act(() => navigation.goBack());
    expect(navigation.getCurrentRoute()?.name).toBe("(tabs)");
    expect(screen.getByText("New listing")).toBeTruthy();
    expect(navigation.canGoBack()).toBe(false);
    expect(navigation.getRootState().routes.map((route) => route.name)).toEqual(["(tabs)"]);
  } finally {
    routerMock.replace.mockReset();
    routerMock.push.mockReset();
  }
});
