import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, routeParams } from "../render";
import EmailScreen from "../../app/(auth)/email";
import PhoneScreen from "../../app/(auth)/phone";
import { ApiError } from "../../src/api/client";

const mocks = vi.hoisted(() => ({ requestOtp: vi.fn() }));

vi.mock("../../src/api/identity/useRequestOtp", () => ({
  useRequestOtp: () => ({ mutateAsync: mocks.requestOtp, isPending: false }),
}));
vi.mock("../../src/auth/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("../../src/auth/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));

const DAILY_LIMIT =
  "Too many codes requested for this destination in 24 hours. Try again later.";

function refuse(details?: unknown) {
  mocks.requestOtp.mockRejectedValue(
    new ApiError("RATE_LIMITED", 429, "Too many OTP requests", details),
  );
}

beforeEach(() => {
  mocks.requestOtp.mockReset();
  delete routeParams.phone;
  delete routeParams.email;
  delete routeParams.authRoot;
});

describe("Sign-in entry at the daily code limit", () => {
  it("says the phone hit its 24-hour limit", async () => {
    refuse({ reason: "destination_limit", retryInSeconds: 0 });
    routeParams.phone = "+99361234567";
    const screen = renderMobile(<PhoneScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Get code" }));
    });

    expect(screen.getByText(DAILY_LIMIT)).toBeTruthy();
    expect(screen.queryByText("Contact support")).toBeNull();
  });

  it("says the email hit its 24-hour limit", async () => {
    refuse({ reason: "destination_limit", retryInSeconds: 0 });
    routeParams.email = "aman@example.com";
    const screen = renderMobile(<EmailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Get code" }));
    });

    expect(screen.getByText(DAILY_LIMIT)).toBeTruthy();
  });

  it("keeps the wait-a-moment copy for a backoff refusal", async () => {
    refuse({ reason: "backoff", retryInSeconds: 120 });
    routeParams.email = "aman@example.com";
    const screen = renderMobile(<EmailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Get code" }));
    });

    expect(screen.getByText("Too many requests. Please wait a moment.")).toBeTruthy();
  });
});
