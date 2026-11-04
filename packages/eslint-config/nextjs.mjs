import base from "./base.mjs";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
