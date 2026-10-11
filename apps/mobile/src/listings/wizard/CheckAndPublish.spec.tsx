import type { WizardSchemas } from "@auto-tm/contracts";
import * as Linking from "expo-linking";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, within } from "../../../test/render";
import type { StagedPhoto } from "../uploadStaging/types";

import CheckAndPublish from "./CheckAndPublish";

const ID = "550e8400-e29b-41d4-a716-446655440000";
const named = (name: string) => ({ data: { items: [{ id: ID, name }] } });

vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => named("Toyota") }));
vi.mock("../../api/catalog/useModels", () => ({ useModels: () => named("Camry") }));
vi.mock("../../api/catalog/useGenerations", () => ({ useGenerations: () => named("XV70") }));
vi.mock("../../api/catalog/useTransmissions", () => ({ useTransmissions: () => named("Automatic") }));
vi.mock("../../api/catalog/useEngineTypes", () => ({ useEngineTypes: () => named("Petrol") }));
vi.mock("../../api/catalog/useCityGroups", () => ({
  useCityGroups: () => ({ groups: [] }),
  findCityInGroups: (_groups: unknown, cityId?: string) =>
    cityId ? { city: { id: cityId, name: "Ashgabat" }, region: { id: ID, name: "Ahal" } } : undefined,
}));

const photo = (n: number, state: StagedPhoto["state"] = "attached"): StagedPhoto => ({
  photoId: `photo-${n}`,
  localUri: `file:///staged/photo-${n}.jpg`,
  key: state === "attached" ? `photo-${n}.jpg` : undefined,
  state,
  sortOrder: n,
  retryCount: 0,
});

const usedCar: WizardSchemas.WizardDraftPayload = {
  brandId: ID, modelId: ID, year: 2020,
  condition: "used", mileageKm: 45000, conditionDisclosure: { damaged: false },
  transmissionId: ID, engineTypeId: ID,
  priceAmount: 185000, priceCurrency: "TMT",
  description: "One owner, serviced on time", regionId: ID, cityId: ID,
  contactPhone: "+99365000000", allowCalls: true, allowChat: true,
};
const ALL_STEPS: WizardSchemas.WizardStep[] = ["vehicle", "specs", "photos", "price", "location", "contact"];

function check(overrides: Partial<Parameters<typeof CheckAndPublish>[0]> = {}, locale = "en") {
  return renderMobile(
    <CheckAndPublish
      payload={usedCar}
      validatedSteps={ALL_STEPS}
      onChangeStep={() => {}}
      photos={[photo(0), photo(1)]}
      {...overrides}
    />,
    { locale },
  );
}

describe("Check and publish, the card preview", () => {
  it("shows the cover photo, price, Brand Model and year, spec line and city under the buyers' note", () => {
    const screen = check();
    const card = within(screen.getByTestId("check-preview"));

    expect(screen.getByTestId("check-preview-cover").props.source).toEqual({ uri: "file:///staged/photo-0.jpg" });
    expect(card.getByText("185,000 TMT")).toBeTruthy();
    expect(card.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(card.getByText("45,000 km · Automatic · Petrol")).toBeTruthy();
    expect(card.getByText(/^Ashgabat/)).toBeTruthy();

    // The note sits under the card.
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf("This is how buyers will see your listing")).toBeGreaterThan(json.indexOf("Toyota Camry, 2020"));
  });

  it("shows the price in the draft's currency and New for a new car", () => {
    const screen = check({
      payload: { ...usedCar, condition: "new", mileageKm: undefined, priceAmount: 12500, priceCurrency: "USD" },
    });

    const card = within(screen.getByTestId("check-preview"));

    expect(card.getByText("12,500 USD")).toBeTruthy();
    expect(card.getByText("New · Automatic · Petrol")).toBeTruthy();
  });

  it("does not say No photos before the draft's photos are read from the device", () => {
    const screen = check({ photos: [], photosReady: false });

    expect(screen.queryByText("No photos")).toBeNull();
    expect(screen.queryByTestId("check-preview-cover")).toBeNull();
  });

  it("says No photos when nothing is picked", () => {
    const screen = check({ photos: [] });

    expect(screen.queryByTestId("check-preview-cover")).toBeNull();
    expect(screen.getByText("No photos")).toBeTruthy();
  });

  it.each([
    ["ru", "Так покупатели увидят ваше объявление"],
    ["tk", "Alyjylar bildirişiňizi şu görnüşde görer"],
  ])("has the buyers' note in %s", (locale, note) => {
    expect(check({}, locale).getByText(note)).toBeTruthy();
  });
});

