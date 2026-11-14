import { createRequire } from "node:module";

// The native host adapter has no layout engine. Run the installed native
// viewability implementation against measured viewport/row fixtures instead.
const require = createRequire(import.meta.url);
const nativeRequire = createRequire(require.resolve("react-native/package.json"));
const { transformFileSync } = require("@babel/core");
const compiled = transformFileSync(nativeRequire.resolve("@react-native/virtualized-lists/Lists/ViewabilityHelper"), {
  babelrc: false,
  configFile: false,
  plugins: ["@babel/plugin-transform-flow-strip-types", "@babel/plugin-transform-modules-commonjs"],
});
const module = { exports: {} };
// List metrics arrive from the supplied native-layout boundary; no native
// ListMetricsAggregator instance is needed by ViewabilityHelper at runtime.
new Function("require", "module", "exports", compiled.code)(
  (id: string) => id === "./ListMetricsAggregator" ? {} : nativeRequire(id), module, module.exports,
);
export const NativeViewability = (module.exports as { default: new (config: unknown) => {
  onUpdate: (...args: unknown[]) => void;
  dispose: () => void;
} }).default;
