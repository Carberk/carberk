import { describe, it, expect } from "vitest";

import type {
  IdentityReadPort,
  IdentityUserSummary,
  SellerProfileReadPort,
} from "../../identity/identity.public";
import { IdentitySellerProfileAdapter } from "./IdentitySellerProfileAdapter";

function user(id: string, overrides: Partial<IdentityUserSummary> = {}): IdentityUserSummary {
  return {
    id,
    displayName: null,
    nameNumber: 1000,
    avatarIndex: 3,
    avatarKey: "avatars/a.webp",
    deleted: false,
    role: "user",
    suspendedAt: null,
    suspendedById: null,
    suspensionReason: null,
    ...overrides,
  };
}

class RecordingIdentityRead implements IdentityReadPort {
  readonly batches: string[][] = [];

  constructor(private readonly users: IdentityUserSummary[]) {}

  async findUserById(id: string): Promise<IdentityUserSummary | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async findUsersByIds(ids: string[]): Promise<IdentityUserSummary[]> {
    this.batches.push(ids);
    return this.users.filter((u) => ids.includes(u.id));
  }

  async findBlockedUserIds(): Promise<string[]> {
    return [];
  }

  async isUserBlockedBy(): Promise<boolean> {
    return false;
  }
}

const noProfiles: SellerProfileReadPort = {
  getSellerProfile: async () => null,
};

describe("IdentitySellerProfileAdapter.getCardSellers", () => {
  it("asks identity once per page, for each seller once, however many Listings they own", async () => {
    const identity = new RecordingIdentityRead([
      user("seller-a", { displayName: "Aýgül", nameNumber: 3310 }),
      user("seller-b", { nameNumber: 4821 }),
    ]);
    const adapter = new IdentitySellerProfileAdapter(noProfiles, identity);

    const sellers = await adapter.getCardSellers(["seller-a", "seller-b", "seller-a", "seller-a"]);

    expect(identity.batches).toEqual([["seller-a", "seller-b"]]);
    expect(sellers.get("seller-a")).toEqual({ displayName: "Aýgül", nameNumber: 3310, deleted: false });
    expect(sellers.get("seller-b")).toEqual({ displayName: null, nameNumber: 4821, deleted: false });
  });

  it("does not ask identity for an empty page", async () => {
    const identity = new RecordingIdentityRead([]);
    const adapter = new IdentitySellerProfileAdapter(noProfiles, identity);

    expect((await adapter.getCardSellers([])).size).toBe(0);
    expect(identity.batches).toEqual([]);
  });
});
