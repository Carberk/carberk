import { resolve } from "path";

import { defineConfig } from "vitest/config";

// Read-only review: same config as vitest.config.ts, but @auto-tm/contracts
// resolves to this worktree's fresh dist instead of the main checkout's stale one.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      { find: "@/", replacement: resolve(__dirname, "./") + "/" },
      { find: /^react-native$/, replacement: resolve(__dirname, "test/native-host.cjs") },
      {
        find: /^@auto-tm\/contracts$/,
        replacement: resolve(__dirname, "../../packages/contracts/dist/index.js"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/native-setup.ts", "./test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "app/**"],
    env: {
      EXPO_PUBLIC_API_URL: "http://localhost:3006/api/v1",
      EXPO_PUBLIC_MEDIA_URL: "https://media.autotm.tm",
    },
  },
});
