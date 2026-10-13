import { useState } from "react";
import { WizardSchemas } from "@auto-tm/contracts";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { fireEvent, renderMobile } from "../../../test/render";

import { translateWizardFieldErrors } from "./wizardErrors";
import Step6Location from "./Step6Location";

const ASHGABAT_REGION = "11111111-1111-4111-8111-111111111111";
const MARY_REGION = "22222222-2222-4222-8222-222222222222";
const LEBAP_REGION = "33333333-3333-4333-8333-333333333333";
const ASHGABAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MARY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BAYRAMALY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TURKMENABAT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const REGIONS = [
  { id: ASHGABAT_REGION, name: "Ashgabat", slug: "ashgabat" },
  { id: MARY_REGION, name: "Mary region", slug: "mary" },
  { id: LEBAP_REGION, name: "Lebap", slug: "lebap" },
];
const CITIES: Record<string, { id: string; name: string }[]> = {
  [ASHGABAT_REGION]: [{ id: ASHGABAT, name: "Ashgabat" }],
  [MARY_REGION]: [{ id: MARY, name: "Mary" }, { id: BAYRAMALY, name: "Bayramaly" }],
  [LEBAP_REGION]: [{ id: TURKMENABAT, name: "Turkmenabat" }],
};

let cityRequestLimits: (string | null)[] = [];

beforeEach(() => {
  cityRequestLimits = [];
  server.resetHandlers();
  server.use(
    http.get("*/catalog/regions", () => HttpResponse.json({ items: REGIONS })),
    http.get("*/catalog/regions/:id/cities", ({ params, request }) => {
      cityRequestLimits.push(new URL(request.url).searchParams.get("limit"));
      const regionId = params["id"] as string;
      const items = (CITIES[regionId] ?? []).map((c) => ({ ...c, slug: c.name.toLowerCase(), regionId }));
      return HttpResponse.json({ items, nextCursor: null, hasMore: false });
    }),
  );
});

function ValidatedPlace({
  initial = {},
  onChange,
}: {
  initial?: WizardSchemas.WizardDraftPayload;
  onChange?: (updates: Partial<WizardSchemas.WizardDraftPayload>) => void;
}) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const { fieldErrors } = WizardSchemas.validateStep("location", payload);
  return (
    <>
      <Step6Location
        payload={payload}
        onChange={(updates) => {
          onChange?.(updates);
          setPayload((previous) => ({ ...previous, ...updates }));
        }}
        fieldErrors={translateWizardFieldErrors(t, fieldErrors)}
        showErrors={attempted}
      />
      <Pressable accessibilityRole="button" onPress={() => setAttempted(true)}>
        <Text>Continue</Text>
      </Pressable>
    </>
  );
}

const headerNames = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
  screen.queryAllByRole("header").map((header) => String(header.props.children));

async function openCitySheet(screen: Awaited<ReturnType<typeof renderMobile>>) {
  await fireEvent.press(screen.getByRole("button", { name: "City: Select city" }));
  // The sheet lists cities once every region's cities have loaded.
  await screen.findByRole("header", { name: "Lebap" });
}

