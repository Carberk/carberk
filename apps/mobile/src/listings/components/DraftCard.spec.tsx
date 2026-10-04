import type { ListingsSchemas } from "@auto-tm/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent } from "../../../test/render";

import { DraftCard } from "./DraftCard";

// The Progress primitive ships an extensionless import Node cannot resolve; the bar is decoration here.
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));

function draft(payload: ListingsSchemas.ListingDraft["payload"]): ListingsSchemas.ListingDraft {
  return { id: "draft-1", userId: "me", createdAt: "2026-09-29T04:00:00.000Z", updatedAt: "2026-09-30T04:00:00.000Z", payload };
}

describe("DraftCard", () => {
  it("resumes on tap and hands ⋯ its title", () => {
    const onResume = vi.fn();
    const onMore = vi.fn();
    const item = draft({ brandId: "lexus", modelId: "rx", year: 2012, currentStep: 3, contactPhone: "+99361234567", allowCalls: true, allowChat: true });
    const view = renderMobile(<DraftCard draft={item} brandName="Lexus" modelName="RX" onResume={onResume} onMore={onMore} />);
    expect(view.getByText("1 of 6 steps filled")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Continue listing 2012 Lexus RX" }));
    expect(onResume).toHaveBeenCalledWith(item);
    fireEvent.press(view.getByRole("button", { name: "Actions for 2012 Lexus RX" }));
    expect(onMore).toHaveBeenCalledWith(item, "2012 Lexus RX");
  });

  it("names a draft with no car yet", () => {
    const view = renderMobile(<DraftCard draft={draft({})} onResume={vi.fn()} onMore={vi.fn()} />);
    expect(view.getByText("Untitled draft")).toBeTruthy();
    expect(view.getByRole("button", { name: "Actions for Untitled draft" })).toBeTruthy();
  });
});
