import { expect, it } from "vitest";

import { renderMobile, fireEvent, routerMock } from "../../test/render";

import { HistoryEntry } from "./HistoryEntry";

it("opens the distinct History workspace without advertising activation or a payable offer", async () => {
 const view = await renderMobile(<HistoryEntry vin="1HGCM82633A004352"/>);
 expect(view.queryByText(/100 TMT/)).toBeNull();
 await fireEvent.press(view.getByRole("button", { name: "Vehicle History" }));
 expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/service-requests", params: { purpose: "history", vin: "1HGCM82633A004352" } });
});
