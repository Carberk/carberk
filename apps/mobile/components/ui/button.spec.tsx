import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "button.tsx"), "utf-8");

// Slice the source into two halves so we don't confuse buttonVariants with buttonTextVariants
const textVariantsStart = source.indexOf("const buttonTextVariants");
const textVariantsSource = source.slice(textVariantsStart);

describe("buttonVariants", () => {
  it("has pill size with h-control-lg rounded-full px-6", () => {
    expect(source).toContain("pill: 'h-control-lg rounded-full px-6'");
  });

  it.each([
    "default",
    "brand",
    "destructive",
    "outline",
    "secondary",
    "ghost",
  ])("%s variant includes disabled:bg-muted", (variant) => {
    const idx = source.indexOf(`${variant}:`);
    expect(idx).toBeGreaterThan(-1);
    const snippet = source.slice(idx, idx + 400);
    expect(snippet).toContain("disabled:bg-muted");
  });

  it.each(["default", "brand", "destructive", "secondary", "ghost"])(
    "%s variant includes disabled:border and disabled:border-border",
    (variant) => {
      const idx = source.indexOf(`${variant}:`);
      const snippet = source.slice(idx, idx + 400);
      expect(snippet).toContain("disabled:border");
      expect(snippet).toContain("disabled:border-border");
    }
  );

  it("outline variant includes disabled:bg-muted and disabled:border-border", () => {
    const idx = source.indexOf("outline:");
    const snippet = source.slice(idx, idx + 400);
    expect(snippet).toContain("disabled:bg-muted");
    expect(snippet).toContain("disabled:border-border");
  });

  it("brand variant removes shadow when disabled", () => {
    const idx = source.indexOf("brand:");
    const snippet = source.slice(idx, idx + 400);
    expect(snippet).toContain("disabled:shadow-none");
  });

  it("destructive variant removes shadow when disabled", () => {
    const idx = source.indexOf("destructive:");
    const snippet = source.slice(idx, idx + 400);
    expect(snippet).toContain("disabled:shadow-none");
  });
});

describe("buttonTextVariants", () => {
  it("has matching pill size entry", () => {
    expect(textVariantsSource).toContain("pill: ''");
  });

  it.each([
    "default",
    "brand",
    "destructive",
    "outline",
    "secondary",
    "ghost",
    "link",
  ])("%s variant includes disabled:text-muted-foreground", (variant) => {
    const idx = textVariantsSource.indexOf(`${variant}:`);
    expect(idx).toBeGreaterThan(-1);
    const snippet = textVariantsSource.slice(idx, idx + 300);
    expect(snippet).toContain("disabled:text-muted-foreground");
  });
});

describe("Button component", () => {
  it("does not apply opacity-50 when disabled", () => {
    expect(source).not.toContain("props.disabled && 'opacity-50'");
    expect(source).not.toContain("opacity-50");
  });
});
