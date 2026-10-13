import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf-8");
}

/** Top-level `key: value` lines and the indented entries of top-level maps, comments removed. */
function workspaceSettings() {
  const settings = new Map<string, string>();
  let section = "";
  for (const raw of readRepoFile("pnpm-workspace.yaml").split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^#.*$/, "");
    const entry = /^(\s*)("?)([^":]+)\2:\s*(.*)$/.exec(line);
    if (!entry) continue;
    const [, indent = "", , key = "", value = ""] = entry;
    if (indent === "") section = key;
    settings.set(indent === "" ? key : `${section}.${key}`, value.replace(/^"(.*)"$/, "$1"));
  }
  return settings;
}

describe("pnpm workspace settings the mobile app depends on", () => {
  it("hoists every dependency to the root node_modules, as Metro expects", () => {
    // pnpm 11+ reads only auth and registry settings from .npmrc, so hoisting
    // has to live in pnpm-workspace.yaml or Metro loses its flat layout.
    expect(workspaceSettings().get("shamefullyHoist")).toBe("true");
    expect(readRepoFile(".npmrc")).not.toMatch(/^\s*shamefully-hoist\s*=/m);
  });

  it("pins react-native-css-interop through workspace overrides (ADR-0048)", () => {
    // pnpm 11+ ignores the `pnpm` field of package.json.
    expect(workspaceSettings().get("overrides.react-native-css-interop")).toBe("0.2.4");
    expect(JSON.parse(readRepoFile("package.json")).pnpm).toBeUndefined();
  });
});
