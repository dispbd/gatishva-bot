// Pure decisions the Hub makes on every poll, kept out of the Durable Object so
// they can be tested without one.
import type { Outage } from "./types.ts";

/**
 * What about an outage counts as "it changed": a re-read notice with a new
 * restoration estimate or a longer street list is edited in place in every chat
 * that has it. The provider's padding and link do not count.
 */
export function fingerprint(o: Outage): string {
  return JSON.stringify([o.text, o.start ?? 0, o.end ?? 0, o.emergency, o.addresses.length]);
}

/** How long after publication an outage with no end time still counts as news. */
export const NEWS_WINDOW_SEC = 3 * 3600;

/**
 * Whether an outage is still worth telling someone about. A notice for works
 * that ended yesterday is history, not news.
 *
 * The exception is an emergency whose estimate passed before it was even
 * published — Telasi's usual case. The estimate is the provider's guess; the
 * notice is fresh, and the lights may well still be off.
 */
export function isCurrent(o: Outage, now: number, live: boolean): boolean {
  return currentUntil(o, live) > now;
}

/** "Current until the provider says otherwise": what a live list's items get. */
export const UNTIL_FINISHED = Number.MAX_SAFE_INTEGER;

/**
 * The moment an outage stops being current, by the rules isCurrent states —
 * stored with each outage and indexed, so that "what is going on now" is a
 * range query instead of parsing every notice the archives ever held.
 *
 * Current means any of: on a live list; not yet at its end; published within
 * the news window; or, with no end at all, started within it. So it is current
 * until the latest of those moments; 0 when none applies.
 */
export function currentUntil(o: Outage, live: boolean): number {
  if (live) return UNTIL_FINISHED;
  return Math.max(
    0,
    o.end ?? 0,
    o.publishedAt !== undefined ? o.publishedAt + NEWS_WINDOW_SEC : 0,
    o.end === undefined && o.start !== undefined ? o.start + NEWS_WINDOW_SEC : 0,
  );
}

/**
 * A live item that is missing from one answer may be a hiccup on the provider's
 * side; missing from this many answers in a row, it is over.
 */
export const MISSES_TO_FINISH = 2;

/** The middle value; for lag statistics. */
export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2;
}

/** SHA-256 of a source's raw answer; an unchanged answer is not parsed at all. */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
