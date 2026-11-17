import globals from "globals";

const files = ["*.{js,cjs,mjs}", "scripts/**/*.{js,cjs,mjs}", "infra/**/*.{js,cjs,mjs}"];

export default [
  { ignores: ["**/node_modules/**", ".pnpm-store/**"] },
  {
    files,
    languageOptions: { globals: globals.nodeBuiltin },
    rules: { "no-undef": "error" },
  },
  {
    files: ["*.{js,cjs}", "scripts/**/*.{js,cjs}", "infra/**/*.{js,cjs}"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
];
