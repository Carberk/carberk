import expo from "@auto-tm/eslint-config/expo.mjs";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...expo,
  globalIgnores([
    ".expo/**",
    "modules/listing-video/android/build/**",
    "assets/**",
    "scripts/**",
    "eslint.config.mjs",
    "expo-env.d.ts",
    "nativewind-env.d.ts",
    "metro.config.js",
    "babel.config.js",
    "tailwind.config.js",
  ]),
  {
    settings: {
      "import/ignore": ["react-native", "eslint/config"],
    },
    rules: {
      "import/no-unresolved": "off",
      "import/namespace": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@auto-tm/ui/components",
              message:
                "Mobile must use React Native Reusables from @/components/ui/*; @auto-tm/ui/components is web/admin only.",
            },
          ],
          patterns: [
            {
              group: ["@auto-tm/ui/components/*"],
              message:
                "Mobile must use React Native Reusables from @/components/ui/*; @auto-tm/ui/components is web/admin only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
