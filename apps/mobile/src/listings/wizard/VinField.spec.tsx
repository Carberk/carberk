import { useState } from "react";
import { WizardSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { translateWizardFieldErrors } from "./wizardErrors";
import { VinField } from "./VinField";

const lockedHelper = {
  en: "This field cannot be changed after publishing.",
  ru: "Это поле нельзя изменить после публикации.",
  tk: "Bu meýdan neşir edilenden soň üýtgedilip bilmez.",
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
      expect(screen.root.findAll((node: { type: unknown; props: { name?: string } }) => node.type === "Icon" && node.props.name === "Lock"))
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
      expect(screen.root.findAll((node: { type: unknown; props: { name?: string } }) => node.type === "Icon" && node.props.name === "Lock"))
        .toHaveLength(0);

      fireEvent.changeText(input, vin);
      fireEvent.changeText(input, "  ");
      expect(onChange).toHaveBeenNthCalledWith(1, { vin });
      expect(onChange).toHaveBeenNthCalledWith(2, { vin: null });
    },
  );
});

function ValidatedVin() {
  const [payload, setPayload] = useState<WizardSchemas.WizardDraftPayload>({ brandId: "00000000-0000-4000-8000-000000000001", modelId: "00000000-0000-4000-8000-000000000002", year: 2018 });
  const { t } = useTranslation();
  const errors = translateWizardFieldErrors(t, WizardSchemas.validateStep("vehicle", payload).fieldErrors);
  return <VinField payload={payload} onChange={(updates) => setPayload({ ...payload, ...updates })} error={errors.vin} />;
}
describe("Sell VIN validation", () => {
  it.each([
    ["en", "Enter a 17-character VIN using letters and digits, without I, O or Q."],
    ["ru", "Введите VIN из 17 латинских букв и цифр, без I, O и Q."],
    ["tk", "I, O we Q harplary bolmadyk, 17 harpdan we sandan ybarat VIN giriziň."],
  ])("rejects a short VIN visibly in %s and allows clearing it", (locale, message) => {
    const screen = renderMobile(<ValidatedVin />, { locale });
    fireEvent.changeText(screen.getByLabelText("VIN"), "Corolla");
    expect(screen.getByText(message)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("VIN"), "WBA1234567890ABCD");
    expect(screen.queryByText(message)).toBeNull();
    fireEvent.changeText(screen.getByLabelText("VIN"), "");
    expect(screen.queryByText(message)).toBeNull();
  });
});


it("uppercases a pasted VIN before updating the draft", () => {
  const onChange = vi.fn();
  const screen = renderMobile(<VinField payload={{}} onChange={onChange} />);
  fireEvent.changeText(screen.getByLabelText("VIN"), "wba1234567890abcd");
  expect(onChange).toHaveBeenCalledWith({ vin: "WBA1234567890ABCD" });
});


it("keeps non-ASCII paste invalid while uppercasing ASCII letters", () => {
  const screen = renderMobile(<ValidatedVin />);
  fireEvent.changeText(screen.getByLabelText("VIN"), "wba1234567890abcſ");
  expect(screen.getByText("Enter a 17-character VIN using letters and digits, without I, O or Q.")).toBeTruthy();
});
