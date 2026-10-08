import { Profiler, useState, type ReactElement } from "react";
import { FlatList } from "react-native";
import { WizardSchemas } from "@auto-tm/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, first, renderMobile, within } from "../../../test/render";

import Step3VehicleId from "./Step3VehicleId";

const catalog = vi.hoisted(() => ({
  brands: [
    { id: "toyota", name: "Toyota" },
    { id: "bmw", name: "BMW" },
  ],
  models: {
    toyota: [
      { id: "camry", name: "Camry" },
      { id: "corolla", name: "Corolla" },
    ],
    bmw: [{ id: "x5", name: "X5" }],
  } as Record<string, { id: string; name: string }[]>,
  generations: {
    camry: [
      { id: "xv70", name: "XV70 (2017–2024)" },
      { id: "xv50", name: "XV50 (2011–2017)" },
    ],
    corolla: [],
    x5: [{ id: "f15", name: "F15 (2013–2018)" }],
  } as Record<string, { id: string; name: string }[]>,
  generationsPending: false,
}));

const loaded = <T,>(items: T[]) => ({ data: { items }, isPending: false, isError: false });

vi.mock("../../api/catalog/useBrands", () => ({ useBrands: () => loaded(catalog.brands) }));
vi.mock("../../api/catalog/useModels", () => ({
  useModels: (brandId: string) => loaded(catalog.models[brandId] ?? []),
}));
vi.mock("../../api/catalog/useGenerations", () => ({
  useGenerations: (modelId: string) =>
    catalog.generationsPending && modelId
      ? { data: undefined, isPending: true, isError: false }
      : loaded(catalog.generations[modelId] ?? []),
}));

beforeEach(() => {
  catalog.generationsPending = false;
});

type Payload = WizardSchemas.WizardDraftPayload;

/** Holds the payload like the wizard does, so a pick feeds the next picker. */
function CarStep({
  initial = {},
  onChange,
  ...props
}: {
  initial?: Payload;
  onChange?: (updates: Partial<Payload>) => void;
  disabled?: boolean;
  showErrors?: boolean;
  fieldErrors?: Record<string, string>;
}) {
  const [payload, setPayload] = useState<Payload>(initial);
  return (
    <Step3VehicleId
      payload={payload}
      onChange={(updates) => {
        onChange?.(updates);
        setPayload((current) => ({ ...current, ...updates }));
      }}
      {...props}
    />
  );
}

const nextYear = WizardSchemas.WIZARD_LIMITS.yearMax;
const filled: Payload = { brandId: "toyota", modelId: "camry", generationId: "xv70", year: 2018 };

const vinHelper = {
  en: "Optional. 17 characters. Shown in the Listing's specifications.",
  ru: "Необязательно. 17 символов. Показывается в характеристиках объявления.",
  tk: "Hökman däl. 17 belgi. Bildirişiň aýratynlyklarynda görkezilýär.",
} as const;

