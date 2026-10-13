import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";

import Step4Specs from "./Step4Specs";

vi.mock("../../api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));

interface RenderedNode {
  type: string;
  props: Record<string, unknown>;
  children: (RenderedNode | string)[] | null;
}

function textOf(node: RenderedNode | string): string {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

/**
 * The controls a screen reader reaches, in tree order: buttons, radios and text
 * inputs, each named by its accessibility label, placeholder or visible text.
 */
function controlsInOrder(tree: unknown): string[] {
  const controls: string[] = [];
  const walk = (node: RenderedNode | string | null) => {
    if (node === null || typeof node === "string") return;
    const role = node.props.accessibilityRole ?? node.props.role;
    if (role === "button" || role === "radio") {
      controls.push((node.props.accessibilityLabel as string | undefined) ?? textOf(node));
      return;
    }
    if (node.type === "TextInput") {
      controls.push(String(node.props.placeholder ?? "input"));
      return;
    }
    (node.children ?? []).forEach(walk);
  };
  const roots = Array.isArray(tree) ? tree : [tree];
  roots.forEach((root) => walk(root as RenderedNode | null));
  return controls;
}

const noop = () => undefined;

describe("Step4Specs order (prototype bSpecs)", () => {
  it("reads Condition, Mileage, Damaged, Known issues, then the optional specs, for a Used car", async () => {
    const screen = await renderMobile(
      <Step4Specs payload={{ condition: "used", mileageKm: 1000 }} onChange={noop} />,
    );

    expect(controlsInOrder(screen.toJSON())).toEqual([
      "New",
      "Used",
      "e.g. 50000",
      "Damaged / needs repair: Yes",
      "Damaged / needs repair: No",
      "Describe known problems or damage...",
      "Select body type",
      "Select transmission",
      "Select engine type",
      "Select drive type",
      "Select color",
      "e.g. 150",
    ]);
  });

  it("reaches Known issues right after Condition for a New car", async () => {
    const screen = await renderMobile(
      <Step4Specs
        payload={{ condition: "new", conditionDisclosure: { damaged: false } }}
        onChange={noop}
      />,
    );

    expect(controlsInOrder(screen.toJSON())).toEqual([
      "New",
      "Used",
      "Describe known problems or damage...",
      "Select body type",
      "Select transmission",
      "Select engine type",
      "Select drive type",
      "Select color",
      "e.g. 150",
    ]);
  });

  it("shows the field labels in the same order as the controls", async () => {
    const screen = await renderMobile(
      <Step4Specs payload={{ condition: "used", mileageKm: 1000 }} onChange={noop} />,
    );
    const text = JSON.stringify(screen.toJSON());
    const labels = [
      "Condition",
      "Mileage",
      "Damaged / needs repair",
      "Known issues",
      "More details (optional)",
      "Body type",
      "Transmission",
      "Engine type",
      "Drive type",
      "Color",
      "Power",
    ];
    const positions = labels.map((label) => text.indexOf(`"${label}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("drops the Drivetrain and Engine boxes in favour of one More details group", async () => {
    const screen = await renderMobile(
      <Step4Specs payload={{ condition: "new", conditionDisclosure: { damaged: false } }} onChange={noop} />,
    );

    expect(screen.queryByText("Drivetrain")).toBeNull();
    expect(screen.queryByText("Engine")).toBeNull();
    expect(screen.getAllByRole("header", { name: "More details (optional)" })).toHaveLength(1);
  });

  it.each([
    ["en", "More details (optional)"],
    ["ru", "Дополнительно (необязательно)"],
    ["tk", "Goşmaça (hökman däl)"],
  ])("labels the optional group in %s", async (locale, label) => {
    const screen = await renderMobile(
      <Step4Specs payload={{ condition: "new", conditionDisclosure: { damaged: false } }} onChange={noop} />,
      { locale },
    );

    expect(screen.getByRole("header", { name: label })).toBeTruthy();
  });
});
