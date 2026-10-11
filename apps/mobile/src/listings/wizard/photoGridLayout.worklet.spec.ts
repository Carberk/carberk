import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

import type { getDragTargetIndex } from "./photoGridLayout";

it("can drag across rows using the native serialized worklet (#820)", () => {
  const require = createRequire(import.meta.url);
  const { transformFileSync } = require("@babel/core") as {
    transformFileSync: (filename: string, options: Record<string, unknown>) => { code: string };
  };
  const transformed = transformFileSync(fileURLToPath(new URL("./photoGridLayout.ts", import.meta.url)), {
    babelrc: false,
    configFile: false,
    presets: [require.resolve("babel-preset-expo")],
    plugins: [require.resolve("react-native-worklets/plugin")],
  });
  const exports: Record<string, unknown> = {};
  runInNewContext(transformed.code, { exports, require, global: { Error } });
  const worklet = exports.getDragTargetIndex as {
    __closure: Record<string, unknown>;
    __initData: { code: string };
  };
  // Execute the captured function and closure sent to the UI runtime. Calling
  // the source function directly misses helpers captured before initialization.
  const nativeTarget = runInNewContext(`(${worklet.__initData.code})`) as typeof getDragTargetIndex;
  expect(nativeTarget.call(worklet, { fromIndex: 0, dx: 119, dy: 238, count: 8, tileSize: 111 })).toBe(7);
  expect(nativeTarget.call(worklet, { fromIndex: 7, dx: -119, dy: -238, count: 8, tileSize: 111 })).toBe(0);
});