describe("Car step", () => {
  it("shows Brand, Model, Year and Generation, then an optional VIN field at the bottom", () => {
    const screen = renderMobile(<Step3VehicleId payload={filled} onChange={() => {}} />);

    const labels = ["Brand", "Model", "Year", "Generation", "VIN"].map(
      (label) => screen.getAllByText(new RegExp(`^${label}( \\*)?$`))[0],
    );
    const json = JSON.stringify(screen.toJSON());
    const positions = ["Brand", "Model", "Year", "Generation", "VIN"].map((label) =>
      json.indexOf(`"${label}`),
    );
    expect(labels.every(Boolean)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    const vin = screen.getByLabelText("VIN");
    expect(vin.props.maxLength).toBe(17);
    expect(vin.props.accessibilityHint).toBe(vinHelper.en);
    expect(screen.getByText(vinHelper.en)).toBeTruthy();
    expect(screen.queryByText(/auto-fill/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it.each(["ru", "tk"] as const)("shows the VIN helper in %s", (locale) => {
    const screen = renderMobile(<Step3VehicleId payload={{}} onChange={() => {}} />, { locale });
    expect(screen.getByText(vinHelper[locale])).toBeTruthy();
    expect(screen.getByHintText(vinHelper[locale])).toBeTruthy();
  });

  it("saves the typed VIN and clears it when emptied", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<Step3VehicleId payload={{}} onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText("VIN"), "WBA1234567890ABCD");
    fireEvent.changeText(screen.getByLabelText("VIN"), "  ");

    expect(onChange).toHaveBeenNthCalledWith(1, { vin: "WBA1234567890ABCD" });
    expect(onChange).toHaveBeenNthCalledWith(2, { vin: null });
  });

  it("shows a VIN error under the field after the first Continue tap", () => {
    const fieldErrors = { vin: "Use 17 characters or fewer" };
    const screen = renderMobile(
      <Step3VehicleId payload={{ vin: "A".repeat(18) }} onChange={() => {}} fieldErrors={fieldErrors} />,
    );
    expect(screen.queryByText("Use 17 characters or fewer")).toBeNull();

    screen.rerender(
      <Step3VehicleId payload={{ vin: "A".repeat(18) }} onChange={() => {}} fieldErrors={fieldErrors} showErrors />,
    );
    expect(screen.getByText("Use 17 characters or fewer")).toBeTruthy();
  });

  it("locks the VIN with the rest of Car when editing a published Listing", () => {
    const screen = renderMobile(
      <Step3VehicleId payload={{ vin: "WBA1234567890ABCD" }} onChange={() => {}} disabled />,
    );
    expect(screen.getByLabelText("VIN").props.editable).toBe(false);
  });
});

const row = (screen: ReturnType<typeof renderMobile>, name: string | RegExp) =>
  screen.getByRole("button", { name });
/** A sheet row; sheets render after the Car rows, whose value text can share its name. */
const option = (screen: ReturnType<typeof renderMobile>, name: string) =>
  first(screen.getAllByRole("button", { name }).reverse());
const sheetOpen = (screen: ReturnType<typeof renderMobile>) =>
  screen.queryByRole("button", { name: "Close" }) !== null;

/**
 * Records, for every commit after the first render, whether the empty
 * Generation sheet was on screen. A sheet that opens and closes inside one
 * press leaves no trace in the final tree, so the commits are the evidence.
 */
function renderWatchingCommits(ui: ReactElement) {
  const emptySheetCommits: boolean[] = [];
  // Empty during the first render, which happens before renderMobile returns.
  const mounted: { screen?: ReturnType<typeof renderMobile> } = {};
  const screen = renderMobile(
    <Profiler
      id="car"
      onRender={() => {
        if (mounted.screen) {
          emptySheetCommits.push(
            mounted.screen.queryByText("No generations available") !== null,
          );
        }
      }}
    >
      {ui}
    </Profiler>,
  );
  mounted.screen = screen;
  return { screen, emptySheetCommits };
}

describe("Car step pickers chain", () => {
  it("opens Model after a Brand, Year after a Model and Generation after a Year", () => {
    const screen = renderMobile(<CarStep />);

    fireEvent.press(row(screen, "Brand: Select brand"));
    fireEvent.press(option(screen, "Toyota"));
    expect(screen.queryByRole("button", { name: "BMW" })).toBeNull();
    fireEvent.press(option(screen, "Camry"));
    expect(screen.queryByRole("button", { name: "Corolla" })).toBeNull();
    fireEvent.press(option(screen, "2018"));
    fireEvent.press(option(screen, "XV70 (2017–2024)"));

    expect(sheetOpen(screen)).toBe(false);
    expect(row(screen, "Brand: Toyota")).toBeTruthy();
    expect(row(screen, "Model: Camry")).toBeTruthy();
    expect(row(screen, "Year: 2018")).toBeTruthy();
    expect(row(screen, "Generation: XV70 (2017–2024)")).toBeTruthy();
  });

  it("goes from Model straight to Generation when the year is already set", () => {
    const screen = renderMobile(<CarStep initial={{ brandId: "toyota", year: 2018 }} />);

    fireEvent.press(row(screen, "Model: Select model"));
    fireEvent.press(option(screen, "Camry"));

    expect(screen.queryByRole("button", { name: "1999" })).toBeNull();
    expect(screen.getByRole("button", { name: "XV70 (2017–2024)" })).toBeTruthy();
  });

  it("stops after Model when the year is set and the model has no generations", () => {
    const screen = renderMobile(<CarStep initial={{ brandId: "toyota", year: 2018 }} />);

    fireEvent.press(row(screen, "Model: Select model"));
    fireEvent.press(option(screen, "Corolla"));

    expect(sheetOpen(screen)).toBe(false);
    expect(row(screen, "Model: Corolla")).toBeTruthy();
  });

  it("stops after Year when a generation is already chosen", () => {
    const screen = renderMobile(<CarStep initial={filled} />);

    fireEvent.press(row(screen, "Year: 2018"));
    fireEvent.press(option(screen, "2019"));

    expect(sheetOpen(screen)).toBe(false);
    expect(row(screen, "Year: 2019")).toBeTruthy();
  });

  it("closes a Generation sheet it opened once the model turns out to have no generations", () => {
    catalog.generationsPending = true;
    const screen = renderMobile(<CarStep initial={{ brandId: "toyota", year: 2018 }} />);

    fireEvent.press(row(screen, "Model: Select model"));
    fireEvent.press(option(screen, "Corolla"));
    expect(sheetOpen(screen)).toBe(true);

    catalog.generationsPending = false;
    screen.rerender(<CarStep initial={{ brandId: "toyota", year: 2018 }} />);

    expect(sheetOpen(screen)).toBe(false);
  });

  it("never shows the Generation sheet after a Year when the model is known to have none", () => {
    const { screen, emptySheetCommits } = renderWatchingCommits(
      <CarStep initial={{ brandId: "toyota", modelId: "corolla" }} />,
    );

    fireEvent.press(row(screen, "Year: Select year"));
    fireEvent.press(option(screen, "2018"));

    expect(emptySheetCommits).not.toContain(true);
    expect(emptySheetCommits.length).toBeGreaterThan(0);
    expect(sheetOpen(screen)).toBe(false);
    expect(row(screen, "Year: 2018")).toBeTruthy();
  });

  it("never shows the Generation sheet when a model known to have none is picked again", () => {
    const { screen, emptySheetCommits } = renderWatchingCommits(
      <CarStep initial={{ brandId: "toyota", modelId: "corolla", year: 2018 }} />,
    );

    fireEvent.press(row(screen, "Model: Corolla"));
    fireEvent.press(option(screen, "Corolla"));

    expect(emptySheetCommits).not.toContain(true);
    expect(emptySheetCommits.length).toBeGreaterThan(0);
    expect(sheetOpen(screen)).toBe(false);
  });

  it("starts each picker's list from the top instead of keeping the last list's scroll", () => {
    const screen = renderMobile(<CarStep />);

    fireEvent.press(row(screen, "Brand: Select brand"));
    const brandList = screen.UNSAFE_getByType(FlatList);
    fireEvent.press(option(screen, "Toyota"));
    const modelList = screen.UNSAFE_getByType(FlatList);
    fireEvent.press(option(screen, "Camry"));
    const yearList = screen.UNSAFE_getByType(FlatList);

    // A list that is mounted anew has no scroll offset to carry over. Compared
    // as booleans: printing two test instances on failure exhausts the heap.
    expect(modelList === brandList).toBe(false);
    expect(yearList === modelList).toBe(false);
  });

  it("keeps what was picked and opens nothing more when a sheet is closed", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<CarStep onChange={onChange} />);

    fireEvent.press(row(screen, "Brand: Select brand"));
    fireEvent.press(option(screen, "Toyota"));
    fireEvent.press(option(screen, "Close"));

    expect(sheetOpen(screen)).toBe(false);
    expect(row(screen, "Brand: Toyota")).toBeTruthy();
    expect(row(screen, "Model: Select model")).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("Car step clearing", () => {
  it("clears Model and Generation but keeps Year when the Brand changes", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<CarStep initial={filled} onChange={onChange} />);

    fireEvent.press(row(screen, "Brand: Toyota"));
    fireEvent.press(option(screen, "BMW"));

    expect(onChange).toHaveBeenLastCalledWith({
      brandId: "bmw",
      modelId: undefined,
      generationId: undefined,
    });
    expect(row(screen, "Model: Select model")).toBeTruthy();
    expect(row(screen, "Year: 2018")).toBeTruthy();
  });

  it("clears Generation but keeps Year when the Model changes", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<CarStep initial={filled} onChange={onChange} />);

    fireEvent.press(row(screen, "Model: Camry"));
    fireEvent.press(option(screen, "Corolla"));

    expect(onChange).toHaveBeenLastCalledWith({ modelId: "corolla", generationId: undefined });
    expect(row(screen, "Year: 2018")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Generation:/ })).toBeNull();
  });

  it("keeps Model and Generation when the same Brand is picked again", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<CarStep initial={filled} onChange={onChange} />);

    fireEvent.press(row(screen, "Brand: Toyota"));
    fireEvent.press(option(screen, "Toyota"));

    expect(onChange).not.toHaveBeenCalled();
    expect(row(screen, "Model: Camry")).toBeTruthy();
    expect(row(screen, "Generation: XV70 (2017–2024)")).toBeTruthy();
  });
});

