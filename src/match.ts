// Which chats an outage concerns, and why.
import { skel, skeletonize, findKeys, streetKeys } from "./georgian.ts";
import type { Span } from "./georgian.ts";
import type { Outage, Utility } from "./types.ts";

export interface Sub {
  id: number;
  chatId: number;
  kind: "street" | "city";
  /** City skeleton: "tbilisi". */
  city: string;
  /** What the subscriber typed, shown back to them. */
  label: string;
  /** Skeleton keys, from streetKeys(label); empty for a city. */
  keys: string[];
}

export const DEFAULT_CITY = "თბილისი";

export function citySkel(city: string): string {
  return skel(city);
}

/** A street subscription as stored: the keys are derived once, at subscription time. */
export function streetSub(label: string, city = DEFAULT_CITY): Omit<Sub, "id" | "chatId"> {
  return { kind: "street", city: citySkel(city), label: label.trim(), keys: streetKeys(label) };
}

export function citySub(city: string): Omit<Sub, "id" | "chatId"> {
  return { kind: "city", city: citySkel(city), label: city.trim(), keys: [] };
}

/** The text a subscription is matched against: headline and body together. */
export function haystack(o: Outage): string {
  return o.title && !o.text.includes(o.title) ? `${o.title}\n${o.text}` : o.text;
}

/**
 * The subscriptions an outage satisfies, grouped by chat. `utilitiesOf` gives a
 * chat's chosen utilities; a chat that turned gas off hears nothing about gas.
 */
export function matchOutage(
  o: Outage,
  subs: Sub[],
  utilitiesOf: (chatId: number) => Utility[],
): Map<number, Sub[]> {
  const out = new Map<number, Sub[]>();
  const city = citySkel(o.city);
  const text = haystack(o);
  let sk: ReturnType<typeof skeletonize> | undefined;
  for (const sub of subs) {
    if (sub.city !== city) continue;
    if (!utilitiesOf(sub.chatId).includes(o.utility)) continue;
    if (sub.kind === "street") {
      sk ??= skeletonize(text);
      if (findKeys(text, sub.keys, sk).length === 0) continue;
    }
    const list = out.get(sub.chatId) ?? [];
    list.push(sub);
    out.set(sub.chatId, list);
  }
  return out;
}

/** Where the given subscriptions' streets appear in `text`, for highlighting. */
export function highlightSpans(text: string, subs: Sub[]): Span[] {
  const keys = subs.flatMap((s) => s.keys);
  return keys.length ? findKeys(text, keys) : [];
}
