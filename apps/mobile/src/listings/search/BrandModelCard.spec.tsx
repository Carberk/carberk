import { Image } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, getAllHosts, queryAllHosts } from "../../../test/render";

import { BrandModelCard } from "./BrandModelCard";

describe("Brand/model card", () => {
  it("uses one compact summary and separate edit and clear actions", async () => {
    const onEdit = vi.fn(); const onClear = vi.fn();
    const view = await renderMobile(<BrandModelCard hasBrand brandName="Toyota" modelNames={["Camry", "Corolla", "RAV4"]} onEdit={onEdit} onClear={onClear} />);
    expect(view.getByText("Toyota Camry, +2")).toBeTruthy();
    expect(view.queryByText("Corolla")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Toyota Camry, +2, Change models" }));
    await fireEvent.press(view.getByLabelText("Clear brand and models"));
    expect(onEdit).toHaveBeenCalledOnce(); expect(onClear).toHaveBeenCalledOnce();
  });
  it("represents all brands or every model of one brand without model chips", async () => {
    const view = await renderMobile(<BrandModelCard hasBrand={false} modelNames={[]} onEdit={vi.fn()} onClear={vi.fn()} />);
    expect(view.getByText("All brands and models")).toBeTruthy(); expect(view.queryByLabelText("Clear brand and models")).toBeNull();
    await view.rerender(<BrandModelCard hasBrand brandName="Toyota" modelNames={[]} onEdit={vi.fn()} onClear={vi.fn()} />);
    expect(view.getByText("All models · choose models")).toBeTruthy();
  });
  it("shows the chosen brand's logo, or its letter when there is none, instead of the generic car", async () => {
    const view = await renderMobile(<BrandModelCard hasBrand brandName="Toyota" brandLogoUrl="https://files.test/toyota.png" modelNames={[]} onEdit={vi.fn()} onClear={vi.fn()} />);
    expect(getAllHosts(view.container, "Image").map((image) => image.props.source)).toEqual([{ uri: "https://files.test/toyota.png" }]);
    expect(queryAllHosts(view.container, "Icon", { name: "Car" })).toHaveLength(0);
    await view.rerender(<BrandModelCard hasBrand brandName="Toyota" modelNames={[]} onEdit={vi.fn()} onClear={vi.fn()} />);
    expect(queryAllHosts(view.container, "Image")).toHaveLength(0);
    expect(view.getByText("T", { includeHiddenElements: true })).toBeTruthy();
    expect(queryAllHosts(view.container, "Icon", { name: "Car" })).toHaveLength(0);
  });
  it("keeps the generic car when no brand is chosen", async () => {
    const view = await renderMobile(<BrandModelCard hasBrand={false} modelNames={[]} onEdit={vi.fn()} onClear={vi.fn()} />);
    expect(queryAllHosts(view.container, "Icon", { name: "Car" })).toHaveLength(1);
    expect(view.queryByText("T", { includeHiddenElements: true })).toBeNull();
  });
});
