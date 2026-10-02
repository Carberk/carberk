import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, routeParams, routerMock } from "../render";
import VerifySignInMethodScreen from "../../app/account/verify-sign-in-method";

vi.mock("../../src/api/identity/useRequestSignInMethodChange", () => ({
  useRequestSignInMethodChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../src/api/identity/useVerifySignInMethodChange", () => ({
  useVerifySignInMethodChange: () => ({ mutateAsync: vi.fn() }),
}));
// The code cells need a native text input; this stand-in exposes the actions
// the screen hands to the form.
vi.mock("../../components/auth/CodeEntryForm", async () => {
  const { Pressable, Text, View } = await import("react-native");
  return {
    CodeEntryForm: ({
      onContactSupport,
      onUsePhoneInstead,
    }: {
      onContactSupport: () => void;
      onUsePhoneInstead?: () => void;
    }) => (
      <View>
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
  routeParams.method = "email";
  routeParams.destination = "aman@example.com";
});

describe("Add or change Sign-in Method code screen", () => {
  it("opens Help from Contact support", () => {
    const screen = renderMobile(<VerifySignInMethodScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Contact support" }));

    expect(routerMock.push).toHaveBeenCalledWith("/help");
  });

  it("never offers Use phone instead outside sign-in", () => {
    const screen = renderMobile(<VerifySignInMethodScreen />);

    expect(screen.queryByRole("button", { name: "Use phone instead" })).toBeNull();
  });
});
