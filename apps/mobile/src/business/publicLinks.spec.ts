import { afterEach, expect, it, vi } from "vitest";

import { redirectSystemPath } from "../../app/+native-intent";
afterEach(() => vi.unstubAllEnvs());
it("maps supported localized HTTPS reader links to the same native stable-ID target", () => {
 vi.stubEnv("EXPO_PUBLIC_WEB_URL", "https://carberk.example.test");
 const id = "00000000-0000-4000-8000-000000000001";
 expect(redirectSystemPath({ path: `https://carberk.example.test/tk/listings/${id}`, initial: true })).toBe(`/listings/${id}`);
 expect(redirectSystemPath({ path: `https://carberk.example.test/ru/showrooms/${id}/old-slug`, initial: false })).toBe(`/showrooms/${id}`);
 expect(redirectSystemPath({ path: `https://foreign.example.test/en/listings/${id}`, initial: true })).toBe("/");
 expect(redirectSystemPath({ path: "/conversations/open-listing?listingId=existing", initial: false })).toBe("/conversations/open-listing?listingId=existing");
});
