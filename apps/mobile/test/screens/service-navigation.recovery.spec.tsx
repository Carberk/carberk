import { beforeEach, expect, it, vi } from "vitest";

import { ServiceScreen } from "../../src/services/ServiceScreen";
import { BusinessScreen } from "../../src/business/BusinessScreen";
import { InventoryScreen } from "../../src/business/InventoryScreen";
import { EnquiriesScreen } from "../../src/business/EnquiriesScreen";
import { DiagnosticOrders } from "../../src/diagnostics/DiagnosticOrders";
import DiagnosticReportRoute from "../../app/diagnostics/[id]";
import { clearAuthSession } from "../../src/auth/session";
import { renderMobile, fireEvent, routerMock } from "../render";

vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: async () => ({ canceled: true }) }));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: {} }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: async () => {} }));
vi.mock("expo-file-system", () => ({ Paths: { cache: "file:///cache" }, File: class {} }));
beforeEach(async () => { await clearAuthSession(); routerMock.canGoBack.mockReturnValue(false); });
it.each([
 ["services", ServiceScreen, "/(tabs)/services"],
 ["business", BusinessScreen, "/(tabs)/services"],
 ["inventory", InventoryScreen, "/business"],
 ["enquiries", EnquiriesScreen, "/business"],
 ["inspection history", DiagnosticOrders, "/(tabs)/services"],
 ["inspection report", DiagnosticReportRoute, "/diagnostics"],
] as const)("keeps %s escapable on direct entry and in a stack", async (_, Screen, fallback) => {
 const view = await renderMobile(<Screen/>);
 await fireEvent.press(view.getByRole("button", { name: "Back" }));
 expect(routerMock.replace).toHaveBeenCalledWith(fallback);
 routerMock.canGoBack.mockReturnValue(true);
 await fireEvent.press(view.getByRole("button", { name: "Back" }));
 expect(routerMock.back).toHaveBeenCalledOnce();
});
