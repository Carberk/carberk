import { resolve } from "node:path";

import { transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";

// `.mts` so Vite loads this config as ESM in a CommonJS package.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{
    name: "native-switch-jsx",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("/@rn-primitives/switch/") && id.endsWith(".mjs")) {
        return transformWithOxc(code, id, { lang: "jsx", jsx: { runtime: "automatic" } });
      }
    },
  }],
  resolve: {
    alias: [
      { find: "@/", replacement: resolve(import.meta.dirname, "./") + "/" },
      { find: /^react-native$/, replacement: resolve(import.meta.dirname, "test/native-host.cjs") },
    ],
  },
  test: {
    // Run the native switch package through Vite: its ESM entry uses an extensionless
    // native import and its published .mjs implementation contains JSX.
    server: { deps: { inline: ["@rn-primitives/switch"] } },
    globals: true,
    environment: "node",
    setupFiles: ["./test/native-setup.ts", "./test/setup.ts"],
    // Expo Router turns every non-`+`-prefixed file under app/ into a route, so
    // test files must never live there. Route-level specs go in test/routes/.
    // scripts/*.test.mjs run under node --test (pnpm test:native-session).
    exclude: ["**/node_modules/**", "**/dist/**", "app/**", "scripts/**"],
    env: {
      EXPO_PUBLIC_API_URL: "http://localhost:3006/api/v1",
      EXPO_PUBLIC_MEDIA_URL: "https://media.autotm.tm",
    },
  },
});
