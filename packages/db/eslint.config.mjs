import nodeConfig from "@auto-tm/eslint-config/node.mjs";

export default [
  { ignores: ["dist/**", "generated/**", "prisma/seed/**", "vitest.config.mts"] },
  ...nodeConfig,
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
