import { Platform } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, within, getHost } from "../../../test/render";

import { MessageReportSheet } from "./MessageReportSheet";
import { ReportSheet } from "./ReportSheet";

const reports = vi.hoisted(() => ({
  mutate: vi.fn((_payload: unknown, options: { onSuccess: () => void }) => {
    options.onSuccess();
  }),
  reset: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("../../api/admin/useCreateReport", () => ({
  useCreateReport: () => reports,
}));
vi.mock("../../api/admin/useCreateMessageReport", () => ({
  useCreateMessageReport: () => reports,
}));

beforeEach(() => {
  reports.mutate.mockClear();
  reports.reset.mockClear();
});

describe.each(["en", "ru", "tk"])("report success in %s", (locale) => {
  it.each(["listing", "user", "message"] as const)(
    "shows one confirmation after a %s report and keeps Done",
    async (targetType) => {
      const onOpenChange = vi.fn();
      const onReported = vi.fn();
      const view = await renderMobile(
        targetType === "message" ? (
          <MessageReportSheet
            conversationId="conversation-1"
            messageId="message-1"
            open
            onOpenChange={onOpenChange}
            onReported={onReported}
          />
        ) : (
          <ReportSheet
            targetType={targetType}
            targetId="target-1"
            open
            onOpenChange={onOpenChange}
          />
        ),
        { locale },
      );
      const copy = (key: string) => view.i18n.t(key);

      expect(view.queryByText(copy("thanksWeReceived"))).toBeNull();
      await fireEvent.press(view.getByRole("radio", { name: copy("spam") }));
      await fireEvent.press(view.getByRole("button", { name: copy("submitReport") }));

      expect(reports.mutate).toHaveBeenCalledTimes(1);
      expect(reports.mutate).toHaveBeenCalledWith(
        targetType === "message"
          ? { conversationId: "conversation-1", messageId: "message-1", reason: "spam" }
          : { targetType, targetId: "target-1", reason: "spam" },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(view.getAllByText(copy("thanksWeReceived"))).toHaveLength(1);
      expect(view.getByText(copy("report"))).toBeTruthy();
      expect(view.queryByText(copy("selectReason"))).toBeNull();
      expect(view.queryByRole("button", { name: copy("submitReport") })).toBeNull();
      if (targetType === "message") {
        expect(onReported).toHaveBeenCalledTimes(1);
        expect(onReported).toHaveBeenCalledWith("message-1");
      }
      await fireEvent.press(view.getByRole("button", { name: copy("done") }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    },
  );
});

// Load the real sheet composition. The native dialog/portal boundary has no
// Node runtime; its hosts keep content and props without emulating layout.
vi.mock("@/components/ui/sheet", async (importOriginal) => await importOriginal());
vi.mock("@rn-primitives/dialog", async () => {
  const { View, Text, Pressable } = await import("react-native");
  const React = await import("react");
  const context = React.createContext<((open: boolean) => void) | undefined>(undefined);
  const Root = ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange?: (open: boolean) => void }) => <context.Provider value={onOpenChange}><View>{children}</View></context.Provider>;
  const Close = ({ children, asChild }: { children: React.ReactElement<{ onPress?: () => void }>; asChild?: boolean }) => {
    const onOpenChange = React.useContext(context);
    const onPress = () => onOpenChange?.(false);
    return asChild ? React.cloneElement(children, { onPress }) : <Pressable onPress={onPress}>{children}</Pressable>;
  };
  return { Root, useRootContext: () => ({ open: true, onOpenChange: React.useContext(context) }), Portal: View, Overlay: View, Content: View, Trigger: Pressable, Close, Title: Text, Description: Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));

describe.each(["android", "ios"] as const)("report keyboard layout on %s", (os) => {
  it.each(["user", "message"] as const)("keeps %s details scrollable and Submit in the avoidance region", async (targetType) => {
    const previousOS = Platform.OS;
    Platform.OS = os;
    try {
      const view = await renderMobile(targetType === "message" ?
        <MessageReportSheet conversationId="conversation-1" messageId="message-1" open onOpenChange={vi.fn()} /> :
        <ReportSheet targetType="user" targetId="target-1" open onOpenChange={vi.fn()} />);
      await fireEvent.press(view.getByRole("radio", { name: "Other" }));
      await fireEvent.changeText(view.getByPlaceholderText("Describe the issue..."), "Report while typing");
      const avoidance = getHost(view.container, "KeyboardAvoidingView");
      expect(avoidance.props.enabled).toBe(true);
      expect(avoidance.props.behavior).toBe("padding");
      expect(within(avoidance).getByDisplayValue("Report while typing")).toBeTruthy();
      expect(within(avoidance).getByRole("button", { name: "Submit report", disabled: false })).toBeTruthy();
      const scroll = getHost(view.container, "RCTScrollView");
      expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
      expect(within(scroll).getByDisplayValue("Report while typing")).toBeTruthy();
      expect(within(scroll).queryByRole("button", { name: "Submit report" })).toBeNull();
      await fireEvent.press(view.getByRole("button", { name: "Submit report" }));
      expect(view.getByText("Thanks, we received your report.")).toBeTruthy();
    } finally { Platform.OS = previousOS; }
  });
});

describe("Compact report uses the keyboard-free viewport", () => {
  it.each(["user", "message"] as const)("keeps %s details and Submit separate from the pinned Close control", async (targetType) => {
    const onOpenChange = vi.fn();
    const view = await renderMobile(targetType === "message" ?
      <MessageReportSheet conversationId="conversation-1" messageId="message-1" open onOpenChange={onOpenChange} /> :
      <ReportSheet targetType="user" targetId="target-1" open onOpenChange={onOpenChange} />);
    await fireEvent.press(view.getByRole("radio", { name: "Other" }));
    await fireEvent.changeText(view.getByPlaceholderText("Describe the issue..."), "Small-screen report details");
    const submit = view.getByRole("button", { name: "Submit report", disabled: false });
    let content = submit.parent;
    while (content && !content.props.className?.includes("z-50")) content = content.parent;
    if (!content) throw new Error("Sheet content missing");
    expect(content.props.className).toContain("max-h-full");
    expect(content.props.className).toContain("min-h-0 shrink");
    expect(content.props.className).not.toContain("max-h-[70%]");
    const scroll = getHost(view.container, "RCTScrollView");
    expect(within(scroll).getByDisplayValue("Small-screen report details")).toBeTruthy();
    expect(within(scroll).queryByRole("button", { name: "Close" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
