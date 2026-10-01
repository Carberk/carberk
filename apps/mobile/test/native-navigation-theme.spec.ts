import { describe, expect, it } from "vitest";

import { NAV_THEME } from "@/lib/theme";

// `@react-navigation/native` is not mocked here: this runs against the stub that
// `native-setup.ts` registers for every spec.
describe("Navigation theme stub", () => {
  it("lets the real theme module derive both schemes without the native runtime", () => {
    expect(NAV_THEME.light.dark).toBe(false);
    expect(NAV_THEME.dark.dark).toBe(true);
    expect(NAV_THEME.light.colors.background).toBe("hsl(0 0% 100%)");
    expect(NAV_THEME.dark.colors.text).toBe("hsl(60 10% 98%)");
  });
});
