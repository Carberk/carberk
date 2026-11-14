export interface HistoryClock { now(): Date }
export const HISTORY_CLOCK = Symbol("HistoryClock");
export type HistoryWaitReason = "customer_answer" | "quote_choice";
export interface HistoryReminderOutcome {
  messageId: string;
  senderId: string;
  clientMessageId: string;
  text: string;
  order: bigint;
  sentAt: Date;
}
export interface HistoryWaitingFacts {
  reason: HistoryWaitReason | null;
  since: Date | null;
  version: number;
  publicMessageId: string | null;
  publicMessageOrder: bigint;
  used: boolean;
  outcome: HistoryReminderOutcome | null;
  declined: boolean;
  stopped: boolean;
  sourceId: string | null;
  sourceVersion: number;
}
export type HistoryWaitTransition = {
  sourceId: string;
  /** Monotonically ordered lifecycle revision within this request. */
  sourceVersion: number;
  expectedVersion: number;
} & ({ action: "begin"; reason: HistoryWaitReason } | { action: "end" | "decline" | "stop" });
export interface HistoryCommittedMessage {
  id: string;
  order: bigint;
  sentAt: Date;
  author: "operator" | "requester";
  reminder: boolean;
}

/** Dormant policy. The caller must synchronize committed communications before arbitration. */
export class HistoryWaiting {
  constructor(private readonly clock: HistoryClock) {}

  initial(): HistoryWaitingFacts {
    return { reason: null, since: null, version: 0, publicMessageId: null, publicMessageOrder: 0n,
      used: false, outcome: null, declined: false, stopped: false, sourceId: null, sourceVersion: 0 };
  }

  ineligible(facts: HistoryWaitingFacts) {
    if (facts.declined) return "declined";
    if (facts.stopped) return "stopped";
    if (facts.used) return "used";
    if (!facts.reason || !facts.since) return "not_waiting";
    return this.clock.now().getTime() - facts.since.getTime() < 86_400_000 ? "too_early" : null;
  }

  transition(facts: HistoryWaitingFacts, input: HistoryWaitTransition): HistoryWaitingFacts {
    if (!input.sourceId || !Number.isInteger(input.sourceVersion) || input.sourceVersion < 1 || input.sourceVersion > 2147483647) {
      throw new Error("HISTORY_WAITING_CONFLICT");
    }
    if (input.sourceId === facts.sourceId && input.sourceVersion === facts.sourceVersion) return facts;
    if (input.sourceVersion <= facts.sourceVersion || input.expectedVersion !== facts.version || facts.version === 2147483647) {
      throw new Error("HISTORY_WAITING_CONFLICT");
    }
    return { ...facts, reason: input.action === "begin" ? input.reason : null,
      since: input.action === "begin" ? this.clock.now() : null, version: nextVersion(facts),
      declined: facts.declined || input.action === "decline", stopped: facts.stopped || input.action === "stop",
      sourceId: input.sourceId, sourceVersion: input.sourceVersion };
  }

  reduceMessage(facts: HistoryWaitingFacts, message: HistoryCommittedMessage): HistoryWaitingFacts {
    if (message.order <= facts.publicMessageOrder) return facts;
    const waiting = message.reminder ? {} : message.author === "operator"
      ? { reason: "customer_answer" as const, since: message.sentAt } : { reason: null, since: null };
    return { ...facts, ...waiting, publicMessageId: message.id, publicMessageOrder: message.order, version: nextVersion(facts) };
  }

  /** Recover an already committed once-operation, even after reply/decline/stop. */
  recordOutcome(facts: HistoryWaitingFacts, outcome: HistoryReminderOutcome): HistoryWaitingFacts {
    return facts.used ? facts : { ...facts, used: true, outcome, version: nextVersion(facts) };
  }
}

function nextVersion(facts: HistoryWaitingFacts) {
  if (facts.version >= 2147483647) throw new Error("HISTORY_WAITING_CONFLICT");
  return facts.version + 1;
}

/** A held lock permits progress, never rewinding permanent or applied facts. */
export function assertHistoryWaitingProgress(previous: HistoryWaitingFacts, next: HistoryWaitingFacts): void {
  const original = previous.outcome, outcome = next.outcome;
  const changedOutcome = original && (!outcome || original.messageId !== outcome.messageId ||
    original.senderId !== outcome.senderId || original.clientMessageId !== outcome.clientMessageId ||
    original.text !== outcome.text || original.order !== outcome.order || original.sentAt.getTime() !== outcome.sentAt.getTime());
  if (!Number.isInteger(next.version) || next.version <= previous.version || next.version > 2147483647 ||
    next.publicMessageOrder < previous.publicMessageOrder ||
    (next.publicMessageOrder === previous.publicMessageOrder && next.publicMessageId !== previous.publicMessageId) ||
    next.sourceVersion < previous.sourceVersion ||
    (next.sourceVersion === previous.sourceVersion && next.sourceId !== previous.sourceId) ||
    (previous.declined && !next.declined) || (previous.stopped && !next.stopped) ||
    (previous.used && !next.used) || changedOutcome) throw new Error("HISTORY_WAITING_CONFLICT");
}
