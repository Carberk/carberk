import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";
import OtpScreen from "../../app/(auth)/otp";
import { ApiError } from "../../src/api/client";

const pendingSession = {
  accessToken: "pending-access",
  refreshToken: "pending-refresh",
  user: {
    id: "00000000-0000-4000-8000-000000000518",
    phone: "+99361234567",
    email: null,
    displayName: null,
    role: "buyer" as const,
    deletionScheduledAt: "2026-11-01T12:00:00.000Z",
  },
};

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  restore: vi.fn(),
  revoke: vi.fn(),
  storeAuthSession: vi.fn(async () => {}),
  navigation: {
    cancel: vi.fn(),
    changeMethod: vi.fn(),
    usePhoneInstead: vi.fn(),
    complete: vi.fn(),
    invalidDestination: vi.fn(),
  },
}));

vi.mock("../../src/api/identity/useVerifyOtp", () => ({
  useVerifyOtp: () => ({ mutateAsync: mocks.verify }),
}));
vi.mock("../../src/api/identity/useRequestOtp", () => ({
  useRequestOtp: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../src/api/identity/useRestoreAccount", () => ({
  useRestoreAccount: () => ({ mutateAsync: mocks.restore }),
}));
vi.mock("../../src/api/identity/useRevokePendingSession", () => ({
  useRevokePendingSession: () => ({ mutateAsync: mocks.revoke }),
}));
vi.mock("../../src/auth/session", () => ({
  storeAuthSession: mocks.storeAuthSession,
}));
vi.mock("../../src/auth/useOtpAuthNavigation", () => ({
  useOtpAuthNavigation: () => mocks.navigation,
}));
vi.mock("../../src/auth/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("../../src/auth/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));
// The code cells need a native text input; this stand-in submits a full code
// and exposes the actions the screen hands to the form.
vi.mock("../../components/auth/CodeEntryForm", async () => {
  const { Pressable, Text, View } = await import("react-native");
  return {
    CodeEntryForm: ({
      verify,
      onContactSupport,
      onUsePhoneInstead,
    }: {
      verify: (code: string) => Promise<void>;
      onContactSupport: () => void;
      onUsePhoneInstead?: () => void;
    }) => (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel="Submit code" onPress={() => verify("123456")}>
          <Text>Submit code</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Contact support" onPress={onContactSupport}>
          <Text>Contact support</Text>
        </Pressable>
        {onUsePhoneInstead ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Use phone instead" onPress={onUsePhoneInstead}>
            <Text>Use phone instead</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

beforeEach(() => {
  Object.values(mocks.navigation).forEach((fn) => fn.mockClear());
  mocks.verify.mockReset();
  mocks.restore.mockReset();
  mocks.revoke.mockReset();
  mocks.storeAuthSession.mockClear();
  mocks.revoke.mockResolvedValue(undefined);
  routeParams.method = "phone";
  routeParams.destination = "+99361234567";
});

async function signInWith(session: typeof pendingSession | (Omit<typeof pendingSession, "user"> & {
  user: Omit<typeof pendingSession.user, "deletionScheduledAt"> & { deletionScheduledAt: null };
})) {
  mocks.verify.mockResolvedValue(session);
  const screen = renderMobile(<OtpScreen />);
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Submit code" }));
  });
  return screen;
}

describe("Sign-in code screen for a User whose deletion is scheduled", () => {
  it("asks before restoring and stores nothing yet", async () => {
    const screen = await signInWith(pendingSession);

    expect(screen.getByText("Account restoration")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.storeAuthSession).not.toHaveBeenCalled();
    expect(mocks.navigation.complete).not.toHaveBeenCalled();
  });

  it("Restore restores the account with the pending session, then stores it and finishes sign-in", async () => {
    mocks.restore.mockResolvedValue({ ...pendingSession.user, deletionScheduledAt: null });
    const screen = await signInWith(pendingSession);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Restore" }));
    });

    expect(mocks.restore).toHaveBeenCalledWith("pending-access");
    expect(mocks.storeAuthSession).toHaveBeenCalledWith({
      ...pendingSession,
      user: { ...pendingSession.user, deletionScheduledAt: null },
    });
    expect(mocks.navigation.complete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Account restoration")).toBeNull();
  });

  it("keeps the prompt open with an error when the restore fails, and can retry", async () => {
    mocks.restore.mockRejectedValueOnce(new Error("offline"));
    const screen = await signInWith(pendingSession);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Restore" }));
    });

    expect(screen.getByText("Account restoration")).toBeTruthy();
    expect(
      screen.getByText(
        "We could not restore your account. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(mocks.storeAuthSession).not.toHaveBeenCalled();
    expect(mocks.navigation.complete).not.toHaveBeenCalled();

    mocks.restore.mockResolvedValueOnce({ ...pendingSession.user, deletionScheduledAt: null });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Restore" }));
    });

    expect(mocks.restore).toHaveBeenCalledTimes(2);
    expect(mocks.storeAuthSession).toHaveBeenCalledTimes(1);
    expect(mocks.navigation.complete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Account restoration")).toBeNull();
  });

  it("sends the User back to sign-in when the pending session has expired, instead of offering a doomed retry", async () => {
    mocks.restore.mockRejectedValueOnce(
      new ApiError("UNAUTHORIZED", 401, "Unauthorized"),
    );
    const screen = await signInWith(pendingSession);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Restore" }));
    });

    expect(
      screen.getByText(
        "Your sign-in has expired. Sign in again to restore your account.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "We could not restore your account. Check your connection and try again.",
      ),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
    });

    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).toHaveBeenCalledWith("pending-refresh");
    expect(mocks.storeAuthSession).not.toHaveBeenCalled();
    expect(mocks.navigation.complete).not.toHaveBeenCalled();
    expect(mocks.navigation.changeMethod).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Account restoration")).toBeNull();
  });

  it("Cancel logs the pending session out on the server, stores nothing and leaves sign-in", async () => {
    const screen = await signInWith(pendingSession);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(mocks.revoke).toHaveBeenCalledWith("pending-refresh");
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.storeAuthSession).not.toHaveBeenCalled();
    expect(mocks.navigation.complete).not.toHaveBeenCalled();
    expect(mocks.navigation.changeMethod).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Account restoration")).toBeNull();
  });
});

