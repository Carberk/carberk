import type { Session } from "../../domain/Session";
import type { SessionRepository } from "../../domain/ports/SessionRepository";

export class InMemorySessions implements SessionRepository {
  sessions: Session[] = [];

  async create(): Promise<Session> {
    throw new Error("Not implemented");
  }

  async countByUserId(): Promise<number> {
    return 0;
  }

  async deleteExpiredByUserId(): Promise<number> {
    return 0;
  }

  async deleteOldestByUserId(): Promise<void> {}

  async findByRefreshToken() {
    return null;
  }

  async rotateRefreshToken(): Promise<boolean> {
    return false;
  }

  async findById(id: string): Promise<Session | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async updateAdminTotpExpiresAt(): Promise<void> {}

  async delete(): Promise<void> {}

  async deleteAllByUserId(): Promise<number> {
    return 0;
  }
}
