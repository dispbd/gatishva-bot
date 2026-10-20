// Which chats an outage concerns, and why.
import { skel, skeletonize, findKeys, streetKeys } from "./georgian.ts";
import type { Span } from "./georgian.ts";
import { wanted } from "./types.ts";
import type { Outage, Utility } from "./types.ts";
import { ROADS_CITY } from "./sources/georoad.ts";

export interface Sub {
  id: number;
  chatId: number;
  /** A road subscription matches like a street, but against road notices. */
  kind: "street" | "city" | "road";
  /** City skeleton: "tbilisi". */
  city: string;
  /** What the subscriber typed, shown back to them. */
  label: string;
  /** Skeleton keys, from streetKeys(label); empty for a city. */
  keys: string[];
  /**
   * The districts this street is known to be in, Georgian nominative: learned
   * from notices that list it under a district, or given by the subscriber.
   * It is what lets a fault that cuts a whole district reach a street's
   * subscribers, since such a notice names no streets at all.
   */
  districts?: string[];
}

export const DEFAULT_CITY = "თბილისი";

export function citySkel(city: string): string {
  return skel(city);
}

/** A street subscription as stored: the keys are derived once, at subscription time. */
export function streetSub(label: string, city = DEFAULT_CITY): Omit<Sub, "id" | "chatId"> {
  return { kind: "street", city: citySkel(city), label: label.trim(), keys: streetKeys(label) };
}

/** A road, a pass or a village on one: "Гудаури", "Омало". */
export function roadSub(label: string): Omit<Sub, "id" | "chatId"> {
  return { kind: "road", city: citySkel(ROADS_CITY), label: label.trim(), keys: streetKeys(label) };
}

export function citySub(city: string): Omit<Sub, "id" | "chatId"> {
  return { kind: "city", city: citySkel(city), label: city.trim(), keys: [] };
}

/**
 * The municipalities in a compound service centre, "შუახევი-ქედა",
 * "ახალქალაქი/ნინოწმინდა", as city skeletons; empty for a plain city.
 */
export function cityParts(city: string): string[] {
  const parts = city.split(/\s*[-/]\s*/).filter(Boolean);
  return parts.length > 1 ? parts.map(citySkel) : [];
}

/** "shuahevi" → "shuahev", so "შუახევის" is found too. */
function stemOf(cityKey: string): string {
  return cityKey.length > 4 && /[aeiou]$/.test(cityKey) ? cityKey.slice(0, -1) : cityKey;
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
  const parts = cityParts(o.city);
  const text = haystack(o);
  let sk: ReturnType<typeof skeletonize> | undefined;
  for (const sub of subs) {
    if (sub.city !== city) {
      // Energo's service centre "შუახევი-ქედა" serves two municipalities: a
      // notice of it is Shuakhevi's when its places name Shuakhevi. Not its
      // text, which starts with the centre's name and so names both.
      if (!parts.includes(sub.city)) continue;
      if (findKeys(o.addresses.join("\n"), [stemOf(sub.city)]).length === 0) continue;
    }
    if (!wanted(o.utility, utilitiesOf(sub.chatId))) continue;
    // A weather warning covers the whole municipality: anyone following a
    // street or the city there gets it, no street matching needed.
    if (o.utility === "weather") {
      if (sub.kind === "road") continue;
    } else if (sub.kind === "street" || sub.kind === "road") {
      sk ??= skeletonize(text);
      if (!o.wholeCity && findKeys(text, sub.keys, sk).length === 0 && !inCutDistrict(o, sub)) continue;
    }
    const list = out.get(sub.chatId) ?? [];
    list.push(sub);
    out.set(sub.chatId, list);
  }
  return out;
}

/** The districts an outage cuts as a whole, or none if it lists streets. */
export function cutDistricts(o: Outage): string[] {
  if (!o.wholeDistricts) return [];
  return o.districts ?? (o.district ? [o.district] : []);
}

/** Whether a street subscription lies in a district the outage cuts whole. */
export function inCutDistrict(o: Outage, sub: Sub): boolean {
  const cut = cutDistricts(o);
  return cut.length > 0 && (sub.districts ?? []).some((d) => cut.some((c) => sameDistrict(c, d)));
}

/**
 * Whether two district names overlap. Providers carve the city differently:
 * Telasi says "სოლოლაკ-მთაწმინდა-კრწანისი" where GWP says "მთაწმინდა", so a
 * compound name matches any of its parts. Parts compare by skeleton, and one
 * may be a prefix of the other — "სოლოლაკ" is "სოლოლაკი" without its ending.
 */
export function sameDistrict(a: string, b: string): boolean {
  const pa = a.split("-").map(skel);
  const pb = b.split("-").map(skel);
  return pa.some((x) =>
    pb.some((y) => x === y || (Math.min(x.length, y.length) >= 5 && (x.startsWith(y) || y.startsWith(x)))),
  );
}

/**
 * The district a notice places this street in, if it does: one that lists
 * streets and names exactly one district. Read from the address list only —
 * a notice's preamble names the place of the works, which may be next door.
 */
export function learnedDistrict(o: Outage, sub: Sub): string | undefined {
  if (sub.kind !== "street" || sub.city !== citySkel(o.city)) return undefined;
  if (!o.district || o.districts || o.wholeDistricts || o.addresses.length === 0) return undefined;
  return findKeys(o.addresses.join(", "), sub.keys).length > 0 ? o.district : undefined;
}

/** Where the given subscriptions' streets appear in `text`, for highlighting. */
export function highlightSpans(text: string, subs: Sub[]): Span[] {
  const keys = subs.flatMap((s) => s.keys);
  return keys.length ? findKeys(text, keys) : [];
}