describe("Check and publish, the Posting rules line", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://autotm.example");
    vi.mocked(Linking.openURL).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["en", "By publishing you accept the Posting rules.", "Posting rules"],
    ["ru", "Публикуя, вы принимаете Правила размещения.", "Правила размещения"],
    ["tk", "Neşir etmek bilen siz Ýerleşdirme düzgünlerini kabul edýärsiňiz.", "Ýerleşdirme düzgünlerini"],
  ])("in %s reads as one sentence and opens the Posting rules page for that language", (locale, sentence, link) => {
    const screen = check({}, locale);

    expect(screen.getByText(sentence)).toBeTruthy();
    fireEvent.press(screen.getByRole("link", { name: link }));

    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://autotm.example/${locale}/legal/posting-rules`);
  });

  it("sits under the sections", () => {
    const json = JSON.stringify(check().toJSON());

    expect(json.indexOf("By publishing you accept the ")).toBeGreaterThan(json.indexOf('"Contact"'));
  });
});

describe("Check and publish, the sections", () => {
  it("uses the shared functional blue for Change and Posting rules", () => {
    const screen = check();
    for (const label of screen.getAllByText("Change")) {
      expect(label.props.className).toContain("text-link");
    }
    expect(screen.getByRole("link").props.className).toContain("text-link");
  });

  const rowLabels = (screen: ReturnType<typeof check>) =>
    screen.getAllByTestId("check-section").map((row) => String(row.props.accessibilityLabel));

  it("lists one row per step in the wizard's order, each with a summary and Change", () => {
    const screen = check({
      payload: {
        ...usedCar, generationId: ID, vin: "WBA1234567890ABCD",
        acceptsExchange: true, locationText: "Near the bazaar",
      },
    });

    expect(rowLabels(screen)).toEqual([
      "Car, Toyota Camry, 2020 · XV70 · VIN WBA1234567890ABCD, Change",
      "Details and condition, 45,000 km · Automatic · Petrol · Damaged / needs repair: No, Change",
      "Photos, Photos: 2, Change",
      "Price, 185,000 TMT · Exchange possible, Change",
      "Description and place, One owner, serviced on time · Ashgabat, Near the bazaar, Change",
      "Contact, +99365000000 · Phone calls, In-app chat, Change",
    ]);
  });

  it("opens the step a row names", () => {
    const onChangeStep = vi.fn();
    const screen = check({ onChangeStep });

    fireEvent.press(screen.getByRole("button", { name: /^Price, / }));
    fireEvent.press(screen.getByRole("button", { name: /^Description and place, / }));

    expect(onChangeStep.mock.calls).toEqual([["price"], ["location"]]);
  });

  it("offers Fill in for a step that is not complete", () => {
    const screen = check({
      payload: { ...usedCar, priceAmount: undefined },
      validatedSteps: ["vehicle", "specs", "photos"],
    });

    expect(rowLabels(screen)).toEqual([
      expect.stringMatching(/^Car, .*, Change$/),
      expect.stringMatching(/^Details and condition, .*, Change$/),
      expect.stringMatching(/^Photos, .*, Change$/),
      "Price, Fill in",
      expect.stringMatching(/^Description and place, .*, Fill in$/),
      expect.stringMatching(/^Contact, .*, Fill in$/),
    ]);
  });

  it("offers Fill in on Photos while a photo has failed, since that is where it is fixed", () => {
    const screen = check({ photos: [photo(0), photo(1, "failed")] });

    expect(rowLabels(screen)[2]).toBe("Photos, Photos: 2, Fill in");
  });

  it("says whether the car is damaged for a Used car only", () => {
    const used = check({ payload: { ...usedCar, conditionDisclosure: { damaged: true } } });
    expect(used.getByText(/Damaged \/ needs repair: Yes/)).toBeTruthy();

    const fresh = check({
      payload: { ...usedCar, condition: "new", mileageKm: undefined, conditionDisclosure: { damaged: false } },
    });
    expect(fresh.queryByText(/Damaged/)).toBeNull();
    expect(fresh.getByRole("button", { name: "Details and condition, New · Automatic · Petrol, Change" })).toBeTruthy();
  });

  it.each([
    ["ru", "Изменить", "Заполнить"],
    ["tk", "Üýtget", "Doldur"],
  ])("names the actions in %s", (locale, change, fillIn) => {
    const screen = check({ validatedSteps: ["vehicle"] }, locale);

    expect(screen.getAllByText(change)).toHaveLength(1);
    expect(screen.getAllByText(fillIn)).toHaveLength(5);
  });
});
