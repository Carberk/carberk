import type * as Native from "react-native";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile } from "../../../test/render";
import { ConversationHeader } from "../../conversations/components/ConversationHeader";

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  Alert: { alert: vi.fn() },
}));
vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => false),
  openURL: vi.fn(async () => {}),
}));

function header() {
  return renderMobile(<ConversationHeader conversation={undefined} loading={false}
    presence={{ online: false, lastSeenAt: undefined }} callPhone="+99365000000"
    isMuted={false} isBlocked={false} onBack={vi.fn()} onToggleMute={vi.fn()}
    onBlock={vi.fn()} onUnblock={vi.fn()} />);
}

describe("Conversation Android dialer", () => {
  it("dials despite a false package-visibility check", async () => {
    const view = await header();
    await act(async () => { await fireEvent.press(view.getByRole("button", { name: "Call the seller" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99365000000");
  });
  it("shows the number when the dialer fails", async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No dialer"));
    const view = await header();
    await act(async () => { await fireEvent.press(view.getByRole("button", { name: "Call the seller" })); });
    expect(Alert.alert).toHaveBeenCalledWith("Call", "Could not open the dialer. Call +99365000000 manually.");
  });
});
