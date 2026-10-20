// Cities a subscriber may name, and how to tell a city from a street in
// "/add Батуми, Руставели".
import { skel } from "./georgian.ts";

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
  // The rest of the municipalities, so a notice that names one is understood.
  "ხელვაჩაური", "ქედა", "შუახევი", "ხულო", "ჩოხატაური", "ბაღდათი", "ვანი", "თერჯოლა",
  "საჩხერე", "ხარაგაული", "დედოფლისწყარო", "თიანეთი", "ყაზბეგი", "ლენტეხი", "ცაგერი",
  "აბაშა", "მარტვილი", "ჩხოროწყუ", "წალენჯიხა", "ადიგენი", "ასპინძა", "ქარელი",
];

/** "ჭიათურა" → "ჭიათურის", "თეთრიწყარო" → "თეთრიწყაროს": as in "…ის მუნიციპალიტეტში". */
function genitive(city: string): string {
  return /[ია]$/.test(city) ? `${city.slice(0, -1)}ის` : `${city}ს`;
}

/** The municipality a genitive names, "ქობულეთის" → "ქობულეთი". */
export function cityOfGenitive(word: string): string | undefined {
  return KNOWN_CITIES.find((c) => genitive(c) === word);
}

/** The known city a typed name refers to, by skeleton, or undefined. */
export function resolveCity(typed: string, known: string[]): string | undefined {
  const k = skel(typed);
  if (k.length < 3) return undefined;
  const all = [...new Set([...known, ...KNOWN_CITIES])];
  return all.find((c) => skel(c) === k) ?? all.find((c) => skel(c).startsWith(k) && k.length >= 4);
}

/**
 * Tbilisi's districts as the providers name them, nominative. Telasi also uses
 * compounds of these ("მთაწმინდა-კრწანისი"), which match any of their parts.
 */
export const TBILISI_DISTRICTS = [
  "გლდანი", "ნაძალადევი", "დიდუბე", "ჩუღურეთი", "საბურთალო", "ვაკე", "მთაწმინდა",
  "კრწანისი", "ისანი", "სამგორი", "ვარკეთილი", "დიღომი", "სოლოლაკი", "ავლაბარი",
];

/** The Tbilisi district a typed name refers to, by skeleton, or undefined. */
export function resolveDistrict(typed: string): string | undefined {
  const k = skel(typed);
  if (k.length < 3) return undefined;
  return TBILISI_DISTRICTS.find((d) => skel(d) === k) ?? TBILISI_DISTRICTS.find((d) => k.length >= 4 && skel(d).startsWith(k));
}

/**
 * "Политковская, Мтацминда": a street and the district it is in, for when the
 * bot has not yet seen the street in any notice. Anything after the comma that
 * is not a district stays part of the street ("Политковская, 32").
 */
export function splitStreetDistrict(text: string): { street: string; district?: string } {
  const m = /^\s*(.+?)\s*,\s*([^,]+?)\s*$/.exec(text);
  const district = m ? resolveDistrict(m[2]!) : undefined;
  return district ? { street: m![1]!, district } : { street: text.trim() };
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
