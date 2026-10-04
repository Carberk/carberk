import { beforeEach, expect, it, vi } from "vitest";

import type * as ClientModule from "../../api/client";
import { renderMobile, fireEvent, act, routerMock } from "../../../test/render";

import { OwnerActions } from "./OwnerActions";

const api = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn() }));
vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: api,
}));
beforeEach(() => {
  api.post.mockReset();
  api.delete.mockReset();
});

it("keeps Edit and Mark sold in the sticky bar and navigates Edit", () => {
  const screen = renderMobile(
    <OwnerActions listingId="listing-373" status="active" mode="bar" />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Edit" }));
  expect(routerMock.push).toHaveBeenCalledWith("/listings/listing-373/edit");
  expect(screen.getByRole("button", { name: "Mark as sold" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Archive listing" })).toBeNull();
  screen.rerender(
    <OwnerActions listingId="listing-373" status="sold" mode="bar" />,
  );
  expect(screen.queryByRole("button", { name: "Mark as sold" })).toBeNull();
});
it.each([
  ["active", ["Remove from sale", "Delete"]],
  ["archived", ["Relist", "Delete"]],
  ["sold", ["Delete"]],
] as const)(
  "puts the shared My listings action names, and no Share, in overflow for %s",
  (status, expected) => {
    const screen = renderMobile(
      <OwnerActions listingId="listing-373" status={status} mode="menu" />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "More options" }));
    for (const name of ["Remove from sale", "Relist", "Delete"]) {
      expect(screen.queryByRole("button", { name }) !== null).toBe((expected as readonly string[]).includes(name));
    }
    for (const old of ["Archive listing", "Republish listing", "Share"]) {
      expect(screen.queryByRole("button", { name: old })).toBeNull();
    }
  },
);
it("shows no overflow for a blocked Listing, which allows no owner action", () => {
  const screen = renderMobile(
    <OwnerActions listingId="listing-373" status="banned" mode="menu" />,
  );
  expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
});
it("asks with the shared copy, without the buyer question", () => {
  const screen = renderMobile(
    <OwnerActions listingId="listing-373" status="active" mode="bar" />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Mark as sold" }));
  expect(screen.getByText("Mark as sold?")).toBeTruthy();
  expect(screen.getByText("Buyers will see it as Sold. A sold Listing cannot be put back on sale.")).toBeTruthy();
  expect(screen.queryByText(/buyer from AutoTM/)).toBeNull();
});
it("names the overflow actions in Russian", () => {
  const screen = renderMobile(
    <OwnerActions listingId="listing-373" status="archived" mode="menu" />,
    { locale: "ru" },
  );
  fireEvent.press(screen.getByRole("button", { name: "Другие действия" }));
  expect(screen.getByRole("button", { name: "Вернуть в продажу" })).toBeTruthy();
});
it("requires confirmation before Mark sold, supports cancel and exposes failure", async () => {
  api.post.mockRejectedValue(new Error("offline"));
  const screen = renderMobile(
    <OwnerActions listingId="listing-373" status="active" mode="bar" />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Mark as sold" }));
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Cancel"));
  expect(screen.queryByText("Confirm")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Mark as sold" }));
  await act(async () => {
    fireEvent.press(screen.getByText("Confirm"));
  });
  expect(api.post).toHaveBeenCalledWith(
    "/listings/listing-373/sold",
    {},
    expect.anything(),
  );
  expect(
    await screen.findByText(
      "Action failed. Pull down to refresh or try again.",
    ),
  ).toBeTruthy();
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
