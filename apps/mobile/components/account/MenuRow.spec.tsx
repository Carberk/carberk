import { describe, expect, it } from "vitest";

import { renderMobile } from "../../test/render";

import { MenuRow } from "./MenuRow";

const LABEL = "Toyota Land Cruiser Prado, 2021";

describe("MenuRow", () => {
  it("lets a large label wrap unless the row asks for one line", async () => {
    const view = await renderMobile(<MenuRow size="large" label={LABEL} onPress={() => undefined} />);
    expect(view.getByText(LABEL).props.numberOfLines).toBeUndefined();
  });

  it("keeps the label on one line when the row asks for it", async () => {
    const view = await renderMobile(<MenuRow size="large" singleLineLabel label={LABEL} onPress={() => undefined} />);
    expect(view.getByText(LABEL).props.numberOfLines).toBe(1);
  });

  it("draws a danger row in the destructive token, never the brand colour", async () => {
    const view = await renderMobile(<MenuRow label="Delete account" variant="danger" onPress={() => undefined} />);
    const className = String(view.getByText("Delete account").props.className);
    expect(className).toContain("text-destructive");
    expect(className).not.toContain("text-primary");
  });

  it("keeps the row at least 56 pt tall and reads its label, second line and value", async () => {
    const view = await renderMobile(
      <MenuRow label="Email us" sub="help@auto.tm" value="Open" onPress={() => undefined} />,
    );
    const row = view.getByRole("button", { name: "Email us, help@auto.tm, Open" });
    expect(String(row.props.className)).toContain("min-h-14");
  });
});