describe("Description and place step", () => {
  it("holds Description, then the place section with City and Area, and no Region row", async () => {
    const screen = await renderMobile(<ValidatedPlace />);

    const json = JSON.stringify(screen.toJSON());
    const positions = ["Description", "Where the car can be seen", "City", "Area"].map((label) =>
      json.indexOf(`"${label}`),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(screen.queryByText(/^Region/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Region/ })).toBeNull();

    const description = screen.getByLabelText("Description");
    expect(description.props.maxLength).toBe(2000);
    expect(screen.getByText("0/2000")).toBeTruthy();
  });

  it.each([
    ["ru", "Где можно посмотреть автомобиль", "Только район, где можно посмотреть автомобиль. Не указывайте домашний адрес."],
    ["tk", "Awtoulagy nirede görüp bolýar", "Diňe awtoulagy görüp boljak etrap. Öý salgysyny ýazmaň."],
    ["en", "Where the car can be seen", "Only the area where the car can be seen. Do not enter a home address."],
  ])("names the place section and explains Area in %s", async (locale, section, helper) => {
    const screen = await renderMobile(<ValidatedPlace />, { locale });
    expect(screen.getByText(section)).toBeTruthy();
    expect(screen.getByText(helper)).toBeTruthy();
  });

  it("ends with Area, with no preview caption that has no preview under it", async () => {
    const screen = await renderMobile(<ValidatedPlace />);
    // The caption belongs to the card on Check and publish, the only place with a preview.
    expect(screen.queryByText("This is how buyers will see your listing")).toBeNull();
  });

  it("keeps Area to 200 characters", async () => {
    const screen = await renderMobile(<ValidatedPlace />);
    expect(screen.getByLabelText("Area / landmark").props.maxLength).toBe(200);
  });

  it("lists every city under its region header in the City sheet", async () => {
    const screen = await renderMobile(<ValidatedPlace />);
    await openCitySheet(screen);

    // The sheet title, besides the City row's placeholder.
    expect(screen.getAllByText("Select city")).toHaveLength(2);
    const json = JSON.stringify(screen.toJSON());
    const order = ["Ashgabat", "Mary region", "Mary", "Bayramaly", "Lebap", "Turkmenabat"].map((name) =>
      json.indexOf(`"${name}"`),
    );
    expect(order.every((p) => p >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(headerNames(screen)).toEqual([
      "Ashgabat",
      "Mary region",
      "Lebap",
    ]);
    // One request per region, each asking for the whole region.
    expect(cityRequestLimits).toEqual(["500", "500", "500"]);
  });

  it.each([
    ["ru", "Город", "Выберите город"],
    ["tk", "Şäher", "Şäher saýlaň"],
  ] as const)("titles the City sheet in %s", async (locale, city, title) => {
    const screen = await renderMobile(<ValidatedPlace />, { locale });
    // Only the City row's placeholder before the sheet opens.
    expect(screen.getAllByText(title)).toHaveLength(1);

    await fireEvent.press(screen.getByRole("button", { name: `${city}: ${title}` }));
    await screen.findByRole("header", { name: "Lebap" });

    expect(screen.getAllByText(title)).toHaveLength(2);
  });

  it("says the City sheet failed when a region's cities cannot be loaded", async () => {
    server.use(
      http.get(`*/catalog/regions/${MARY_REGION}/cities`, () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 }),
      ),
    );
    const screen = await renderMobile(<ValidatedPlace />);

    await fireEvent.press(screen.getByRole("button", { name: "City: Select city" }));

    expect(
      await screen.findByText("Action failed. Pull down to refresh or try again."),
    ).toBeTruthy();
    expect(screen.queryAllByRole("header")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Ashgabat" })).toBeNull();
    expect(screen.queryByText("No cities available")).toBeNull();
  });

  it("filters cities across every region and keeps only the headers that still match", async () => {
    const screen = await renderMobile(<ValidatedPlace />);
    await openCitySheet(screen);

    await fireEvent.changeText(screen.getByPlaceholderText("Search..."), "ba");

    expect(screen.getByRole("button", { name: "Bayramaly" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turkmenabat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ashgabat" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mary" })).toBeNull();
    expect(screen.getAllByRole("header").length).toBe(3);

    await fireEvent.changeText(screen.getByPlaceholderText("Search..."), "bayr");
    expect(headerNames(screen)).toEqual([
      "Mary region",
    ]);

    await fireEvent.changeText(screen.getByPlaceholderText("Search..."), "zzz");
    expect(screen.getByText("No cities match your search")).toBeTruthy();
    expect(screen.queryAllByRole("header")).toHaveLength(0);
  });

  it("saves the picked city with its region and shows the region muted when the names differ", async () => {
    const onChange = vi.fn();
    const screen = await renderMobile(<ValidatedPlace onChange={onChange} />);
    await openCitySheet(screen);

    await fireEvent.press(screen.getByRole("button", { name: "Bayramaly" }));

    expect(onChange).toHaveBeenLastCalledWith({ cityId: BAYRAMALY, regionId: MARY_REGION });
    expect(screen.queryByText("Select city")).toBeNull();
    expect(screen.getByRole("button", { name: "City: Bayramaly, Mary region" })).toBeTruthy();
    expect(screen.getByText("Mary region")).toBeTruthy();
  });

  it("shows only the city when its name matches the region", async () => {
    const screen = await renderMobile(<ValidatedPlace initial={{ regionId: ASHGABAT_REGION, cityId: ASHGABAT }} />);

    expect(await screen.findByRole("button", { name: "City: Ashgabat" })).toBeTruthy();
    expect(screen.getAllByText("Ashgabat")).toHaveLength(1);
  });

  it("shows a saved draft's city and region unchanged", async () => {
    const onChange = vi.fn();
    const screen = await renderMobile(
      <ValidatedPlace initial={{ regionId: LEBAP_REGION, cityId: TURKMENABAT }} onChange={onChange} />,
    );

    expect(await screen.findByRole("button", { name: "City: Turkmenabat, Lebap" })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the City required error under the City row after Continue, and never a Region error", async () => {
    const screen = await renderMobile(<ValidatedPlace initial={{ description: "One owner" }} />);
    expect(screen.queryByText("City is required")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("City is required")).toBeTruthy();
    expect(screen.queryByText("Region is required")).toBeNull();
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('"City is required"')).toBeGreaterThan(json.indexOf('"City: Select city"'));
    expect(json.indexOf('"City is required"')).toBeLessThan(json.indexOf('"Area / landmark"'));

    await openCitySheet(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Mary" }));
    expect(screen.queryByText("City is required")).toBeNull();
  });

  it("shows the required Description error under the field after the first Continue tap and clears it once typed", async () => {
    const screen = await renderMobile(<ValidatedPlace />);
    expect(screen.queryByText("Description is required")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Description is required")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Description"), "One owner, garage kept");

    expect(screen.queryByText("Description is required")).toBeNull();
    expect(screen.getByText("22/2000")).toBeTruthy();
  });

  it("shows the required Description error once the seller leaves it empty, before Continue", async () => {
    const screen = await renderMobile(<ValidatedPlace />);

    await fireEvent(screen.getByLabelText("Description"), "blur");

    expect(screen.getByText("Description is required")).toBeTruthy();
    expect(screen.queryByText("City is required")).toBeNull();
  });

  it("keeps the Description, City and Area read-only when the step is disabled", async () => {
    const screen = await renderMobile(
      <Step6Location payload={{ description: "Kept" }} onChange={() => {}} disabled />,
    );
    expect(screen.getByLabelText("Description").props.editable).toBe(false);
    expect(screen.getByLabelText("Area / landmark").props.editable).toBe(false);
    expect(screen.getByRole("button", { name: "City: Select city" }).props.accessibilityState.disabled).toBe(true);
  });
});
