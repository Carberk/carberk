import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AddEmailScreen from "../../app/account/add-email";
import AddPhoneScreen from "../../app/account/add-phone";
import SignInMethodTakenScreen from "../../app/account/sign-in-method-taken";
import VerifySignInMethodScreen from "../../app/account/verify-sign-in-method";
import type { CodeEntryForm } from "../../components/auth/CodeEntryForm";
import { ApiError } from "../../src/api/client";
import { signInMethodNoticeStore } from "../../src/auth/signInMethodNotice";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

type CodeEntryProps = ComponentProps<typeof CodeEntryForm>;

// Metro defines it in the app; the entry screens read it for the dev code.
vi.stubGlobal("__DEV__", false);

const state = vi.hoisted(() => ({
  me: { phone: "+99365123456" as string | null, email: "aman@example.com" as string | null },
  verify: vi.fn(),
  requestCode: vi.fn(),
  codeEntry: null as CodeEntryProps | null,
}));

vi.mock("../../src/api/identity/useMe", () => ({ useMe: () => ({ data: state.me }) }));
vi.mock("../../src/api/identity/useVerifySignInMethodChange", () => ({
  useVerifySignInMethodChange: () => ({ mutateAsync: state.verify }),
}));
vi.mock("../../src/api/identity/useRequestSignInMethodChange", () => ({
  useRequestSignInMethodChange: () => ({ mutateAsync: state.requestCode, isPending: false }),
}));
// The code cells need a device; the screen's own behaviour is what it does with `verify`.
vi.mock("../../components/auth/CodeEntryForm", () => ({
  CodeEntryForm: (props: CodeEntryProps) => {
    state.codeEntry = props;
    return null;
  },
}));