describe("Leaving the prompt does not wait on the best-effort revoke", () => {
  it.each([
    ["Cancel", "Cancel"],
    ["Sign in again", "Sign in again"],
  ])("%s navigates back to sign-in while the revoke is still in flight", async (_name, label) => {
    mocks.revoke.mockReturnValue(new Promise(() => {}));
    if (label === "Sign in again") {
      mocks.restore.mockRejectedValueOnce(
        new ApiError("UNAUTHORIZED", 401, "Unauthorized"),
      );
    }
    const screen = await signInWith(pendingSession);
    if (label === "Sign in again") {
      await act(async () => {
        fireEvent.press(screen.getByRole("button", { name: "Restore" }));
      });
    }

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: label }));
    });

    expect(mocks.navigation.changeMethod).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).toHaveBeenCalledWith("pending-refresh");
    expect(mocks.storeAuthSession).not.toHaveBeenCalled();
    expect(screen.queryByText("Account restoration")).toBeNull();
  });
});

describe("Sign-in code screen for a User with no scheduled deletion", () => {
  it("stores the session and finishes sign-in without a prompt", async () => {
    const session = {
      ...pendingSession,
      user: { ...pendingSession.user, deletionScheduledAt: null },
    };
    const screen = await signInWith(session);

    expect(screen.queryByText("Account restoration")).toBeNull();
    expect(mocks.storeAuthSession).toHaveBeenCalledWith(session);
    expect(mocks.navigation.complete).toHaveBeenCalledTimes(1);
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});

describe("Sign-in code screen actions", () => {
  it("opens Help from Contact support", () => {
    const screen = renderMobile(<OtpScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Contact support" }));

    expect(routerMock.push).toHaveBeenCalledWith("/help");
  });

  it("offers Use phone instead on an email code and returns to the phone entry", () => {
    routeParams.method = "email";
    routeParams.destination = "aman@example.com";
    const screen = renderMobile(<OtpScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Use phone instead" }));

    expect(mocks.navigation.usePhoneInstead).toHaveBeenCalledTimes(1);
  });

  it("does not offer Use phone instead on a phone code", () => {
    const screen = renderMobile(<OtpScreen />);

    expect(screen.queryByRole("button", { name: "Use phone instead" })).toBeNull();
  });
});
