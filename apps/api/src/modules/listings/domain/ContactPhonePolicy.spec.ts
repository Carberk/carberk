import { ContactPhonePolicy } from "./ContactPhonePolicy";
import { VerifiedContactPhone } from "./VerifiedContactPhone";
import { InMemoryBusinessContactPhones } from "../application/testing/InMemoryBusinessContactPhones";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryContactPhones } from "../application/testing/InMemoryContactPhones";

const now = new Date("2026-10-10T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("ContactPhonePolicy", () => {
  let phones: InMemoryContactPhones;

  beforeEach(() => {
    phones = new InMemoryContactPhones();
  });

  it("accepts the seller's own sign-in phone without a code", async () => {
    expect(await phones.policy.standing("user-1", "+99361234567", now)).toEqual({
      kind: "account",
    });
  });

  it("accepts a number the seller confirmed less than 7 days ago", async () => {
    phones.confirm("user-1", "+99365123456", new Date(now.getTime() - 6 * DAY));

    const standing = await phones.policy.standing("user-1", "+99365123456", now);

    expect(standing.kind).toBe("confirmed");
    expect(standing.kind === "confirmed" && standing.confirmation.phone).toBe("+99365123456");
  });

  it("reports an expired confirmation once its 7 days have ended", async () => {
    phones.confirm("user-1", "+99365123456", new Date(now.getTime() - 7 * DAY));

    expect(await phones.policy.standing("user-1", "+99365123456", now)).toEqual({
      kind: "expired",
    });
  });

  it("reports a number nobody confirmed, or that another seller confirmed, as not confirmed", async () => {
    phones.confirm("user-2", "+99365123456", now);

    expect(await phones.policy.standing("user-1", "+99365123456", now)).toEqual({
      kind: "not_confirmed",
    });
  });

  it("does not treat another User's sign-in phone as the seller's", async () => {
    phones.signInPhones.set("user-2", "+99365123456");

    expect(await phones.policy.standing("user-1", "+99365123456", now)).toEqual({
      kind: "not_confirmed",
    });
  });

  it.each([undefined, null, "", "   "])("reports %j as missing", async (phone) => {
    expect(await phones.policy.standing("user-1", phone, now)).toEqual({ kind: "missing" });
  });
});

describe("business contact proof", () => {
 it("requires business proof even when the actor has a valid account or personal contact phone", async () => {
  const personal = new InMemoryContactPhones();
  personal.confirm("user-1", "+99365123456", now);
  const business = new InMemoryBusinessContactPhones();
  const policy = new ContactPhonePolicy(personal, personal, business);
  expect(await policy.standing("user-1", "+99361234567", now, "business")).toEqual({ kind: "not_confirmed" });
  expect(await policy.standing("user-1", "+99365123456", now, "business")).toEqual({ kind: "not_confirmed" });
 });
 it("shares one business-owned confirmation across staff and expires new use exactly after seven days", async () => {
  const personal = new InMemoryContactPhones(); const business = new InMemoryBusinessContactPhones();
  const proof = VerifiedContactPhone.create({ sellerId: "business", phone: "+99365123456", confirmedAt: now });
  await business.record(proof); const policy = new ContactPhonePolicy(personal, personal, business);
  expect((await policy.standing("sales", proof.phone, new Date("2026-10-17T11:59:59.999Z"), "business")).kind).toBe("confirmed");
  expect(await policy.standing("sales", proof.phone, new Date("2026-10-17T12:00:00.000Z"), "business")).toEqual({ kind: "expired" });
  expect(await policy.standing("sales", "+99365111222", now, "business")).toEqual({ kind: "not_confirmed" });
  expect(await policy.standing("sales", proof.phone, now, "other-business")).toEqual({ kind: "not_confirmed" });
 });
});
