import { expect, it } from "vitest";

import { FakeObjectStore } from "./FakeObjectStore";

it("lists only matching bucket prefixes and removes only the selected keys", async () => {
  const store = new FakeObjectStore({
    "listing-photos": new Map([["demo/a", Buffer.from("a")], ["foreign/a", Buffer.from("foreign")]]),
    "chat-attachments": new Map([["demo/a", Buffer.from("chat")]]),
  });
  expect(await store.list("demo/")).toEqual(["demo/a"]);
  await store.remove(["demo/a", "missing"]);
  expect([...store.snapshot()]).toEqual([["foreign/a", Buffer.from("foreign")]]);
  expect([...store.snapshot("chat-attachments")]).toEqual([["demo/a", Buffer.from("chat")]]);
  await store.put("demo/b", Buffer.from("new"), "image/webp");
  expect(await store.list("demo/")).toEqual(["demo/b"]);
});

it("refuses both kinds of storage mutation without changing seeded bytes", async () => {
  const store = new FakeObjectStore({ "listing-photos": new Map([["demo/a", Buffer.from("a")]]) }, true);
  await expect(store.put("demo/a", Buffer.from("changed"), "image/webp")).rejects.toThrow("Unexpected storage write");
  await expect(store.remove(["demo/a"])).rejects.toThrow("Unexpected storage write");
  expect([...store.snapshot()]).toEqual([["demo/a", Buffer.from("a")]]);
});
