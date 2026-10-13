import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { act, fireEvent, renderMobile, routerMock } from "../../../test/render";

import { RelistContactPhoneSheet } from "./RelistContactPhoneSheet";

const detail = vi.hoisted(
  () => ({ data: undefined as { contactPhone?: string } | undefined }),
);
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  republish: vi.fn(),
}));
vi.mock("../../api/listings/useListingDetail", () => ({
  useListingDetail: () => ({ data: detail.data }),
}));
vi.mock("../../api/listings/useRequestContactPhoneCode", () => ({
  useRequestContactPhoneCode: () => ({ mutateAsync: mocks.request, isPending: false }),
}));
vi.mock("../../api/listings/useRepublishListing", () => ({
  useRepublishListing: () => ({ mutateAsync: mocks.republish, isPending: false }),
}));

const CODE_SENT = {
  status: "code_sent" as const,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  resendInSeconds: 60,
};
const CONFIRMED = {
  status: "confirmed" as const,
  contactPhone: {
    phone: "+99362000002",
    source: "confirmed" as const,
    confirmedAt: "2026-10-05T12:00:00.000Z",
    reusableUntil: "2026-10-12T12:00:00.000Z",
  },
};

async function renderSheet(open = true, onOpenChange = vi.fn()) {
  const onRelisted = vi.fn();
  const screen = await renderMobile(
    <RelistContactPhoneSheet
      open={open}
      listingId="listing-1"
      returnPathname="/listings/manage"
      onOpenChange={onOpenChange}
      onRelisted={onRelisted}
    />,
  );
  return { screen, onOpenChange, onRelisted };
}

async function pressSendCode(screen: Awaited<ReturnType<typeof renderMobile>>) {
  await act(async () => {
    void fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  });
}

describe("RelistContactPhoneSheet", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
    detail.data = { contactPhone: "+99362000002" };
    mocks.request.mockReset();
    mocks.republish.mockReset().mockResolvedValue({});
  });

  it("offers Send code and Cancel for the Listing's own number, and no other number", async () => {
    const { screen } = await renderSheet();

    expect(screen.getByText("Confirm the contact phone")).toBeTruthy();
    expect(
      screen.getByText(
        "+99362000002 was confirmed more than 7 days ago. Confirm it again to relist.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByText("Another number")).toBeNull();
  });

  it("sends the code to the Listing's number and opens the code screen for a relist", async () => {
    mocks.request.mockResolvedValue(CODE_SENT);
    const { screen, onOpenChange } = await renderSheet();

    await pressSendCode(screen);

    expect(mocks.request).toHaveBeenCalledWith({ phone: "+99362000002" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone-code",
      params: {
        phone: "+99362000002",
        resendInSeconds: "60",
        purpose: "relist",
        listingId: "listing-1",
        returnPathname: "/listings/manage",
      },
    });
    expect(mocks.republish).not.toHaveBeenCalled();
  });

  it("relists without a code when the number is already confirmed", async () => {
    mocks.request.mockResolvedValue(CONFIRMED);
    const { screen, onOpenChange, onRelisted } = await renderSheet();

    await pressSendCode(screen);

    expect(mocks.republish).toHaveBeenCalledWith("listing-1");
    expect(onRelisted).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("says so in the sheet when the relist after an already confirmed number fails", async () => {
    mocks.request.mockResolvedValue(CONFIRMED);
    mocks.republish.mockRejectedValue(new ApiError("INTERNAL", 500));
    const { screen, onOpenChange, onRelisted } = await renderSheet();

    await pressSendCode(screen);

    expect(
      screen.getByText("Action failed. Pull down to refresh or try again."),
    ).toBeTruthy();
    expect(onRelisted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows the daily limit with the one Help link and stays open", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "destination_limit",
        retryInSeconds: 0,
      }),
    );
    const { screen, onOpenChange } = await renderSheet();

    await pressSendCode(screen);

    expect(
      screen.getByText(
        "No more codes to this number today. Try again tomorrow or use another number.",
      ),
    ).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("link", { name: "Help" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(routerMock.push).toHaveBeenCalledWith("/help");
  });

  it("shows the wait of a backoff refusal, with no Help link", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "backoff",
        retryInSeconds: 120,
      }),
    );
    const { screen, onOpenChange } = await renderSheet();

    await pressSendCode(screen);

    expect(
      screen.getByText("Too many requests. Try again in 2:00."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Help" })).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows the offline message and stays open", async () => {
    mocks.request.mockRejectedValue(new ApiError("NETWORK_ERROR", 0));
    const { screen, onOpenChange } = await renderSheet();

    await pressSendCode(screen);

    expect(
      screen.getByText("No internet connection. Try again when you are online."),
    ).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("closes on Cancel without sending or navigating", async () => {
    const { screen, onOpenChange } = await renderSheet();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("keeps Send code shut until the Listing's number loads", async () => {
    detail.data = undefined;
    const { screen } = await renderSheet();

    const sendCode = screen.getByRole("button", { name: "Send code" });
    expect(sendCode.props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => {
      void fireEvent.press(sendCode);
    });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("stays closed when nothing was refused", async () => {
    const { screen } = await renderSheet(false);

    expect(screen.queryByText("Confirm the contact phone")).toBeNull();
  });
});
