import { describe, expect, it } from "vitest";
import { PreparedTransactionDatabase } from "../../../common/application/testing/PreparedTransactionDatabase";
import { PrismaIdentityAdminRepository } from "./PrismaIdentityAdminRepository";

describe("Identity suspension", () => {
 it("revokes only the suspended User's Sessions through its standalone prepared transaction", async () => {
  const memory = new PreparedTransactionDatabase();
  memory.seed("user", { id: "sender", suspendedAt: null, suspendedById: null, suspensionReason: null });
  memory.seed("session", { id: "s1", userId: "sender" }, { id: "s2", userId: "sender" }, { id: "foreign", userId: "other" });
  const identity = new PrismaIdentityAdminRepository(memory.client);
  expect(await identity.suspendUser("sender", "admin", "Spam")).toMatchObject({ suspendedById: "admin", suspensionReason: "Spam" });
  expect(memory.rows("session")).toEqual([{ id: "foreign", userId: "other" }]);
 });
});
