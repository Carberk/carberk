import definition from "./v1/manifest.json" with { type: "json" };

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const BENCHMARK = freeze(definition);
