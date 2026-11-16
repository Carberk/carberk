import { Inject, Injectable } from "@nestjs/common";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";

export interface LogoutAllInput {
  userId: string;
}

@Injectable()
export class LogoutAll {
  constructor(
    @Inject(IDENTITY_TOKENS.SessionRepository)
    private readonly sessionRepo: SessionRepository,
  ) {}

  async execute(input: LogoutAllInput): Promise<void> {
    await this.sessionRepo.deleteAllByUserId(input.userId);
  }
}
