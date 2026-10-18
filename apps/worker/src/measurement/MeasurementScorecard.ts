import type { ImprovementSchemas, MeasurementSchemas } from "@auto-tm/contracts";

export interface ScorecardFact {
  subject: string;
  kind: "account" | "guest";
  /** Trusted source classification. This is never accepted from an event payload. */
  conversionEligible: boolean;
  event: MeasurementSchemas.MeasurementEvent;
}
export interface ScorecardInput {
  from: Date;
  to: Date;
  asOf: Date;
  completeThrough: Date;
  facts: readonly ScorecardFact[];
}
export interface ScorecardRate {
  state: "ready" | "empty" | "immature" | "delayed";
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  smallSample: boolean;
}
const DAY = 86_400_000;
const at = (fact: ScorecardFact) => Date.parse(fact.event.occurredAt);
const utcDay = (time: number) => Math.floor(time / DAY);

function rate(numerator: number, denominator: number, state?: "immature" | "delayed"): ScorecardRate {
  if (state) return { state, numerator: null, denominator: null, value: null, smallSample: false };
  return { state: denominator ? "ready" : "empty", numerator, denominator,
    value: denominator ? numerator / denominator : null, smallSample: denominator > 0 && denominator < 30 };
}

/** Deterministic internal calculation. Public readers apply disclosure protection separately. */
export function compileScorecard(input: ScorecardInput): ImprovementSchemas.ImprovementScorecard {
  const from = input.from.getTime(), to = input.to.getTime(), asOf = input.asOf.getTime();
  const through = input.completeThrough.getTime();
  if (![from, to, asOf, through].every(Number.isFinite) || from >= to || to > asOf) {
    throw new RangeError("Scorecard requires a completed finite observation window");
  }
  const seen = new Set<string>();
  const facts = input.facts.filter(fact => {
    const time = at(fact);
    if (!Number.isFinite(time) || time > asOf || seen.has(fact.event.eventId)) return false;
    seen.add(fact.event.eventId);
    return true;
  }).sort((a, b) => at(a) - at(b) || a.event.eventId.localeCompare(b.event.eventId));
  const eligible = facts.filter(fact => fact.conversionEligible);
  const window = eligible.filter(fact => at(fact) >= from && at(fact) < to);
  const delayed = through < to;
  const status = delayed ? "delayed" : window.length ? "ready" : "empty";

  // Integrate current visibility from historical transitions, including the baseline before from.
  const listings = new Map<string, { active: boolean; since: number }>();
  let listingMs = 0;
  for (const fact of eligible) {
    const event = fact.event;
    if (event.eventName !== "listing_visibility_changed") continue;
    const time = at(fact), previous = listings.get(event.payload.listingId);
    if (previous?.active) listingMs += Math.max(0, Math.min(time, to) - Math.max(previous.since, from));
    listings.set(event.payload.listingId, { active: event.payload.visibility === "public", since: time });
  }
  for (const listing of listings.values()) {
    if (listing.active) listingMs += Math.max(0, to - Math.max(listing.since, from));
  }
  const averageActive = listingMs / (to - from);
  const inventory = { listingHours: listingMs / 3_600_000, averageActive,
    currentActive: [...listings.values()].filter(listing => listing.active).length };

  const calls = new Set<string>(), conversations = new Set<string>();
  for (const fact of window) {
    const event = fact.event;
    if (event.eventName === "call_intent") calls.add(JSON.stringify([fact.subject, event.payload.listingId, utcDay(at(fact))]));
    if (event.eventName === "conversation_created") conversations.add(event.payload.conversationId);
  }
  const contactTotal = calls.size + conversations.size;
  const contacts = { calls: calls.size, conversations: conversations.size, total: contactTotal,
    perActiveListing: averageActive > 0 ? contactTotal / averageActive : null };

  const drafts = new Map<string, ScorecardFact>();
  const publications = new Map<string, number>();
  const firstMessages = new Map<string, ScorecardFact>();
  const replies = new Map<string, number>();
  for (const fact of eligible) {
    const event = fact.event;
    if (event.eventName === "draft_started" && !drafts.has(event.payload.draftId)) drafts.set(event.payload.draftId, fact);
    if (event.eventName === "listing_published" && event.payload.draftId && !publications.has(event.payload.draftId)) publications.set(event.payload.draftId, at(fact));
    if (event.eventName === "first_buyer_message_accepted" && !firstMessages.has(event.payload.conversationId)) firstMessages.set(event.payload.conversationId, fact);
    if (event.eventName === "seller_first_reply" && !replies.has(event.payload.firstBuyerMessageId)) replies.set(event.payload.firstBuyerMessageId, at(fact));
  }
  function cohortRate(cohort: ScorecardFact[], horizon: number, succeeded: (fact: ScorecardFact) => boolean) {
    if (delayed) return rate(0, 0, "delayed");
    if (cohort.some(fact => at(fact) + horizon > asOf)) return rate(0, 0, "immature");
    if (cohort.some(fact => at(fact) + horizon > through)) return rate(0, 0, "delayed");
    return rate(cohort.filter(succeeded).length, cohort.length);
  }
  const inWindow = (fact: ScorecardFact) => at(fact) >= from && at(fact) < to;
  const publication = cohortRate([...drafts.values()].filter(inWindow), 7 * DAY, fact => {
    if (fact.event.eventName !== "draft_started") return false;
    const published = publications.get(fact.event.payload.draftId);
    return published !== undefined && published >= at(fact) && published <= at(fact) + 7 * DAY;
  });
  const replyRate = cohortRate([...firstMessages.values()].filter(inWindow), DAY, fact => {
    if (fact.event.eventName !== "first_buyer_message_accepted") return false;
    const reply = replies.get(fact.event.payload.messageId);
    return reply !== undefined && reply >= at(fact) && reply <= at(fact) + DAY;
  });

  const attempts = (name: "sign_in_result" | "media_upload_result") => {
    const outcomes = new Map<string, boolean>();
    for (const fact of window) {
      const event = fact.event;
      if (event.eventName === name && !outcomes.has(event.payload.attemptId)) outcomes.set(event.payload.attemptId, event.payload.result === "success");
    }
    return delayed ? rate(0, 0, "delayed") : rate([...outcomes.values()].filter(Boolean).length, outcomes.size);
  };
  const discovery = { opens: window.filter(fact => fact.event.eventName === "discovery_opened").length,
    searches: window.filter(fact => fact.event.eventName === "search_completed").length,
    detailOpens: window.filter(fact => fact.event.eventName === "listing_detail_opened").length };
  const zeroSearches = window.filter(fact => fact.event.eventName === "search_completed" && fact.event.payload.resultCount === "zero").length;

  const retention = (kind: "account" | "guest", days: number): ScorecardRate => {
    const firstVisit = new Map<string, number>(), activeDays = new Map<string, Set<number>>();
    for (const fact of eligible) {
      if (fact.kind !== kind || !["visit_started", "foreground_activity"].includes(fact.event.eventName)) continue;
      if (!firstVisit.has(fact.subject)) firstVisit.set(fact.subject, at(fact));
      const active = activeDays.get(fact.subject) ?? new Set<number>();
      active.add(utcDay(at(fact))); activeDays.set(fact.subject, active);
    }
    const cohort = [...firstVisit.entries()].filter(([, time]) => time >= from && time < to);
    if (cohort.some(([, time]) => (utcDay(time) + days + 1) * DAY > asOf)) return rate(0, 0, "immature");
    if (delayed || cohort.some(([, time]) => (utcDay(time) + days + 1) * DAY > through)) return rate(0, 0, "delayed");
    return rate(cohort.filter(([subject, time]) => activeDays.get(subject)?.has(utcDay(time) + days)).length, cohort.length);
  };
  const steps = (["vehicle", "specs", "photos", "price", "location", "contact", "review"] as const).map(step => {
    const opened = new Set<string>(), completed = new Set<string>();
    for (const fact of window) {
      const event = fact.event;
      if (event.eventName === "wizard_step_opened" && event.payload.step === step) opened.add(event.payload.draftId);
      if (event.eventName === "wizard_step_result" && event.payload.step === step && event.payload.result === "success") completed.add(event.payload.draftId);
    }
    return { step, opened: opened.size, completed: completed.size };
  });
  return { version: 1 as const, state: status, inventory, contacts, publication, replies: replyRate, steps,
    firstBuyerMessages: [...firstMessages.values()].filter(inWindow).length,
    signIn: attempts("sign_in_result"), upload: attempts("media_upload_result"), discovery,
    zeroSearches: delayed ? rate(0, 0, "delayed") : rate(zeroSearches, discovery.searches),
    retention: { accounts: { d1: retention("account", 1), d7: retention("account", 7), d30: retention("account", 30) },
      guests: { d1: retention("guest", 1), d7: retention("guest", 7), d30: retention("guest", 30) } } };
}
