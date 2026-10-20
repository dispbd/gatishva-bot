// What a typed address may mean, for the subscriber to confirm. "Бакуриани" is
// a street in Tbilisi and a resort in Borjomi; "Ахалдаба" a Tbilisi suburb and
// villages near Gori and Borjomi; "Руставели" may be streets in two Tbilisi
// districts. When the notices of the last month leave more than one reading,
// the bot asks instead of guessing; when they leave one, it subscribes and
// still offers "not this one".
import { findKeys } from "./georgian.ts";
import { resolveCity } from "./cities.ts";
import { parsePlace } from "./places.ts";
import type { PlaceQuery, Settlement } from "./places.ts";
import { matchOutage, streetSub, placeSub, citySkel, cityParts } from "./match.ts";
import type { Sub } from "./match.ts";
import type { Outage, Utility } from "./types.ts";

/** One reading, with what the notices say about it. */
export interface Candidate extends PlaceQuery {
  /** How many notices of the last month it matched. */
  count: number;
  /** One of the addresses it matched, as published (Georgian). */
  example?: string;
  /**
   * The district was read off the notices, not typed: pinned only when the
   * subscriber picks this reading, since one notice is thin evidence.
   */
  inferred?: boolean;
}

/** A reading of a lone city name: the whole city. */
export function isWholeCity(q: PlaceQuery): boolean {
  return !q.place && !q.street;
}

/** At most this many readings are offered; the keyboard stays short. */
export const MAX_CANDIDATES = 5;

const ALL: Utility[] = ["water", "power", "gas"];

/** Every way to read the text: the likeliest first, then the namesakes. */
export function readings(
  text: string,
  known: string[],
  settlements: (name: string) => Settlement[],
  tbilisiStreet: (name: string) => boolean,
  defaultCity: string,
): PlaceQuery[] {
  const base = parsePlace(text, known, settlements, tbilisiStreet, defaultCity);
  const out: PlaceQuery[] = [base];
  // "Казбеги" is a municipality and Tbilisi's Kazbegi Avenue.
  if (isWholeCity(base) && base.city !== defaultCity) out.push({ city: defaultCity, street: text.trim() });
  const parts = text.split(/\s*[,:]\s*/).map((p) => p.trim()).filter(Boolean);
  const head = parts[0] ?? "";
  if (head && !resolveCity(head, known)) {
    const street = parts.slice(1).join(", ") || undefined;
    for (const s of settlements(head)) {
      // A Tbilisi suburb alone reads the same as the Tbilisi street reading.
      if (s.city === defaultCity && !street) continue;
      out.push({ city: s.city, place: s.name, street });
    }
  }
  const seen = new Set<string>();
  return out.filter((q) => {
    const k = `${q.city}|${q.place ?? ""}|${q.street ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The subscription a reading stands for. */
export function subOf(q: PlaceQuery, label: string): Omit<Sub, "id" | "chatId"> {
  return q.place ? placeSub(label, q.city, q.place, q.street) : streetSub(q.street ?? "", q.city);
}

/**
 * Each reading with its evidence. A Tbilisi street seen under several
 * districts becomes one candidate per district: picking one pins it, so a
 * fault that cuts that district whole reaches the street too.
 */
export function candidates(qs: PlaceQuery[], events: Outage[], defaultCity: string): Candidate[] {
  const out: Candidate[] = [];
  for (const q of qs) {
    if (isWholeCity(q)) {
      const city = citySkel(q.city);
      out.push({ ...q, count: events.filter((o) => citySkel(o.city) === city || cityParts(o.city).includes(city)).length });
      continue;
    }
    const sub: Sub = { id: -1, chatId: -1, ...subOf(q, q.street ?? q.place ?? "") };
    if (sub.keys.length === 0) continue;
    const hits = events.filter((o) => matchOutage(o, [sub], () => ALL).size > 0);
    const example = (o: Outage) => o.addresses.find((a) => findKeys(a, sub.keys).length > 0);
    if (q.place || q.city !== defaultCity || q.district) {
      out.push({ ...q, count: hits.length, example: hits.map(example).find(Boolean) });
      continue;
    }
    // By district, where a notice names exactly one.
    const byDistrict = new Map<string, Outage[]>();
    for (const o of hits) {
      const d = o.districts && o.districts.length > 1 ? undefined : o.district;
      if (!d) continue;
      byDistrict.set(d, [...(byDistrict.get(d) ?? []), o]);
    }
    if (byDistrict.size <= 1) {
      const [district] = [...byDistrict.keys()];
      out.push({
        ...q, ...(district ? { district, inferred: true } : {}), count: hits.length, example: hits.map(example).find(Boolean),
      });
      continue;
    }
    for (const [district, list] of byDistrict) {
      out.push({ ...q, district, inferred: true, count: list.length, example: list.map(example).find(Boolean) });
    }
  }
  // The readings with evidence first. One no notice named lately stays on
  // offer, last: "Казбеги" is the municipality and Tbilisi's avenue whether
  // or not either had an outage this month.
  return out.sort((a, b) => b.count - a.count).slice(0, MAX_CANDIDATES);
}

/** Several readings the notices support: ask. One or none: subscribe. */
export function needsChoice(list: Candidate[]): boolean {
  return list.length > 1;
}
