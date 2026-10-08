// Cities a subscriber may name, and how to tell a city from a street in
// "/add Батуми, Руставели".
import { skel, translitRu } from "./georgian.ts";

/**
 * The places outages are published for, as the providers write them. Regional
 * providers name municipalities and service centres; this list is only the
 * well-known ones, and the Hub adds every place it actually sees.
 */
export const KNOWN_CITIES = [
  "თბილისი", "ბათუმი", "ქუთაისი", "რუსთავი", "გორი", "ზუგდიდი", "ფოთი", "ქობულეთი",
  "ხაშური", "სამტრედია", "სენაკი", "ზესტაფონი", "მარნეული", "თელავი", "ახალციხე",
  "ოზურგეთი", "კასპი", "ჭიათურა", "გარდაბანი", "ბორჯომი", "საგარეჯო", "მცხეთა",
  "გურჯაანი", "ყვარელი", "სიღნაღი", "ახმეტა", "ლაგოდეხი", "დუშეთი", "წყალტუბო",
  "ტყიბული", "ბაკურიანი", "ახალქალაქი", "ნინოწმინდა", "წალკა", "თეთრიწყარო",
  "ბოლნისი", "დმანისი", "ხობი", "მესტია", "ამბროლაური", "ონი", "ლანჩხუთი", "ხონი",
];

/** Russian name for a Georgian city name. */
export function cityRu(city: string): string {
  return translitRu(city);
}

/** The known city a typed name refers to, by skeleton, or undefined. */
export function resolveCity(typed: string, known: string[]): string | undefined {
  const k = skel(typed);
  if (k.length < 3) return undefined;
  const all = [...new Set([...known, ...KNOWN_CITIES])];
  return all.find((c) => skel(c) === k) ?? all.find((c) => skel(c).startsWith(k) && k.length >= 4);
}

/**
 * Split "Батуми, Руставели" / "Батуми: Руставели" into city and street. Without
 * a recognisable city in front, the whole text is a street in Tbilisi.
 */
export function splitCityStreet(text: string, known: string[]): { city?: string; street: string } {
  const m = /^\s*([^,:]+?)\s*[,:]\s*(.+)$/.exec(text);
  if (m) {
    const city = resolveCity(m[1]!, known);
    if (city) return { city, street: m[2]!.trim() };
  }
  return { street: text.trim() };
}
