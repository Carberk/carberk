import { afterEach, expect, it, vi } from "vitest";

import { GET as apple } from "../app/.well-known/apple-app-site-association/route";
import { GET as android } from "../app/.well-known/assetlinks.json/route";
import { GET as sharing } from "../app/api/marketplace-sharing/route";
afterEach(() => vi.unstubAllEnvs());
it("publishes no invented association or active share capability without configured verified prerequisites", async () => {
 vi.stubEnv("MARKETPLACE_IOS_APP_IDS", ""); vi.stubEnv("MARKETPLACE_ANDROID_ASSOCIATIONS", "");
 expect((await apple()).status).toBe(404); expect((await android()).status).toBe(404);
 expect(await (await sharing()).json()).toEqual({ enabled: false });
});
it("serves exact configured application identity and locale-scoped reader paths", async () => {
 vi.stubEnv("WEB_BASE_URL", "https://carberk.example.test");
 vi.stubEnv("MARKETPLACE_IOS_APP_IDS", "ABCDE12345.tm.auto.app");
 vi.stubEnv("MARKETPLACE_ANDROID_ASSOCIATIONS", JSON.stringify([{ packageName: "com.auto_tm.ynamly", sha256CertFingerprints: [Array(32).fill("AB").join(":")] }]));
 const a = await apple(); expect(a.status).toBe(200); expect(a.headers.get("content-type")).toContain("application/json");
 expect(await a.json()).toEqual({ applinks: { apps: [], details: [{ appID: "ABCDE12345.tm.auto.app", paths: ["/tk/listings/*", "/tk/showrooms/*", "/ru/listings/*", "/ru/showrooms/*", "/en/listings/*", "/en/showrooms/*"] }] } });
 expect(await (await android()).json()).toEqual([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.auto_tm.ynamly", sha256_cert_fingerprints: [Array(32).fill("AB").join(":")] } }]);
 expect(await (await sharing()).json()).toEqual({ enabled: false });
 vi.stubEnv("MARKETPLACE_LINKS_VERIFIED", "true"); vi.stubEnv("API_BASE_URL", "https://api.example.test");
 expect(await (await sharing()).json()).toEqual({ enabled: true });
});