describe("Car step Year list", () => {
  it("lists every year from next year down to 1900 with no search field or keyboard", () => {
    const screen = renderMobile(<CarStep />);

    fireEvent.press(row(screen, "Year: Select year"));

    const years = screen
      .getAllByRole("button", { name: /^\d{4}$/ })
      .map((button) => Number(within(button).getByText(/^\d{4}$/).props.children));
    expect(years[0]).toBe(nextYear);
    expect(years.at(-1)).toBe(WizardSchemas.WIZARD_LIMITS.yearMin);
    expect(years).toHaveLength(nextYear - 1900 + 1);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(screen.queryByPlaceholderText("Search...")).toBeNull();
    expect(screen.queryByPlaceholderText("YYYY")).toBeNull();
  });

  it.each([
    ["en", "Select year"],
    ["ru", "Выберите год"],
    ["tk", "Ýyl saýlaň"],
  ] as const)("titles the Year sheet in %s", (locale, title) => {
    const screen = renderMobile(<CarStep initial={{ year: 2018 }} />, { locale });

    expect(screen.queryByText(title)).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: /2018$/ }));

    expect(screen.getByText(title)).toBeTruthy();
  });

  it("announces the chosen year as selected", () => {
    const screen = renderMobile(<CarStep initial={{ year: 2018 }} />);

    fireEvent.press(row(screen, "Year: 2018"));

    expect(screen.getByRole("button", { name: "2018", selected: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2017", selected: false })).toBeTruthy();
  });
});

describe("Car step Generation", () => {
  it.each([
    ["en", "I don't know, skip"],
    ["ru", "Не знаю, пропустить"],
    ["tk", "Bilemok, geç"],
  ] as const)("ends the Generation sheet with a skip row in %s", (locale, skip) => {
    const screen = renderMobile(
      <CarStep initial={{ brandId: "toyota", modelId: "camry", year: 2018 }} />,
      { locale },
    );

    const generation = { en: "Generation", ru: "Поколение", tk: "Nesil" }[locale];
    fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${generation}:`) }));

    const labels = JSON.stringify(screen.toJSON());
    expect(labels.indexOf(skip)).toBeGreaterThan(labels.indexOf("XV50 (2011–2017)"));
    expect(screen.getByRole("button", { name: skip })).toBeTruthy();
  });

  it("closes with no generation when the seller skips", () => {
    const onChange = vi.fn();
    const screen = renderMobile(<CarStep initial={filled} onChange={onChange} />);

    fireEvent.press(row(screen, "Generation: XV70 (2017–2024)"));
    fireEvent.press(option(screen, "I don't know, skip"));

    expect(onChange).toHaveBeenLastCalledWith({ generationId: undefined });
    expect(sheetOpen(screen)).toBe(false);
    expect(row(screen, "Generation: Select generation")).toBeTruthy();
  });

  it("hides the Generation row until a model with generations is chosen", () => {
    const empty = renderMobile(<CarStep />);
    expect(empty.queryByRole("button", { name: /^Generation:/ })).toBeNull();
    empty.unmount();

    const none = renderMobile(<CarStep initial={{ brandId: "toyota", modelId: "corolla" }} />);
    expect(none.queryByRole("button", { name: /^Generation:/ })).toBeNull();
    none.unmount();

    const some = renderMobile(<CarStep initial={{ brandId: "toyota", modelId: "camry" }} />);
    expect(some.getByRole("button", { name: "Generation: Select generation" })).toBeTruthy();
  });

  it("keeps showing a generation that is already set", () => {
    const screen = renderMobile(
      <CarStep initial={{ brandId: "toyota", modelId: "corolla", generationId: "xv70" }} />,
    );
    expect(screen.getByRole("button", { name: /^Generation:/ })).toBeTruthy();
  });

  it("lets the seller clear a generation the model no longer has", () => {
    const onChange = vi.fn();
    const screen = renderMobile(
      <CarStep
        initial={{ brandId: "toyota", modelId: "corolla", generationId: "xv70" }}
        onChange={onChange}
      />,
    );

    fireEvent.press(screen.getByRole("button", { name: /^Generation:/ }));
    expect(screen.getByText("No generations available")).toBeTruthy();
    fireEvent.press(option(screen, "I don't know, skip"));

    expect(onChange).toHaveBeenLastCalledWith({ generationId: undefined });
    expect(sheetOpen(screen)).toBe(false);
    expect(screen.queryByRole("button", { name: /^Generation:/ })).toBeNull();
  });
});

describe("Car step errors, rows and edit mode", () => {
  const fieldErrors = {
    brandId: "Brand is required",
    modelId: "Model is required",
    year: "Year is required",
  };

  it("shows the required errors under Brand, Model and Year after the first Continue", () => {
    const screen = renderMobile(<CarStep fieldErrors={fieldErrors} />);
    expect(screen.queryByText("Year is required")).toBeNull();

    screen.rerender(<CarStep fieldErrors={fieldErrors} showErrors />);

    const json = JSON.stringify(screen.toJSON());
    const order = ["Brand: Select brand", "Brand is required", "Model: Select model",
      "Model is required", "Year: Select year", "Year is required"].map((text) => json.indexOf(text));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("announces each row as a button with its label and current value", () => {
    const screen = renderMobile(<CarStep initial={filled} />);

    for (const name of ["Brand: Toyota", "Model: Camry", "Year: 2018", "Generation: XV70 (2017–2024)"]) {
      expect(row(screen, name)).toBeTruthy();
    }
  });

  it("keeps the Car rows locked and opens no sheet in edit mode", () => {
    const screen = renderMobile(<CarStep initial={filled} disabled />);

    for (const name of ["Brand: Toyota", "Model: Camry", "Year: 2018", "Generation: XV70 (2017–2024)"]) {
      const button = row(screen, name);
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      fireEvent.press(button);
      expect(sheetOpen(screen)).toBe(false);
    }
  });

  it("shows the locked note in the seller's language", () => {
    const screen = renderMobile(<CarStep initial={filled} disabled />, { locale: "ru" });
    expect(screen.getAllByText("Это поле нельзя изменить после публикации.").length).toBeGreaterThanOrEqual(4);
  });
});
