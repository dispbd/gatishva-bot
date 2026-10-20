// Villages and small towns. The providers publish by municipality or service
// centre — Bakuriani's power is Energo's "ბორჯომი", Kulashi's gas SOCAR's
// "სამტრედია" — while a subscriber names the place they live in. So the bot
// learns from the notices themselves which settlement lies in which
// municipality, and a subscription to "Бакуриани, Гоголадзе" becomes the street
// Gogoladze in Borjomi, in a notice that also names Bakuriani.
import { streetKeys, toNominative } from "./georgian.ts";
import { resolveCity, splitStreetDistrict } from "./cities.ts";
import type { Outage } from "./types.ts";

export interface Settlement {
  /** Georgian, nominative: "ბაკურიანი". */
  name: string;
  /** The municipality the providers file it under: "ბორჯომი". */
  city: string;
  /** How many notices named it, so the likelier of two namesakes wins. */
  seen: number;
}

/**
 * Settlements known before any notice names them, so a subscriber is
 * understood from the first day. Only certain ones.
 */
export const KNOWN_SETTLEMENTS: [string, string][] = [
  ["ბაკურიანი", "ბორჯომი"], ["აბასთუმანი", "ადიგენი"], ["საირმე", "ბაღდათი"], ["შოვი", "ონი"],
  ["ურეკი", "ოზურგეთი"], ["ჩაქვი", "ქობულეთი"], ["გონიო", "ხელვაჩაური"], ["სარფი", "ხელვაჩაური"],
  ["კვარიათი", "ხელვაჩაური"], ["წინანდალი", "თელავი"], ["სტეფანწმინდა", "ყაზბეგი"],
  ["წყნეთი", "თბილისი"], ["კოჯორი", "თბილისი"], ["ტაბახმელა", "თბილისი"], ["შინდისი", "თბილისი"],
  ["ოქროყანა", "თბილისი"], ["წავკისი", "თბილისი"], ["ახალდაბა", "თბილისი"],
];

/** The key a settlement is looked up by: the stem of its name, in any script. */
export function placeKey(name: string): string {
  return streetKeys(name)[0] ?? "";
}

const MODIFIER = "(?:ქვემო|ზემო|ზედა|შუა|ახალი|ძველი|დიდი|პატარა)\\s+";
/**
 * "სოფ. ჭოლევი", "სოფელი დიღომი", "ს. ნორიო", "დაბა კულაში", "(სოფ.ახალდაბა)".
 * The marker is a word of its own: "დაბაკნეთის" is a street, not Daba Kneti.
 */
const MARKED = new RegExp(
  `(?:^|[\\s(,.;])(?:სოფელი\\s+|სოფ\\.\\s*|სოფ\\s+|ს\\.\\s*|დაბა\\s+)((?:${MODIFIER})?[ა-ჿ-]{3,})`,
  "g",
);

/** The settlements a notice names, Georgian nominative. */
export function settlementsOf(o: Outage): string[] {
  if (o.utility === "road" || o.utility === "weather" || o.reports) return [];
  const found = new Set<string>();
  for (const a of o.addresses) {
    for (const m of a.matchAll(MARKED)) {
      const name = m[1]!;
      const after = a.slice(m.index! + m[0].length);
      // "ს. ხიმშიაშვილის ქ" is S. Khimshiashvili Street, not a village.
      if (m[0].trim().startsWith("ს.") && /ს$/.test(name) && /(^|\s)ქ(\.|უჩ|\s|$)/.test(after)) continue;
      found.add(nominative(name));
    }
  }
  // Energo's paths say outright which step is a settlement (energoSettlement).
  for (const s of o.settlements ?? []) found.add(s);
  return [...found].filter((n) => n !== o.city && placeKey(n).length >= 3);
}

function nominative(name: string): string {
  const words = name.split(/\s+/);
  words[words.length - 1] = toNominative(words[words.length - 1]!);
  return words.join(" ");
}

/** What a subscriber typed, read as a place: municipality, settlement, street. */
export interface PlaceQuery {
  /** Georgian municipality; Tbilisi when nothing else is named. */
  city: string;
  /** Georgian settlement within it, when one is named. */
  place?: string;
  /** The street as typed, if any. */
  street?: string;
  /** The subscriber's own word on the Tbilisi district. */
  district?: string;
}

/**
 * Read "Батуми, Руставели", "Бакуриани, Гоголадзе", "Хоби, Ноджихеви",
 * "Ноджихеви", "Дигоми, Месхи" or plain "Руставели".
 *
 * `known` are the municipalities in the data; `settlements` looks a name up.
 * `tbilisiStreet` says whether a lone word is a street Tbilisi's notices have
 * named: a street there wins over a village of the same name elsewhere.
 */
export function parsePlace(
  text: string,
  known: string[],
  settlements: (name: string) => Settlement[],
  tbilisiStreet: (name: string) => boolean,
  defaultCity: string,
): PlaceQuery {
  const parts = text.split(/\s*[,:]\s*/).map((p) => p.trim()).filter(Boolean);
  // Of namesakes, Tbilisi's first — most subscribers live there, and a lone
  // word then stays the Tbilisi street it always was — then the most named.
  const likeliest = (list: Settlement[]) =>
    [...list].sort((a, b) => Number(b.city === defaultCity) - Number(a.city === defaultCity) || b.seen - a.seen)[0];
  let city: string | undefined;
  let place: string | undefined;
  let rest = parts;

  const head = parts[0] ?? "";
  const asCity = resolveCity(head, known);
  const asPlace = asCity ? undefined : likeliest(settlements(head));
  if (asCity) {
    city = asCity;
    rest = parts.slice(1);
  } else if (asPlace && (parts.length > 1 || asPlace.city !== defaultCity) && !(parts.length === 1 && tbilisiStreet(head))) {
    city = asPlace.city;
    place = asPlace.name;
    rest = parts.slice(1);
  }
  // "Боржоми, Бакуриани, Гоголадзе": a settlement right after the municipality.
  if (city && !place && rest.length >= 1) {
    const inside = settlements(rest[0]!).find((s) => s.city === city);
    if (inside && (rest.length > 1 || city !== defaultCity)) {
      place = inside.name;
      rest = rest.slice(1);
    }
  }
  const street = rest.join(", ") || undefined;
  if (!city && street) {
    // Tbilisi, as always: "Политковская, Мтацминда" names the district.
    const { street: name, district } = splitStreetDistrict(street);
    return { city: defaultCity, street: name, district };
  }
  return { city: city ?? defaultCity, place, street };
}
