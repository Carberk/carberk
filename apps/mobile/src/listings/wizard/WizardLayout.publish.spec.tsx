import type { ComponentProps } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, within } from "../../../test/render";

import { WizardLayout } from "./WizardLayout";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));

type LayoutProps = Partial<ComponentProps<typeof WizardLayout>>;

/** The wizard on Check and publish. */
function check(overrides: LayoutProps = {}) {
  return (
    <WizardLayout
      routeTitle="Sell car"
      stepTitle="Check and publish"
      stepNumber={7}
      stepCount={7}
      onBack={() => {}}
      onContinue={() => {}}
      onPublish={() => {}}
      onClose={() => {}}
      mode="create"
      editDetourActive={false}
      canContinue={false}
      canPublish
      canGoBack
      isLastStep
      saveStatus="saved"
      saveError={null}
      onRetrySave={() => {}}
      progressPercent={100}
      {...overrides}
    >
      {null}
    </WizardLayout>
  );
}

const publish = (screen: Awaited<ReturnType<typeof renderMobile>>) => screen.getByRole("button", { name: "Publish" });
/** Position of a text in the rendered tree, which is the order a screen reader follows. */
const position = (screen: Awaited<ReturnType<typeof renderMobile>>, text: string) => {
  const index = JSON.stringify(screen.toJSON()).indexOf(text);
  expect(index).toBeGreaterThan(-1);
  return index;
};

describe("WizardLayout while publishing (#588)", () => {
  it.each([
    ["en", "Publishing..."],
    ["ru", "Публикация..."],
    ["tk", "Neşir edilýär..."],
  ])("in %s the button reads %s and takes no further taps", async (locale, label) => {
    const onPublish = vi.fn();
    const screen = await renderMobile(check({ isPublishing: true, onPublish }), { locale });

    const button = screen.getByRole("button", { name: label });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await fireEvent.press(button);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("reads Publish and is enabled otherwise", async () => {
    const onPublish = vi.fn();
    const screen = await renderMobile(check({ onPublish }));

    await fireEvent.press(publish(screen));
    expect(onPublish).toHaveBeenCalledOnce();
    expect(screen.queryByText("Publishing...")).toBeNull();
  });
});

describe("WizardLayout publish error (#588)", () => {
  const announcements = (AccessibilityInfo as unknown as { announcements: string[] }).announcements;
  const error = "Could not publish. Your draft is saved. Try again.";
  beforeEach(() => {
    announcements.length = 0;
  });

  it("shows the error above Publish as an alert and announces it once", async () => {
    const screen = await renderMobile(check({ publishError: error }));

    const alert = screen.getByRole("alert");
    expect(alert.props.accessibilityLiveRegion).toBe("assertive");
    expect(within(alert).getByText(error)).toBeTruthy();
    expect(position(screen, error)).toBeLessThan(position(screen, '"Publish"'));
    expect(announcements.filter((message) => message === error)).toHaveLength(1);

    await screen.rerender(check({ publishError: error }));
    expect(announcements.filter((message) => message === error)).toHaveLength(1);
  });

  it("announces the error on Android too, where a new live region may not be read", async () => {
    const os = Platform.OS;
    Platform.OS = "android";
    try {
      await renderMobile(check({ publishError: error }));
    } finally {
      Platform.OS = os;
    }

    expect(announcements.filter((message) => message === error)).toHaveLength(1);
  });

  it("leaves Publish enabled so the seller can try again", async () => {
    const onPublish = vi.fn();
    const screen = await renderMobile(check({ publishError: error, onPublish }));

    await fireEvent.press(publish(screen));
    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("announces a failure again when the same one follows another try", async () => {
    const screen = await renderMobile(check({ publishError: error }));
    await screen.rerender(check({ publishError: null, isPublishing: true }));
    await screen.rerender(check({ publishError: error }));

    expect(announcements.filter((message) => message === error)).toHaveLength(2);
  });

  it("shows no alert without an error", async () => {
    expect((await renderMobile(check())).queryByRole("alert")).toBeNull();
  });
});

describe("WizardLayout publish blockers (#588)", () => {
  const blockers = ["Fill in: Car, Price", "Photos still uploading: 2", "Photos failed: 1. Retry or remove them."];

  it("lists the blockers above a disabled Publish, in the order given", async () => {
    const screen = await renderMobile(check({ canPublish: false, publishBlockers: blockers }));

    expect(publish(screen).props.accessibilityState).toMatchObject({ disabled: true });
    const [missing, uploading, failed] = blockers.map((line) => position(screen, line));
    expect(missing).toBeLessThan(uploading as number);
    expect(uploading).toBeLessThan(failed as number);
    expect(failed).toBeLessThan(position(screen, '"Publish"'));
  });

  it("shows no blocker and an enabled Publish when nothing blocks", async () => {
    const screen = await renderMobile(check({ publishBlockers: [] }));

    expect(publish(screen).props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.queryByTestId("publish-blockers")).toBeNull();
  });
});