beforeEach(() => {
  state.me = { phone: "+99365123456", email: "aman@example.com" };
  state.verify.mockReset();
  state.requestCode.mockReset().mockResolvedValue({ resendInSeconds: 60 });
  state.codeEntry = null;
  signInMethodNoticeStore.setState({ notice: null });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function openVerify(params: Record<string, string>) {
  Object.assign(routeParams, { resendInSeconds: "60", ...params });
  const view = renderMobile(<VerifySignInMethodScreen />);
  const verify = state.codeEntry?.verify;
  if (!verify) throw new Error("CodeEntryForm was not rendered");
  return { view, verify };
}

const TAKEN = new ApiError("SIGN_IN_METHOD_TAKEN", 409);

describe("Confirming a new Sign-in Method", () => {
  it("returns to Profile and says the phone was changed", async () => {
    state.verify.mockResolvedValue({});
    const { verify } = openVerify({ method: "phone", destination: "+99361000000", kind: "change" });
    await act(() => verify("123456"));
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/profile");
    expect(signInMethodNoticeStore.getState().notice).toEqual({ kind: "changed", value: "+993 61 XX-XX-00" });
  });

  it("says an email was added", async () => {
    state.verify.mockResolvedValue({});
    const { verify } = openVerify({ method: "email", destination: "new@example.com", kind: "add" });
    await act(() => verify("123456"));
    expect(signInMethodNoticeStore.getState().notice).toEqual({ kind: "added", value: "n•••@example.com" });
  });

  it("opens the refused state on SIGN_IN_METHOD_TAKEN instead of an inline error", async () => {
    state.verify.mockRejectedValue(TAKEN);
    const { verify } = openVerify({ method: "email", destination: "taken@example.com", kind: "add" });
    // Resolving tells the shared form there is no error to print.
    await act(() => verify("123456"));
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/profile");
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/account/sign-in-method-taken", params: { method: "email" } });
    expect(signInMethodNoticeStore.getState().notice).toBeNull();
  });

  it("leaves other errors to the code form", async () => {
    state.verify.mockRejectedValue(new ApiError("INVALID_OTP", 400));
    const { verify } = openVerify({ method: "phone", destination: "+99361000000", kind: "change" });
    await expect(verify("123456")).rejects.toMatchObject({ code: "INVALID_OTP" });
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("does not open the refused state after the User has left the code screen", async () => {
    const pending = deferred<unknown>();
    state.verify.mockReturnValue(pending.promise);
    const { view, verify } = openVerify({ method: "phone", destination: "+99361000000", kind: "change" });
    const result = verify("123456");
    view.unmount();
    pending.reject(TAKEN);
    await act(() => result);
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("keeps the User where they went when the change lands after they left", async () => {
    const pending = deferred<unknown>();
    state.verify.mockReturnValue(pending.promise);
    const { view, verify } = openVerify({ method: "phone", destination: "+99361000000", kind: "change" });
    const result = verify("123456");
    view.unmount();
    pending.resolve({});
    await act(() => result);
    // Not pulled back to Profile; Profile says what changed when they reach it.
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
    expect(signInMethodNoticeStore.getState().notice).toEqual({ kind: "changed", value: "+993 61 XX-XX-00" });
  });
});

describe("Refused value", () => {
  it.each([
    ["phone", "This number is used by another account. Sign in with it instead, or use a different number.", "Use a different number", "/account/add-phone"],
    ["email", "This email is used by another account. Sign in with it instead, or use a different email.", "Use a different email", "/account/add-email"],
  ])("explains a taken %s and offers one way forward", (method, sentence, action, href) => {
    routeParams.method = method;
    const view = renderMobile(<SignInMethodTakenScreen />);
    expect(view.getByText(sentence)).toBeTruthy();
    expect(view.getByText("Accounts are never merged.")).toBeTruthy();
    // Back and the one action; no switch-account control.
    expect(view.getAllByRole("button")).toHaveLength(2);
    fireEvent.press(view.getByRole("button", { name: action }));
    expect(routerMock.replace).toHaveBeenCalledWith(href);
  });

  it("goes back to Profile", () => {
    routeParams.method = "phone";
    const view = renderMobile(<SignInMethodTakenScreen />);
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });

  it.each(["ru", "tk"])("reads in %s", (locale) => {
    routeParams.method = "email";
    const view = renderMobile(<SignInMethodTakenScreen />, { locale });
    expect(view.getByText(view.i18n.t("auth:emailTaken"))).toBeTruthy();
    expect(view.getByText(view.i18n.t("account:accountsNeverMerged"))).toBeTruthy();
    expect(view.getByRole("button", { name: view.i18n.t("account:useDifferentEmail") })).toBeTruthy();
  });
});

describe("Entering the value the User already has", () => {
  it("refuses the same phone without sending a code", () => {
    const view = renderMobile(<AddPhoneScreen />);
    fireEvent.changeText(view.getByLabelText("Phone number"), "65123456");
    fireEvent.press(view.getByRole("button", { name: "Get code" }));
    expect(view.getByText("This is already your number.")).toBeTruthy();
    expect(state.requestCode).not.toHaveBeenCalled();
  });

  it("refuses the same email, whatever its case, without sending a code", () => {
    const view = renderMobile(<AddEmailScreen />);
    fireEvent.changeText(view.getByLabelText("Email"), " Aman@Example.com ");
    fireEvent.press(view.getByRole("button", { name: "Get code" }));
    expect(view.getByText("This is already your email.")).toBeTruthy();
    expect(state.requestCode).not.toHaveBeenCalled();
  });

  it("sends a code for a different phone and says whether it adds or changes", async () => {
    const view = renderMobile(<AddPhoneScreen />);
    fireEvent.changeText(view.getByLabelText("Phone number"), "61000000");
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Get code" })); });
    expect(state.requestCode).toHaveBeenCalledWith({ phone: "+99361000000" });
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "/account/verify-sign-in-method",
      params: expect.objectContaining({ method: "phone", kind: "change" }),
    }));
  });

  it("marks a first email as an add", async () => {
    state.me = { phone: "+99365123456", email: null };
    const view = renderMobile(<AddEmailScreen />);
    fireEvent.changeText(view.getByLabelText("Email"), "new@example.com");
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Get code" })); });
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ method: "email", kind: "add" }),
    }));
  });

  it.each(["ru", "tk"])("reads the refusal in %s", (locale) => {
    const view = renderMobile(<AddPhoneScreen />, { locale });
    fireEvent.changeText(view.getByLabelText(view.i18n.t("auth:phoneLabel")), "65123456");
    fireEvent.press(view.getByRole("button", { name: view.i18n.t("auth:getCode") }));
    expect(view.getByText(view.i18n.t("account:samePhoneError"))).toBeTruthy();
  });
});
