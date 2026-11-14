import { readFileSync } from "fs";
import { resolve } from "path";

import { createElement } from "react";
import { describe, it, expect, vi } from "vitest";

import { renderMobile, fireEvent } from "../test/render";
import { ApiError } from "../src/api/client";

import { ErrorState } from "./ErrorState";

const source = readFileSync(resolve(__dirname, "./ErrorState.tsx"), "utf-8");

describe("ErrorState", () => {
  it("imports useErrorCopy from useErrorCopy", () => {
    expect(source).toContain('import { useErrorCopy } from "@/src/api/useErrorCopy"');
  });

  it("accepts error, onRetry, and compact props", () => {
    expect(source).toContain("error: unknown");
    expect(source).toContain("onRetry?: () => void");
    expect(source).toContain("compact?: boolean");
  });

  it("renders a compact inline layout when compact is true", () => {
    expect(source).toContain("if (compact)");
    expect(source).toContain("flex-row");
  });

  it("marks error surfaces as accessibility alerts", () => {
    expect(source).toContain('accessibilityRole="alert"');
  });

  it("renders a centered full-screen layout by default", () => {
    expect(source).toContain("flex-1 items-center justify-center");
  });

  it("shows a retry button only when the error is retryable and onRetry is provided", () => {
    expect(source).toContain("copy.retryable && onRetry");
  });

  it("displays the mapped title and description", async () => {
    const view = await renderMobile(createElement(ErrorState, { error: new ApiError("NETWORK_ERROR", 0) }));
    expect(view.getByText("No internet connection. Try again when you are online.")).toBeTruthy();
    expect(view.getByText("Check your connection and try again")).toBeTruthy();
  });

  it("renders the error composition above the full-screen title", () => {
    expect(source).toContain('<Illustration name="error"');
  });

  it.each([false, true])("uses a concise feature title and keeps retry working (compact=%s)", async (compact) => {
    const retry = vi.fn();
    const view = await renderMobile(createElement(ErrorState, {
      error: new ApiError("NETWORK_ERROR", 0), title: "No connection", compact, onRetry: retry,
    }));
    expect(view.getByText("No connection")).toBeTruthy();
    expect(view.queryByText("No internet connection. Try again when you are online.")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });
});
