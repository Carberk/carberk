import node from "@auto-tm/eslint-config/node.mjs";

export default [
  { ignores: ["dist/**"] },
  ...node,
  {
    rules: {

      "import/no-unresolved": "off",
    },
  },
];
