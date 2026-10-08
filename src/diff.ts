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
  if (live) return true;
  if (o.end !== undefined && o.end > now) return true;
  if (o.publishedAt !== undefined && o.publishedAt > now - NEWS_WINDOW_SEC) return true;
  if (o.end === undefined && o.start !== undefined) return o.start > now - NEWS_WINDOW_SEC;
  return false;
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
