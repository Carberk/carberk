import type { VideoCleanupLedger, VideoCleanupObjects } from "./VideoCleanupPorts";
/** Each sweep performs one bounded deletion attempt. PostgreSQL requires a
 * separate later sweep before two observed absences become final deletion. */
export class CleanVideo {
  constructor(private readonly ledger: VideoCleanupLedger, private readonly objects: VideoCleanupObjects, private readonly now: () => Date, private readonly token: () => string) {}
  async execute(): Promise<"unavailable" | "absent" | "retry"> {
    const work = await this.ledger.claim(this.now(), this.token());
    if (!work) return "unavailable";
    try {
      await this.objects.removeAndVerify(work);
      await this.ledger.recordAbsence(work, this.now());
      return "absent";
    } catch (error) {
      const reason = error instanceof Error && /^VIDEO_[A-Z_]{1,70}$/.test(error.message) ? error.message : "VIDEO_CLEANUP_UNAVAILABLE";
      await this.ledger.fail(work, this.now(), reason);
      return "retry";
    }
  }
}
