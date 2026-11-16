import type { ModerationTransaction, ModerationUnitOfWork } from "../ports/ModerationUnitOfWork";

const unavailable = async (): Promise<never> => {
  throw new Error("Moderation port unavailable");
};

export class FakeModerationUnitOfWork implements ModerationUnitOfWork {
  constructor(private readonly ports: Partial<ModerationTransaction>) {}

  run<T>(work: (transaction: ModerationTransaction) => Promise<T>): Promise<T> {
    return work({
      listings: { banActiveListing: unavailable, unbanBannedListing: unavailable },
      identity: { suspendUser: unavailable, unsuspendUser: unavailable },
      photos: { release: unavailable },
      reports: { updateStatus: unavailable },
      audit: { create: unavailable },
      ...this.ports,
    });
  }
}
