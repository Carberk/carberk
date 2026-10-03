import { describe, expect, it } from "vitest";

import { fireEvent, renderMobile, routerMock } from "../../../test/render";

import { ListingClosedBanner } from "./ListingClosedBanner";

const BRAND_ID = "00000000-0000-4000-8000-0000000000d1";
const MODEL_ID = "00000000-0000-4000-8000-0000000000d2";
const sold = { status: "sold" as const, brandId: BRAND_ID, modelId: MODEL_ID };

describe("ListingClosedBanner", () => {
  it("says the car is sold and links to other cars of the same model", () => {
    const screen = renderMobile(<ListingClosedBanner listing={sold} brandName="Toyota" modelName="Camry" />);

    expect(
      screen.getByText("This car is sold. You can keep talking, but the Listing is no longer available."),
    ).toBeTruthy();
    const link = screen.getByRole("button", { name: "See other Toyota Camry" });
    expect(link.props.className).toMatch(/\bh-11\b/);
    fireEvent.press(link);
    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: "/(tabs)/(search)/results",
      params: { brandId: BRAND_ID, modelId: MODEL_ID },
    });
  });

  it("uses the removed-from-sale text for an archived Listing", () => {
    const screen = renderMobile(
      <ListingClosedBanner listing={{ ...sold, status: "archived" }} brandName="Toyota" modelName="Camry" />,
    );
    expect(
      screen.getByText("This car was removed from sale. You can keep talking, but the Listing is no longer available."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "See other Toyota Camry" })).toBeTruthy();
  });

  it.each([
    ["brand", undefined, "Camry"],
    ["model", "Toyota", undefined],
  ])("omits the link when the %s name is unknown", (_what, brandName, modelName) => {
    const screen = renderMobile(<ListingClosedBanner listing={sold} brandName={brandName} modelName={modelName} />);
    expect(screen.getByText(/This car is sold/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for an active Listing", () => {
    const screen = renderMobile(
      <ListingClosedBanner listing={{ ...sold, status: "active" }} brandName="Toyota" modelName="Camry" />,
    );
    expect(screen.queryByText(/You can keep talking/)).toBeNull();
  });

  it("is localized", () => {
    const screen = renderMobile(<ListingClosedBanner listing={sold} brandName="Toyota" modelName="Camry" />, {
      locale: "ru",
    });
    expect(
      screen.getByText("Автомобиль продан. Вы можете продолжить переписку, но объявление уже недоступно."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Смотреть другие Toyota Camry" })).toBeTruthy();
  });
});
