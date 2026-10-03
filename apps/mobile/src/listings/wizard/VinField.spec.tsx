import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { VinField } from "./VinField";

const lockedHelper = {
  en: "This field cannot be changed after publishing.",
  ru: "Это поле нельзя изменить после публикации.",
  tk: "Bu meýdan çap edilenden soň üýtgedip bolmaz.",
} as const;

const vinHelper = {
  en: "Optional. 17 characters. Shown in the Listing's specifications.",
  ru: "Необязательно. 17 символов. Показывается в характеристиках объявления.",
  tk: "Hökman däl. 17 belgi. Bildirişiň aýratynlyklarynda görkezilýär.",
} as const;

const vin = "WBA1234567890ABCD";

describe("VIN field", () => {
  it.each(["en", "ru", "tk"] as const)(
    "explains the Edit lock visibly and accessibly in %s, with a lock icon",
    (locale) => {
      const onChange = vi.fn();
      const screen = renderMobile(
        <VinField payload={{ vin }} onChange={onChange} disabled />,
        { locale },
      );

      expect(screen.getByText(lockedHelper[locale])).toBeTruthy();
      const input = screen.getByLabelText("VIN");
      expect(screen.getByHintText(lockedHelper[locale])).toBe(input);
      expect(input.props.accessibilityState).toEqual({ disabled: true });
      expect(input.props.editable).toBe(false);
      expect(input.props.value).toBe(vin);
      expect(screen.root.findAll((node) => node.type === "Icon" && node.props.name === "Lock"))
        .toHaveLength(1);
      expect(screen.queryByText(vinHelper[locale])).toBeNull();

      fireEvent.changeText(input, "DIFFERENTVIN");
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "ru", "tk"] as const)(
    "keeps Sell editable with its optional helper and no lock in %s",
    (locale) => {
      const onChange = vi.fn();
      const screen = renderMobile(<VinField payload={{}} onChange={onChange} />, { locale });
      const input = screen.getByLabelText("VIN");

      expect(input.props.editable).toBe(true);
      expect(input.props.maxLength).toBe(17);
      expect(screen.getByText(vinHelper[locale])).toBeTruthy();
      expect(screen.getByHintText(vinHelper[locale])).toBe(input);
      expect(screen.queryByText(lockedHelper[locale])).toBeNull();
      expect(screen.root.findAll((node) => node.type === "Icon" && node.props.name === "Lock"))
        .toHaveLength(0);

      fireEvent.changeText(input, vin);
      fireEvent.changeText(input, "  ");
      expect(onChange).toHaveBeenNthCalledWith(1, { vin });
      expect(onChange).toHaveBeenNthCalledWith(2, { vin: undefined });
    },
  );
});
