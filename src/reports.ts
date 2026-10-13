// Residents' own reports: "there is no water on my street".
//
// One person's report is not a fact — their own tap, a prank, a misread — and
// a bot that broadcasts it spreads alarm, not news. So, as Downdetector and
// Waze do it, nobody is told about one report. A *signal* goes out when enough
// different people report the same utility on the same street within a short
// window, it says plainly that it is unconfirmed, and it is marked confirmed
// when a provider publishes the same outage — which also measures how much
// sooner residents knew.
//
// Only water, power and gas for now. Fires and landslides need a moderator
// before anything is sent, and a reminder that the bot is not 112.
import { streetKeys, findKeys } from "./georgian.ts";
import { haystack } from "./match.ts";
import type { Outage, SourceDef, Utility } from "./types.ts";

/** Different people needed on one street before neighbours are told. */
export const REPORT_THRESHOLD = 3;
/** The window those reports must fall in. */
export const REPORT_WINDOW_SEC = 30 * 60;
/** One person may report this much in a day; beyond it, thanks and nothing. */
export const REPORTS_PER_DAY = 10;
/** The same person on the same street and utility counts once in this long. */
export const REPORT_REPEAT_SEC = 2 * 3600;

export interface Report {
  userId: number;
  utility: Utility;
  /** City skeleton, as subscriptions keep it. */
  city: string;
  /** What the reporter called the street. */
  label: string;
  created: number;
}

/** The key a report is grouped by: the street's first skeleton key. */
export function streetStem(label: string): string | undefined {
  return streetKeys(label)[0];
}

/**
 * Whether two labels name the same street. Their keys are compared both ways,
 * so "Политковская" and "ანა პოლიტკოვსკაია" agree although one has a first name.
 */
export function sameStreet(a: string, b: string): boolean {
  const ka = streetKeys(a);
  const kb = streetKeys(b);
  return findKeys(b, ka).length > 0 || findKeys(a, kb).length > 0;
}

/**
 * The reports on this street, utility and city in the window before `now`,
 * from different people: what decides whether a signal goes out.
 */
export function reportersFor(reports: Report[], r: Omit<Report, "userId" | "created">, now: number): number {
  const users = new Set<number>();
  for (const x of reports) {
    if (x.utility !== r.utility || x.city !== r.city) continue;
    if (x.created <= now - REPORT_WINDOW_SEC) continue;
    if (sameStreet(x.label, r.label)) users.add(x.userId);
  }
  return users.size;
}

export interface Signal {
  key: string;
  utility: Utility;
  /** Georgian city name. */
  city: string;
  label: string;
  /** Different people so far. */
  count: number;
  /** The first report in the signal. */
  since: number;
  confirmedBy?: string;
  confirmedAt?: number;
}

/** A signal as an outage, so it travels the same path as a provider's. */
export function signalOutage(s: Signal): Outage {
  return {
    key: s.key,
    source: REPORTS.name,
    provider: "residents",
    utility: s.utility,
    city: s.city,
    emergency: true,
    publishedAt: s.since,
    text: s.label,
    addresses: [s.label],
    url: "",
    reports: { count: s.count, since: s.since, confirmedBy: s.confirmedBy, confirmedAt: s.confirmedAt },
  };
}

/** Whether a provider's outage is the one a signal was about. */
export function confirms(official: Outage, signal: Outage): boolean {
  if (official.source === REPORTS.name || official.utility !== signal.utility) return false;
  if (official.city !== signal.city) return false;
  const keys = streetKeys(signal.text);
  return findKeys(haystack(official), keys).length > 0;
}

/**
 * The pseudo-source signals are filed under. It is never polled: signals are
 * written as reports arrive. Not live either — a signal is not "over" when it
 * stops being refreshed, it simply ages out of being news.
 */
export const REPORTS: SourceDef = {
  name: "reports",
  everySec: Number.MAX_SAFE_INTEGER,
  live: () => false,
  fetchRaw: async () => "[]",
  parse: () => [],
};
