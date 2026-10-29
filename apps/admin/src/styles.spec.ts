import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const stylesheetPath = fileURLToPath(
  new URL("./app/globals.css", import.meta.url),
);

describe("admin Tailwind entrypoint", () => {
  it("generates shared UI component utilities and theme tokens", async () => {
    const source = await readFile(stylesheetPath, "utf8");
    const result = await postcss([tailwindcss()]).process(source, {
      from: stylesheetPath,
    });

    expect(result.css).toMatch(/\.p-6\s*\{/);
    expect(result.css).toMatch(/\.bg-surface\s*\{/);
    expect(result.css).toMatch(/\.text-text-primary\s*\{/);
    expect(result.css).toContain(
      '--font-sans: "Inter", system-ui, sans-serif;',
    );
    expect(result.css).not.toContain("--font-sans: var(--font-sans);");
  });

  it("uses the semantic palette for language boundaries and focus indicators", async () => {
    const source = await readFile(stylesheetPath, "utf8");

    expect(source).toContain('select[aria-label="Language"]');
    expect(source).toContain('select[aria-label="Язык"]');
    expect(source).toContain('select[aria-label="Dil"]');
    expect(source).toContain("border-color: var(--text-secondary)");
    expect(source).toContain("*:focus-visible");
    expect(source).toContain("outline: 2px solid var(--text-secondary)");
    expect(source).not.toContain("outline-ring/50");
  });
});
