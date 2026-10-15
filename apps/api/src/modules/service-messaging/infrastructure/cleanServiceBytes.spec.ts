import sharp from "sharp";
import { expect, it } from "vitest";

import { cleanServiceBytes } from "./cleanServiceBytes";

it("stores usable image pixels with EXIF and location metadata removed", async () => {
 const original = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: "Private customer" } }).toBuffer();
 const cleaned = await cleanServiceBytes(original, "image/jpeg", "support");
 const metadata = await sharp(cleaned).metadata();
 expect(metadata.exif).toBeUndefined(); expect(metadata.orientation).toBeUndefined();
 expect(metadata.width).toBe(10); expect(metadata.height).toBe(20);
});
it("preserves original provider PDF bytes and rejects PDF expansion into Support", async () => {
 const pdf = Buffer.from("%PDF-1.4\nsynthetic original report\n%%EOF\n");
 expect(Buffer.from(await cleanServiceBytes(pdf, "application/pdf", "history"))).toEqual(pdf);
 await expect(cleanServiceBytes(pdf, "application/pdf", "support")).rejects.toMatchObject({ code: "INVALID_ATTACHMENT" });
 await expect(cleanServiceBytes(Buffer.from("not a PDF"), "application/pdf", "history")).rejects.toMatchObject({ code: "INVALID_ATTACHMENT" });
});
it("rejects forged image type and oversized input before adoption", async () => {
 await expect(cleanServiceBytes(Buffer.from("not an image"), "image/jpeg", "support")).rejects.toBeDefined();
 await expect(cleanServiceBytes(new Uint8Array(5 * 1024 * 1024 + 1), "image/jpeg", "support")).rejects.toMatchObject({ code: "INVALID_ATTACHMENT" });
});
