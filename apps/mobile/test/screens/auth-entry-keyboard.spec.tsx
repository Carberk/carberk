import { TextInput } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { AuthEntryScreen } from "../../components/auth/AuthEntryScreen";
import { KEYBOARD_PLATFORMS, activeKeyboardRegion, onPlatform } from "../keyboardAvoidance";
import { renderMobile, within } from "../render";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false }) }));

describe("Sign-in entry keyboard (#843)", () => {
  it.each(KEYBOARD_PLATFORMS)("keeps the phone field and Get code above the %s keyboard", (os) =>
    onPlatform(os, async () => {
      const view = await renderMobile(
        <AuthEntryScreen method="phone" canSubmit isSubmitting={false}
          onSubmit={async () => {}} onMethodChange={() => {}} onClose={() => {}}>
          <TextInput accessibilityLabel="Phone number" value="65 12 34 56" />
        </AuthEntryScreen>,
      );
      const region = activeKeyboardRegion(view);
      expect(within(region).getByLabelText("Phone number")).toBeTruthy();
      expect(within(region).getByRole("button", { name: "Get code" })).toBeTruthy();
    }));
});
