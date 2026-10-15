export class ListingDraft {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly payload: Record<string, unknown>,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly businessId?: string,
  ) {}

  static create(data: {
    businessId?: string | undefined;
    id: string;
    userId: string;
    payload?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
  }): ListingDraft {
    return new ListingDraft(
      data.id,
      data.userId,
      data.payload ?? {},
      data.createdAt ?? new Date(),
      data.updatedAt ?? new Date(),
      data.businessId,
    );
  }

  updatePayload(
    payload: Record<string, unknown>,
    updatedAt: Date,
  ): ListingDraft {
    return new ListingDraft(
      this.id,
      this.userId,
      payload,
      this.createdAt,
      updatedAt,
      this.businessId,
    );
  }
}
