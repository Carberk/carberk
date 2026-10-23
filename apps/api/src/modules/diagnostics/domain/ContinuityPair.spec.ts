import { describe, expect, it } from "vitest";
import { continuityPair } from "./ContinuityPair";
const privateA = { audience: "buyer_private", commissionerId: "a", physicalAuthorized: true };
const publicA = { ...privateA, audience: "listing_public" };
describe("pair audience and public transfer admission", () => {
  it("admits independent public commissioners through comparative attestation", () => {
    expect(() => continuityPair(publicA, { ...publicA, commissionerId: "b" }, "comparative_attestation")).not.toThrow();
  });
  it("retains same-commissioner private admission", () => {
    expect(() => continuityPair(privateA, privateA, "comparative_attestation")).not.toThrow();
  });
  it.each([
    [privateA, { ...privateA, commissionerId: "b" }], [privateA, publicA], [publicA, privateA],
    [publicA, { ...publicA, commissionerId: null }], [publicA, { ...publicA, physicalAuthorized: false }],
  ])("refuses audience, commissioner and independent physical authorization violations", (a,b) => {
    expect(() => continuityPair(a,b,"comparative_attestation")).toThrow("DIAGNOSTIC_NO_ACCESS");
  });
  it("refuses automatic public transfer until unchanged ownership is established", () => {
    expect(() => continuityPair(publicA, { ...publicA, commissionerId: "b" }, "automatic_normalized_vin")).toThrow("DIAGNOSTIC_NO_ACCESS");
  });
});
