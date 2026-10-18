import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { renderMobile, fireEvent, routerMock } from "../../test/render";
import { server } from "../../test/msw";
import { ShowroomScreen } from "./ShowroomScreen";
const id = "00000000-0000-4000-8000-000000000001";
const listingId = "00000000-0000-4000-8000-000000000002";
const business = { id, name: "Ahal Motors", slug: "ahal", logoUrl: null, city: null, identityChecked: false, contactPhone: null };
it.each([["en", "Available cars"], ["ru", "Автомобили в продаже"], ["tk", "Satuwdaky awtoulaglar"]])("renders an anonymous empty showroom in %s without inventing inventory", async (locale, heading) => {
 server.use(http.get("*/public-marketplace/showrooms/:id", () => HttpResponse.json({ business, listings: [], nextCursor: null })));
 const screen = await renderMobile(<ShowroomScreen businessId={id} />, { locale });
 expect(await screen.findByText("Ahal Motors")).toBeTruthy(); expect(screen.getByText(heading ?? "")).toBeTruthy();
});
it("opens a real active car without replacing the listing-scoped enquiry flow", async () => {
 server.use(http.get("*/public-marketplace/showrooms/:id", () => HttpResponse.json({ business, listings: [{ id: listingId, status: "active", brand: { tk: "Toyota", ru: "Toyota", en: "Toyota" }, model: { tk: "Camry", ru: "Camry", en: "Camry" }, year: 2020, priceAmount: 100000, priceCurrency: "TMT", mileageKm: null, description: null, city: { tk: "Aşgabat", ru: "Ашхабад", en: "Ashgabat" }, photos: [], business, allowChat: true, contactPhone: null }], nextCursor: null })));
 const screen = await renderMobile(<ShowroomScreen businessId={id} />); await screen.findByText("Toyota Camry 2020");
 await fireEvent.press(screen.getByRole("button", { name: "Toyota Camry 2020" }));
 expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/listings/[id]", params: { id: listingId } });
 expect(screen.queryByText("Message")).toBeNull();
});
