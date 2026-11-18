import assert from "node:assert/strict";
import test from "node:test";

import { base32Decode, formatDetail, smokeDraftBody, totp } from "./staging-reviewer-flow-smoke.mjs";

test("base32Decode matches the RFC 4648 vectors", () => {
  assert.equal(base32Decode("MZXW6===").toString("utf8"), "foo");
  assert.equal(base32Decode("MZXW6YTB").toString("utf8"), "fooba");
  assert.equal(base32Decode("MZXW6YTBOI======").toString("utf8"), "foobar");
});

test("base32Decode rejects a non-base32 character", () => {
  assert.throws(() => base32Decode("MZXW6!"), /Invalid base32 character/);
});

test("totp matches the RFC 6238 SHA-1 vectors", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 59_000), "287082");
  assert.equal(totp(secret, 1_111_111_109_000), "081804");
  assert.equal(totp(secret, 1_234_567_890_000), "005924");
  assert.equal(totp(secret, 2_000_000_000_000), "279037");
});

test("totp is stable inside a 30-second window and changes across one", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 60_000), totp(secret, 89_999));
  assert.notEqual(totp(secret, 60_000), totp(secret, 90_000));
});

test("formatDetail keeps the timing when there is no detail", () => {
  assert.equal(formatDetail("listingId=abc", 120), "listingId=abc, 120ms");
  assert.equal(formatDetail(undefined, 120), "120ms");
  assert.equal(formatDetail("", 120), "120ms");
});

test("the smoke draft is publishable with the seller's own sign-in phone", () => {
  const catalogue = { brandId: "b", modelId: "m", regionId: "r", cityId: "c" };
  const body = smokeDraftBody({
    catalogue,
    photoKeys: ["uploads/key.jpg", "uploads/two.jpg", "uploads/three.jpg"],
    sellerPhone: "+99361234567",
    now: new Date("2026-10-03T00:00:00Z"),
  });

  assert.equal(body.contactPhone, "+99361234567");
  assert.equal(body.allowCalls, true);
  assert.deepEqual(body.conditionDisclosure, { damaged: false });
  assert.deepEqual(body.photos.map((photo) => photo.key), ["uploads/key.jpg", "uploads/two.jpg", "uploads/three.jpg"]);
  assert.deepEqual(body.photos.map((photo) => photo.sortOrder), [0, 1, 2]);
  assert.equal(body.brandId, "b");
});
