import { AccessibilityInfo } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";

import { WizardLayout } from "./WizardLayout";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));

const announcements = (AccessibilityInfo as unknown as { announcements: string[] }).announcements;

function layout(stepTitle: string, stepNumber: number) {
  return (
    <WizardLayout
      routeTitle="Sell car"
      stepTitle={stepTitle}
      stepNumber={stepNumber}
      stepCount={7}
      onBack={() => {}}
      onContinue={() => {}}
      onPublish={() => {}}
      onDiscard={() => {}}
      mode="create"
      editDetourActive={false}
      canContinue
      canPublish={false}
      canGoBack={stepNumber > 1}
      isLastStep={false}
      saveStatus="idle"
      saveError={null}
      onRetrySave={() => {}}
      progressPercent={(stepNumber / 7) * 100}
    >
      {null}
    </WizardLayout>
  );
}

describe("WizardLayout step header", () => {
  beforeEach(() => {
    announcements.length = 0;
  });

  it("shows Step N of 7 and announces the step title with its position when a step opens", () => {
    const screen = renderMobile(layout("Car", 1));

    expect(screen.getByText("Sell car · Step 1 of 7")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
    expect(announcements).toEqual(["Car, Step 1 of 7"]);

    screen.rerender(layout("Details and condition", 2));

    expect(screen.getByRole("header", { name: "Details and condition, Step 2 of 7" })).toBeTruthy();
    expect(announcements).toEqual(["Car, Step 1 of 7", "Details and condition, Step 2 of 7"]);
  });

  it("reads the step position once, in the heading, not again in the top row", () => {
    const screen = renderMobile(layout("Car", 1));

    expect(screen.getByText("Sell car · Step 1 of 7").props.accessibilityLabel).toBe("Sell car");
    expect(screen.getByRole("header", { name: "Car, Step 1 of 7" })).toBeTruthy();
  });

  it("does not announce again when the same step re-renders", () => {
    const screen = renderMobile(layout("Car", 1));
    screen.rerender(layout("Car", 1));

    expect(announcements).toEqual(["Car, Step 1 of 7"]);
  });
});
